const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const port = Number(process.env.PORT || 5173);
const root = __dirname;
const marketFetchTimeout = 4500;
const sheetFetchTimeout = 15000;
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);

    if (requestUrl.pathname === "/api/sheet") {
      await handleSheetRequest(requestUrl, res);
      return;
    }

    if (requestUrl.pathname === "/api/proxy") {
      await handleProxyRequest(requestUrl, res);
      return;
    }

    serveStatic(requestUrl.pathname, res);
  } catch (error) {
    console.error(error);
    sendText(res, 500, "伺服器發生錯誤");
  }
});

server.listen(port, () => {
  console.log(`Dashboard 已啟動：http://localhost:${port}`);
});

async function handleSheetRequest(requestUrl, res) {
  const sheetUrl = requestUrl.searchParams.get("sheetUrl") || "";
  const gid = requestUrl.searchParams.get("gid") || "0";
  const sheetName = requestUrl.searchParams.get("sheetName") || "";
  const sheetId = extractSheetId(sheetUrl);

  if (!sheetId) {
    sendText(res, 400, "無法解析 Google Sheet 網址");
    return;
  }

  const csvUrl = sheetName
    ? `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`
    : `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${encodeURIComponent(gid)}`;
  let csv = "";

  try {
    csv = await fetchText(csvUrl, sheetFetchTimeout);
  } catch (error) {
    if (error.statusCode === 401 || error.statusCode === 403) {
      sendText(res, 403, "Google Sheet 尚未開放連結檢視，請將分享權限改為「知道連結的任何人可檢視」");
      return;
    }
    throw error;
  }

  if (looksLikeHtml(csv)) {
    sendText(res, 403, "Google Sheet 目前可能不是公開可檢視，請調整分享權限後再同步");
    return;
  }

  res.writeHead(200, {
    "content-type": "text/csv; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(csv);
}

async function handleProxyRequest(requestUrl, res) {
  const target = requestUrl.searchParams.get("url") || "";
  let targetUrl;

  try {
    targetUrl = new URL(target);
  } catch {
    sendText(res, 400, "無法解析代理網址");
    return;
  }

  const allowedHosts = new Set(["mis.twse.com.tw", "stooq.com", "query1.finance.yahoo.com"]);
  if (!allowedHosts.has(targetUrl.hostname)) {
    sendText(res, 403, "此代理僅允許行情資料來源");
    return;
  }

  const body = await fetchText(targetUrl.toString(), marketFetchTimeout);
  res.writeHead(200, {
    "content-type": targetUrl.hostname === "stooq.com" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  });
  res.end(body);
}

function serveStatic(pathname, res) {
  const decodedPath = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  const filePath = path.join(root, decodedPath);

  if (!filePath.startsWith(root)) {
    sendText(res, 403, "禁止存取");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendText(res, 404, "找不到檔案");
      return;
    }

    const type = mimeTypes[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    res.end(content);
  });
}

function extractSheetId(sheetUrl) {
  const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : "";
}

async function fetchText(url, timeout = marketFetchTimeout) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const targetUrl = new URL(url);
  const headers =
    targetUrl.hostname === "query1.finance.yahoo.com"
      ? {}
      : {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
          accept: "text/csv,application/json,text/plain,*/*",
        };
  try {
    const response = await fetch(url, {
      headers,
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error(`外部資料來源回應錯誤：${response.status}`);
      error.statusCode = response.status;
      throw error;
    }
    return response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

function looksLikeHtml(content) {
  return /^\s*<!doctype html|^\s*<html/i.test(content);
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(message);
}
