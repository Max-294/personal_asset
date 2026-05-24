const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");

const port = Number(process.env.PORT || 5173);
const root = __dirname;
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
    csv = await fetchText(csvUrl);
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

function fetchText(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        const location = response.headers.location;
        if (response.statusCode >= 300 && response.statusCode < 400 && location) {
          if (redirectCount >= 5) {
            reject(new Error("Google Sheet 重新導向次數過多"));
            return;
          }
          resolve(fetchText(new URL(location, url).toString(), redirectCount + 1));
          return;
        }

        if (response.statusCode < 200 || response.statusCode >= 300) {
          const error = new Error(`Google Sheet 回應錯誤：${response.statusCode}`);
          error.statusCode = response.statusCode;
          reject(error);
          return;
        }

        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => resolve(body));
      })
      .on("error", reject);
  });
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
