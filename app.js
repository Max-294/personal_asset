const sampleRows = [
  { assetClass: "台股", assetName: "0050 元大台灣 50", account: "永豐證券", quantity: 42, price: 168.2, value: 7064.4, currency: "TWD" },
  { assetClass: "美股", assetName: "VOO", account: "海外券商", quantity: 12, price: 486.5, value: 5838, currency: "USD" },
  { assetClass: "現金", assetName: "活存", account: "薪轉戶", quantity: 1, price: 280000, value: 280000, currency: "TWD" },
  { assetClass: "債券", assetName: "投資級債 ETF", account: "海外券商", quantity: 80, price: 28.6, value: 2288, currency: "USD" },
  { assetClass: "基金", assetName: "全球科技基金", account: "銀行信託", quantity: 350, price: 21.4, value: 7490, currency: "TWD" },
];

const palette = ["#123c34", "#b89455", "#4f7466", "#8a5f37", "#6b7f93", "#9f6c64", "#2f5f52"];
const numericSortKeys = new Set([
  "quantity",
  "price",
  "value",
  "baseValue",
  "cost",
  "proceeds",
  "dividend",
  "returnRate",
  "dateValue",
  "grossAsset",
  "difference",
  "postOffice",
  "ctbc",
  "cathay",
  "cash",
  "loanBalance",
  "netAsset",
]);
const dataSources = {
  monthlyAssets: {
    sheetUrl:
      "https://docs.google.com/spreadsheets/d/1INZO4qzBoqy3WeKf-YQIrQW5VApO9hz8_FT4ewvvtT8/edit?gid=1172399332#gid=1172399332",
    sheetName: "總資產變化(月初)-網銀",
    gid: "1172399332",
  },
  taiwan: {
    sheetUrl:
      "https://docs.google.com/spreadsheets/d/12a5EjY2Vu85PiKG22ptPsNVg9h8srtAtqGRQmyRVjko/edit?pli=1&gid=629946088#gid=629946088",
    sheetName: "本年度股利試算",
    gid: "629946088",
  },
  foreign: {
    sheetUrl:
      "https://docs.google.com/spreadsheets/d/1INZO4qzBoqy3WeKf-YQIrQW5VApO9hz8_FT4ewvvtT8/edit?gid=1172399332#gid=1172399332",
    sheetName: "外幣帳戶整理",
    gid: "1172399332",
  },
  usSummary: {
    sheetUrl:
      "https://docs.google.com/spreadsheets/d/1INZO4qzBoqy3WeKf-YQIrQW5VApO9hz8_FT4ewvvtT8/edit?gid=1172399332#gid=1172399332",
    sheetName: "美股Summary",
    gid: "1172399332",
  },
  realizedTaiwan: {
    sheetUrl:
      "https://docs.google.com/spreadsheets/d/1INZO4qzBoqy3WeKf-YQIrQW5VApO9hz8_FT4ewvvtT8/edit?gid=1172399332#gid=1172399332",
    sheetName: "股票損益(已實現)－台股",
    gid: "1172399332",
  },
  realizedTaiwanWarrant: {
    sheetUrl:
      "https://docs.google.com/spreadsheets/d/1INZO4qzBoqy3WeKf-YQIrQW5VApO9hz8_FT4ewvvtT8/edit?gid=1172399332#gid=1172399332",
    sheetName: "權證紀錄",
    gid: "1172399332",
  },
  realizedTaiwanMacronix: {
    sheetUrl:
      "https://docs.google.com/spreadsheets/d/12a5EjY2Vu85PiKG22ptPsNVg9h8srtAtqGRQmyRVjko/edit?pli=1&gid=629946088#gid=629946088",
    sheetName: "「2337旺宏」的副本",
    gid: "629946088",
  },
};
let currentRows = [];
let currentView = "overview";
let usdToTwdRate = 1;
let viewData = {
  overview: [],
  holdings: [],
  realizedTw: [],
  realizedUs: [],
};
let dailyProfitState = {
  status: "idle",
  taiwan: null,
  us: null,
};
let dailyProfitRequestId = 0;
let tableSort = {
  key: "dateValue",
  direction: "desc",
};
let privacyMode = localStorage.getItem("assetDashboardPrivacy") === "hidden";

const viewConfigs = {
  overview: {
    statusName: "資產總覽",
    primaryLabel: "最新淨資產",
    secondLabel: "月初資產",
    thirdLabel: "貸款餘額",
    fourthLabel: "本月變化",
    allocationTitle: "最新資產組成",
    barTitle: "每月資產變化",
    barSubtitle: "總資產與淨資產",
    detailTitle: "月度資產紀錄",
    totalLabel: (value) => formatMoney(value),
    defaultSort: { key: "dateValue", direction: "desc" },
    tableColumns: [
      { key: "dateLabel", label: "日期" },
      { key: "grossAsset", label: "月初資產", numeric: true, render: (row) => formatMoney(row.grossAsset) },
      { key: "difference", label: "與上月差異", numeric: true, render: (row) => formatSignedMoney(row.difference) },
      { key: "postOffice", label: "郵局", numeric: true, render: (row) => formatMoney(row.postOffice) },
      { key: "ctbc", label: "中國信託", numeric: true, render: (row) => formatMoney(row.ctbc) },
      { key: "cathay", label: "國泰世華", numeric: true, render: (row) => formatMoney(row.cathay) },
      { key: "cash", label: "現金", numeric: true, render: (row) => formatMoney(row.cash) },
      { key: "loanBalance", label: "貸款餘額", numeric: true, render: (row) => formatMoney(row.loanBalance) },
      { key: "netAsset", label: "總資產", numeric: true, render: (row) => formatMoney(row.netAsset) },
      { key: "note", label: "備註" },
    ],
  },
  holdings: {
    statusName: "目前持股",
    primaryLabel: "總資產（台幣）",
    secondLabel: "資產類別",
    thirdLabel: "帳戶數",
    fourthLabel: "最大配置",
    allocationTitle: "資產配置",
    barTitle: "帳戶分布",
    barSubtitle: "依目前市值",
    detailTitle: "資產明細",
    totalLabel: (value) => formatMoney(value),
    defaultSort: { key: "baseValue", direction: "desc" },
    tableColumns: [
      { key: "assetClass", label: "資產類別" },
      { key: "assetName", label: "資產名稱" },
      { key: "account", label: "帳戶" },
      { key: "quantity", label: "數量", numeric: true, render: (row) => formatNumber(row.quantity) },
      { key: "price", label: "單價", numeric: true, render: (row) => formatNumber(row.price) },
      { key: "currency", label: "幣別" },
      { key: "value", label: "原幣市值", numeric: true, render: (row) => formatCurrencyValue(row.value, row.currency) },
      { key: "baseValue", label: "換算台幣", numeric: true, render: (row) => formatMoney(row.baseValue) },
    ],
  },
  realizedTw: {
    statusName: "台股已實現",
    primaryLabel: "總獲利（台幣）",
    secondLabel: "標的數",
    thirdLabel: "獲利標的",
    fourthLabel: "最大獲利",
    allocationTitle: "獲利組成",
    barTitle: "損益排行",
    barSubtitle: "獲利前五與虧損前五",
    detailTitle: "台股已實現損益",
    totalLabel: (value) => formatSignedMoney(value),
    defaultSort: { key: "baseValue", direction: "desc" },
  },
  realizedUs: {
    statusName: "美股已實現",
    primaryLabel: "總獲利（台幣）",
    secondLabel: "標的數",
    thirdLabel: "獲利標的",
    fourthLabel: "最大獲利",
    allocationTitle: "獲利組成",
    barTitle: "損益排行",
    barSubtitle: "獲利前五與虧損前五",
    detailTitle: "美股已實現損益",
    totalLabel: (value) => formatSignedMoney(value),
    defaultSort: { key: "baseValue", direction: "desc" },
  },
};

const realizedColumns = [
  { key: "assetClass", label: "類別" },
  { key: "assetName", label: "名稱" },
  { key: "cost", label: "買進成本", numeric: true, render: (row) => formatCurrencyValue(row.cost, row.currency) },
  { key: "proceeds", label: "賣出總額", numeric: true, render: (row) => formatCurrencyValue(row.proceeds, row.currency) },
  { key: "dividend", label: "配息", numeric: true, render: (row) => formatCurrencyValue(row.dividend, row.currency) },
  { key: "value", label: "總獲利", numeric: true, render: (row) => formatSignedCurrencyValue(row.value, row.currency) },
  { key: "returnRate", label: "報酬率", numeric: true, render: (row) => formatPercent(row.returnRate) },
  { key: "currency", label: "幣別" },
  { key: "baseValue", label: "換算台幣", numeric: true, render: (row) => formatSignedMoney(row.baseValue) },
];

viewConfigs.realizedTw.tableColumns = realizedColumns;
viewConfigs.realizedUs.tableColumns = realizedColumns;

const elements = {
  refreshData: document.querySelector("#refreshData"),
  privacyToggle: document.querySelector("#privacyToggle"),
  tabButtons: document.querySelectorAll(".tab-button"),
  sourceStatus: document.querySelector("#sourceStatus"),
  updatedAt: document.querySelector("#updatedAt"),
  primaryMetricLabel: document.querySelector("#primaryMetricLabel"),
  secondMetricLabel: document.querySelector("#secondMetricLabel"),
  thirdMetricLabel: document.querySelector("#thirdMetricLabel"),
  fourthMetricLabel: document.querySelector("#fourthMetricLabel"),
  totalValue: document.querySelector("#totalValue"),
  assetClassCount: document.querySelector("#assetClassCount"),
  accountCount: document.querySelector("#accountCount"),
  largestClass: document.querySelector("#largestClass"),
  extraMetrics: document.querySelectorAll(".extra-metric"),
  fifthMetricLabel: document.querySelector("#fifthMetricLabel"),
  sixthMetricLabel: document.querySelector("#sixthMetricLabel"),
  taiwanTodayProfit: document.querySelector("#taiwanTodayProfit"),
  usTodayProfit: document.querySelector("#usTodayProfit"),
  allocationTitle: document.querySelector("#allocationTitle"),
  allocationTotal: document.querySelector("#allocationTotal"),
  barTitle: document.querySelector("#barTitle"),
  barSubtitle: document.querySelector("#barSubtitle"),
  allocationChart: document.querySelector("#allocationChart"),
  accountBars: document.querySelector("#accountBars"),
  detailTitle: document.querySelector("#detailTitle"),
  tableHead: document.querySelector("#tableHead"),
  assetRows: document.querySelector("#assetRows"),
  tableSearch: document.querySelector("#tableSearch"),
  emptyState: document.querySelector("#emptyState"),
};

elements.refreshData.addEventListener("click", loadFixedSources);
elements.privacyToggle.addEventListener("click", () => {
  privacyMode = !privacyMode;
  localStorage.setItem("assetDashboardPrivacy", privacyMode ? "hidden" : "visible");
  updatePrivacyMode();
  applyPrivacyMasks();
});

elements.tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    switchView(button.dataset.view);
  });
});

elements.tableSearch.addEventListener("input", () => {
  renderTable(currentRows, elements.tableSearch.value);
});

elements.tableHead.addEventListener("click", (event) => {
  const button = event.target.closest(".sort-button");
  if (!button) {
    return;
  }
  const key = button.dataset.sortKey;
  tableSort = {
    key,
    direction: tableSort.key === key && tableSort.direction === "desc" ? "asc" : "desc",
  };
  updateSortButtons();
  renderTable(currentRows, elements.tableSearch.value);
});

updatePrivacyMode();
renderView();
loadFixedSources();

async function loadFixedSources() {
  try {
    setStatus("資料載入中...");
    const [monthlyRows, taiwanRows, foreignQuoteRows] = await Promise.all([
      fetchRows(
        dataSources.monthlyAssets.sheetUrl,
        dataSources.monthlyAssets.sheetName,
        dataSources.monthlyAssets.gid,
        normalizeMonthlyAssetRow,
      ),
      fetchSheetRows(
        dataSources.taiwan.sheetUrl,
        dataSources.taiwan.sheetName,
        dataSources.taiwan.gid,
        normalizeTaiwanStockRow,
      ),
      fetchForeignAccountRows(dataSources.foreign.sheetUrl, dataSources.foreign.sheetName, dataSources.foreign.gid),
    ]);
    const usSummary = await fetchUsSummaryData(
      dataSources.usSummary.sheetUrl,
      dataSources.usSummary.sheetName,
      dataSources.usSummary.gid,
      foreignQuoteRows,
    );
    const [realizedTaiwanRows, realizedTaiwanWarrantRows, realizedTaiwanMacronixRows] = await Promise.all([
      fetchRealizedRows(
        dataSources.realizedTaiwan.sheetUrl,
        dataSources.realizedTaiwan.sheetName,
        dataSources.realizedTaiwan.gid,
        normalizeRealizedTaiwanRow,
      ),
      fetchRealizedRows(
        dataSources.realizedTaiwanWarrant.sheetUrl,
        dataSources.realizedTaiwanWarrant.sheetName,
        dataSources.realizedTaiwanWarrant.gid,
        normalizeWarrantRow,
      ),
      fetchMacronixRealizedRows(
        dataSources.realizedTaiwanMacronix.sheetUrl,
        dataSources.realizedTaiwanMacronix.sheetName,
        dataSources.realizedTaiwanMacronix.gid,
      ),
    ]);
    const mergedRealizedTaiwanRows = mergeMacronixIntoTaiwanRealizedRows(
      realizedTaiwanRows,
      realizedTaiwanMacronixRows,
    );
    const validMonthlyRows = monthlyRows.filter(hasMonthlyAssetData).sort((a, b) => a.dateValue - b.dateValue);
    viewData = {
      overview: validMonthlyRows,
      holdings: [...taiwanRows, ...usSummary.holdings].filter((row) => row.baseValue > 0 && row.quantity > 0),
      realizedTw: [...mergedRealizedTaiwanRows, ...realizedTaiwanWarrantRows],
      realizedUs: usSummary.realized,
    };
    resetDailyProfitState();
    renderView();
    loadDailyHoldingProfit(viewData.holdings);
    const usdRate = foreignQuoteRows.find((row) => row.currency === "USD")?.exchangeRate;
    setStatus(
      `已載入：資產總覽 ${viewData.overview.length} 筆，目前持股 ${viewData.holdings.length} 筆，台股已實現 ${viewData.realizedTw.length} 筆，美股已實現 ${viewData.realizedUs.length} 筆${usdRate ? `，USD/TWD ${usdRate}` : ""}`,
    );
  } catch (error) {
    console.error(error);
    setStatus(error.message || "載入失敗，請確認 Google Sheet 分享權限與本機伺服器狀態");
  }
}

async function fetchSheetRows(sheetUrl, sheetName, gid, normalizer) {
  if (!sheetName) {
    return [];
  }
  const csv = await fetchSheetCsv(sheetUrl, sheetName, gid);
  return fetchRowsFromCsv(csv, normalizer).filter(isActiveAssetRow);
}

async function fetchRows(sheetUrl, sheetName, gid, normalizer) {
  if (!sheetName) {
    return [];
  }
  const csv = await fetchSheetCsv(sheetUrl, sheetName, gid);
  return fetchRowsFromCsv(csv, normalizer);
}

function fetchRowsFromCsv(csv, normalizer) {
  return rowsToObjects(parseCsvRows(csv)).map(normalizer);
}

async function fetchForeignAccountRows(sheetUrl, sheetName, gid) {
  if (!sheetName) {
    return [];
  }
  const csv = await fetchSheetCsv(sheetUrl, sheetName, gid);
  return parseForeignAccountRows(parseCsvRows(csv)).filter(isActiveAssetRow);
}

async function fetchUsSummaryData(sheetUrl, sheetName, gid, quoteRows) {
  const csv = await fetchSheetCsv(sheetUrl, sheetName, gid);
  return parseUsSummaryRows(rowsToObjects(parseCsvRows(csv)), quoteRows);
}

async function fetchRealizedRows(sheetUrl, sheetName, gid, normalizer) {
  const csv = await fetchSheetCsv(sheetUrl, sheetName, gid);
  return rowsToObjects(parseCsvRows(csv))
    .filter((row) => !isSummaryRow(row))
    .map(normalizer)
    .filter((row) => row.assetName && !isSummaryName(row.assetName) && row.cost > 0);
}

async function fetchMacronixRealizedRows(sheetUrl, sheetName, gid) {
  const csv = await fetchSheetCsv(sheetUrl, sheetName, gid);
  const rows = parseCsvRows(csv);
  const summaryRow = rows.find((row) => toNumber(row[21]) !== 0 && toNumber(row[20]) !== 0);
  return summaryRow ? [normalizeMacronixRow(summaryRow)] : [];
}

async function fetchSheetCsv(sheetUrl, sheetName, gid) {
  if (isStaticHosted()) {
    return fetchSheetCsvViaJsonp(sheetUrl, sheetName, gid);
  }

  const csvUrl = buildSheetApiUrl(sheetUrl, sheetName, gid);
  try {
    const response = await fetch(csvUrl);
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Google Sheet 回應錯誤：${response.status}`);
    }
    return response.text();
  } catch (error) {
    if (location.protocol === "file:") {
      throw error;
    }
    return fetchSheetCsvViaJsonp(sheetUrl, sheetName, gid);
  }
}

function buildSheetApiUrl(sheetUrl, sheetName, gid) {
  const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    throw new Error("無法解析 Google Sheet ID");
  }
  const gidFromUrl = new URL(sheetUrl).hash.match(/gid=([0-9]+)/)?.[1] || new URL(sheetUrl).searchParams.get("gid");
  const resolvedGid = gid || gidFromUrl || "0";
  const params = new URLSearchParams({
    sheetUrl,
    gid: resolvedGid,
  });
  if (sheetName) {
    params.set("sheetName", sheetName);
  }
  return `/api/sheet?${params.toString()}`;
}

async function fetchMarketText(url) {
  const candidates = [];
  if (!isStaticHosted() && location.protocol !== "file:") {
    candidates.push(`/api/proxy?url=${encodeURIComponent(url)}`);
  }
  if (!(location.protocol === "https:" && url.startsWith("http:"))) {
    candidates.push(url);
  }
  candidates.push(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`);
  if (url.startsWith("https:")) {
    candidates.push(`https://r.jina.ai/http://r.jina.ai/http://${url}`);
  }
  candidates.push(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);

  let lastError;
  for (const candidate of candidates) {
    try {
      const response = await fetchWithTimeout(candidate, 6000);
      if (!response.ok) {
        throw new Error(`行情來源回應錯誤：${response.status}`);
      }
      const text = await response.text();
      if (looksLikeProxyFailure(text)) {
        throw new Error("行情代理回應無效");
      }
      return text;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("行情來源讀取失敗");
}

function fetchWithTimeout(url, timeout = 6000) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeout);
  return fetch(url, {
    cache: "no-store",
    signal: controller.signal,
  }).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

function looksLikeProxyFailure(text) {
  return /Exceeded the daily hits limit|not a valid resource|Server-side requests are not allowed|Attention Required|Cloudflare/i.test(
    text.slice(0, 500),
  );
}

function buildGvizUrl(sheetUrl, sheetName, gid, callbackName) {
  const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    throw new Error("無法解析 Google Sheet ID");
  }
  const params = new URLSearchParams({
    tqx: `out:json;responseHandler:${callbackName}`,
  });
  if (sheetName) {
    params.set("sheet", sheetName);
  } else {
    params.set("gid", gid || "0");
  }
  return `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?${params.toString()}`;
}

function fetchSheetCsvViaJsonp(sheetUrl, sheetName, gid) {
  return new Promise((resolve, reject) => {
    const callbackName = `__sheetCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Google Sheet 讀取逾時"));
    }, 15000);

    window[callbackName] = (payload) => {
      cleanup();
      if (payload.status !== "ok") {
        reject(new Error("Google Sheet 回應錯誤，請確認分享權限與分頁名稱"));
        return;
      }
      resolve(tableToCsv(payload.table));
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("無法讀取 Google Sheet，請確認分享權限"));
    };
    script.src = buildGvizUrl(sheetUrl, sheetName, gid, callbackName);
    document.head.appendChild(script);

    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }
  });
}

function tableToCsv(table) {
  const headerRow = table.cols.map((column) => column.label || "");
  const dataRows = table.rows.map((row) => table.cols.map((_, index) => cellToText(row.c?.[index])));
  return [headerRow, ...dataRows].map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

function cellToText(cell) {
  if (!cell) {
    return "";
  }
  return cell.f ?? cell.v ?? "";
}

function escapeCsvCell(value) {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function isStaticHosted() {
  return location.hostname.endsWith("github.io");
}

function parseCsvRows(csvText) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const next = csvText[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((entry) => entry.some((cellValue) => cellValue.trim()));
}

function rowsToObjects(rows) {
  const [headers = [], ...dataRows] = rows;
  return dataRows.map((dataRow) =>
    headers.reduce((record, header, index) => {
      record[header.trim()] = (dataRow[index] || "").trim();
      return record;
    }, {}),
  );
}

function normalizeMonthlyAssetRow(row) {
  const dateLabel = readColumn(row, ["日期"]);
  const grossAsset = toNumber(readColumn(row, ["月初資產"]));
  const netAsset = toNumber(readColumn(row, ["總資產"]));
  return {
    dateLabel,
    dateValue: new Date(dateLabel).getTime() || 0,
    grossAsset,
    difference: toNumber(readColumn(row, ["與上月差異"])),
    postOffice: toNumber(readColumn(row, ["郵局"])),
    ctbc: toNumber(readColumn(row, ["中國信託"])),
    cathay: toNumber(readColumn(row, ["國泰世華"])),
    cash: toNumber(readColumn(row, ["現金"])),
    loanBalance: toNumber(readColumn(row, ["貸款餘額"])),
    netAsset,
    displayNetAsset: netAsset || grossAsset,
    note: readColumn(row, ["備註"]) || "",
  };
}

function hasMonthlyAssetData(row) {
  return Boolean(
    row.dateLabel &&
      (row.grossAsset || row.postOffice || row.ctbc || row.cathay || row.cash || row.loanBalance || row.netAsset),
  );
}

function normalizeTaiwanStockRow(row) {
  const stockCode = readColumn(row, ["股票代號", "代號", "證券代號", "stockCode", "Symbol", "Ticker"]);
  const stockName = readColumn(row, ["股票名稱", "名稱", "證券名稱", "股名", "資產名稱", "標的", "assetName", "Asset", "Name"]);
  const quantity = toNumber(readColumn(row, ["尚存股數", "持有股數", "庫存股數", "庫存", "數量", "股數", "單位數", "quantity", "Quantity"]));
  const price = toNumber(readColumn(row, ["現價", "目前股價", "收盤價", "單價", "價格", "淨值", "price", "Price"]));
  const explicitValue = toNumber(readColumn(row, ["現值", "市值", "目前市值", "庫存市值", "持有市值", "金額", "value", "Value", "Market Value"]));
  const value = explicitValue || quantity * price;
  const assetName = [stockCode, stockName].filter(Boolean).join(" ") || stockName;
  const isTaiwanStock = Boolean(stockCode || stockName);

  return {
    ticker: stockCode,
    assetClass: readColumn(row, ["資產類別", "類別", "市場", "assetClass", "Asset Class", "分類"]) || (isTaiwanStock ? "台股" : "未分類"),
    assetName: assetName || "未命名資產",
    account: readColumn(row, ["帳戶", "券商", "銀行", "account", "Account"]) || (isTaiwanStock ? "台股持股" : "未指定帳戶"),
    quantity,
    price,
    value,
    baseValue: value,
    exchangeRate: 1,
    currency: readColumn(row, ["幣別", "currency", "Currency"]) || "TWD",
  };
}

function parseForeignAccountRows(rows) {
  const usdToTwd = findUsdToTwdRate(rows);
  usdToTwdRate = usdToTwd;
  return rows
    .map((row) => {
      const symbol = String(row[6] || "").trim();
      const originalQuantity = toNumber(row[7]);
      const price = toNumber(row[10]);
      const soldQuantity = toNumber(row[12]);
      const remainingQuantity = toNumber(row[13]) || Math.max(originalQuantity - soldQuantity, 0);
      const value = remainingQuantity * price;
      const baseValue = value * usdToTwd;

      return {
        ticker: symbol,
        assetClass: "美股",
        assetName: symbol,
        account: "外幣帳戶",
        quantity: remainingQuantity,
        price,
        value,
        baseValue,
        exchangeRate: usdToTwd,
        currency: "USD",
      };
    })
    .filter((row) => /^[A-Z][A-Z0-9.-]{0,9}$/.test(row.assetName) && row.quantity > 0 && row.price > 0);
}

function parseUsSummaryRows(rows, quoteRows) {
  const priceBySymbol = new Map(quoteRows.map((row) => [row.assetName, row.price]));
  const lotsBySymbol = new Map();
  const realizedBySymbol = new Map();

  rows
    .map((row) => ({
      symbol: readColumn(row, ["代號／名稱"]),
      dateValue: new Date(readColumn(row, ["日期"])).getTime() || 0,
      type: readColumn(row, ["項目"]),
      quantity: toNumber(readColumn(row, ["股數"])),
      price: toNumber(readColumn(row, ["價位"])),
      fee: toNumber(readColumn(row, ["手續費"])),
      total: toNumber(readColumn(row, ["總價"])),
    }))
    .filter(isUsSummaryTransactionRow)
    .sort((a, b) => a.dateValue - b.dateValue)
    .forEach((transaction) => {
      if (isUsSummaryLotAddition(transaction.type)) {
        const lots = lotsBySymbol.get(transaction.symbol) || [];
        lots.push({
          quantity: transaction.quantity,
          remainingQuantity: transaction.quantity,
          remainingCost: transaction.total,
        });
        lotsBySymbol.set(transaction.symbol, lots);
        return;
      }

      if (transaction.type === "股息") {
        const realized = getRealizedBucket(realizedBySymbol, transaction.symbol);
        realized.dividend += transaction.total;
        realized.value += transaction.total;
        realized.baseValue += transaction.total * usdToTwdRate;
        return;
      }

      if (transaction.type === "賣出") {
        const lots = lotsBySymbol.get(transaction.symbol) || [];
        let quantityToSell = transaction.quantity;
        let soldCost = 0;

        while (quantityToSell > 0 && lots.length) {
          const lot = lots[0];
          const consumedQuantity = Math.min(quantityToSell, lot.remainingQuantity);
          const consumedCost = lot.remainingCost * (consumedQuantity / lot.remainingQuantity);
          soldCost += consumedCost;
          lot.remainingQuantity -= consumedQuantity;
          lot.remainingCost -= consumedCost;
          quantityToSell -= consumedQuantity;

          if (lot.remainingQuantity <= 0.000001) {
            lots.shift();
          }
        }

        const realized = getRealizedBucket(realizedBySymbol, transaction.symbol);
        realized.cost += soldCost;
        realized.proceeds += transaction.total;
        realized.value += transaction.total - soldCost;
        realized.baseValue = realized.value * usdToTwdRate;
        return;
      }
    });

  const holdings = [...lotsBySymbol.entries()]
    .map(([symbol, lots]) => {
      const quantity = lots.reduce((total, lot) => total + lot.remainingQuantity, 0);
      const cost = lots.reduce((total, lot) => total + lot.remainingCost, 0);
      const price = priceBySymbol.get(symbol) || (quantity ? cost / quantity : 0);
      const value = quantity * price;
      return {
        ticker: symbol,
        assetClass: "美股",
        assetName: symbol,
        account: "美股Summary",
        quantity,
        price,
        value,
        baseValue: value * usdToTwdRate,
        exchangeRate: usdToTwdRate,
        currency: "USD",
      };
    })
    .filter((row) => row.quantity > 0 && row.value > 0);

  const realized = [...realizedBySymbol.values()]
    .map((row) => ({
      ...row,
      assetClass: row.value >= 0 ? "獲利" : "虧損",
      price: row.cost,
      returnRate: row.cost ? (row.value / row.cost) * 100 : 0,
    }))
    .filter((row) => row.cost > 0 || row.dividend > 0);

  return { holdings, realized };
}

function isUsSummaryTransactionRow(row) {
  if (!row.symbol || row.quantity <= 0) {
    return false;
  }
  if (isUsSummaryLotAddition(row.type)) {
    return row.total >= 0;
  }
  return row.total > 0;
}

function isUsSummaryLotAddition(type) {
  return type === "買進" || type.includes("拆") || type.includes("分割") || type.includes("無成本");
}

function resetDailyProfitState() {
  dailyProfitState = {
    status: "loading",
    taiwan: null,
    us: null,
  };
  dailyProfitRequestId += 1;
}

async function loadDailyHoldingProfit(rows) {
  const requestId = dailyProfitRequestId;
  const [taiwanResult, usResult] = await Promise.allSettled([fetchTaiwanDailyProfit(rows), fetchUsDailyProfit(rows)]);
  if (requestId !== dailyProfitRequestId) {
    return;
  }

  if (taiwanResult.status === "rejected") {
    console.warn(taiwanResult.reason);
  }
  if (usResult.status === "rejected") {
    console.warn(usResult.reason);
  }

  dailyProfitState = {
    status: "ready",
    taiwan: taiwanResult.status === "fulfilled" ? taiwanResult.value : null,
    us: usResult.status === "fulfilled" ? usResult.value : null,
  };

  if (currentView === "holdings") {
    renderDashboard(viewData.holdings);
  }
}

async function fetchTaiwanDailyProfit(rows) {
  const holdings = rows.filter((row) => row.assetClass === "台股" && row.ticker && row.quantity > 0);
  if (!holdings.length) {
    return 0;
  }

  const codes = [...new Set(holdings.map((row) => row.ticker))];
  const quotes = new Map();
  const chunkSize = 20;
  for (let index = 0; index < codes.length; index += chunkSize) {
    const chunk = codes.slice(index, index + chunkSize);
    const exCh = chunk.flatMap((code) => [`tse_${code}.tw`, `otc_${code}.tw`]).join("|");
    const url = `http://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(exCh)}&json=1&delay=0&_=${Date.now()}`;
    const text = await fetchMarketText(url);
    const data = JSON.parse(text.trim());
    (data.msgArray || []).forEach((quote) => {
      const code = String(quote.c || "").trim();
      const currentPrice = toNumber(quote.z) || toNumber(quote.pz) || toNumber(quote.o);
      const previousClose = toNumber(quote.y);
      if (code && currentPrice > 0 && previousClose > 0) {
        quotes.set(code, currentPrice - previousClose);
      }
    });
  }

  return holdings.reduce((total, row) => total + (quotes.get(row.ticker) || 0) * row.quantity, 0);
}

async function fetchUsDailyProfit(rows) {
  const holdings = rows.filter((row) => row.assetClass === "美股" && row.ticker && row.quantity > 0);
  if (!holdings.length) {
    return 0;
  }

  const quotePairs = await Promise.all(
    [...new Set(holdings.map((row) => row.ticker))].map(async (symbol) => {
      const stooqSymbol = `${symbol.toLowerCase()}.us`;
      const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol)}&f=sd2t2ohlcvp&h&e=csv`;
      const csv = await fetchMarketText(url);
      const rows = parseCsvRows(extractCsvText(csv));
      const record = rowsToObjects(rows)[0] || {};
      const close = toNumber(readColumn(record, ["Close"]));
      const previousClose = toNumber(readColumn(record, ["Prev"]));
      return [symbol, close > 0 && previousClose > 0 ? close - previousClose : 0];
    }),
  );
  const quotes = new Map(quotePairs);

  return holdings.reduce((total, row) => total + (quotes.get(row.ticker) || 0) * row.quantity * row.exchangeRate, 0);
}

function extractCsvText(text) {
  const lines = text.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.startsWith("Symbol,"));
  return headerIndex >= 0 ? lines.slice(headerIndex).join("\n") : text;
}

function getRealizedBucket(map, symbol) {
  if (!map.has(symbol)) {
    map.set(symbol, {
      assetClass: "獲利",
      assetName: symbol,
      account: "美股Summary FIFO",
      quantity: 1,
      price: 0,
      cost: 0,
      proceeds: 0,
      dividend: 0,
      value: 0,
      baseValue: 0,
      returnRate: 0,
      exchangeRate: usdToTwdRate,
      currency: "USD",
    });
  }
  return map.get(symbol);
}

function normalizeRealizedTaiwanRow(row) {
  const cost = toNumber(readColumn(row, ["買進成本"]));
  const proceeds = toNumber(readColumn(row, ["賣出總額"]));
  const dividend = toNumber(readColumn(row, ["配息"]));
  const value = toNumber(readColumn(row, ["總獲利", "淨利"]));
  const assetName = readColumn(row, ["名稱"]);
  return {
    assetClass: value >= 0 ? "獲利" : "虧損",
    assetName,
    account: "台股已實現",
    quantity: 1,
    price: cost,
    cost,
    proceeds,
    dividend,
    value,
    baseValue: value,
    returnRate: toPercent(readColumn(row, ["獲利（％）", "獲利(％)"])),
    exchangeRate: 1,
    currency: "TWD",
  };
}

function normalizeWarrantRow(row) {
  const cost = toNumber(readColumn(row, ["買進成本"]));
  const proceeds = toNumber(readColumn(row, ["賣出總額"]));
  const value = toNumber(readColumn(row, ["淨利", "總獲利"]));
  const assetName = readColumn(row, ["名稱"]);
  return {
    assetClass: value >= 0 ? "權證獲利" : "權證虧損",
    assetName: `${assetName}（權證）`,
    account: "權證紀錄",
    quantity: 1,
    price: cost,
    cost,
    proceeds,
    dividend: 0,
    value,
    baseValue: value,
    returnRate: toPercent(readColumn(row, ["獲利（％）", "獲利(％)"])),
    exchangeRate: 1,
    currency: "TWD",
  };
}

function normalizeMacronixRow(row) {
  const cost = Math.abs(toNumber(row[14]));
  const dividend = toNumber(row[15]);
  const proceeds = toNumber(row[20]);
  const value = toNumber(row[21]);
  return {
    assetClass: value >= 0 ? "股票獲利" : "股票虧損",
    assetName: "2337 旺宏（副本彙總）",
    account: "旺宏副本",
    quantity: 1,
    price: cost,
    cost,
    proceeds,
    dividend,
    value,
    baseValue: value,
    returnRate: toPercent(row[22]),
    exchangeRate: 1,
    currency: "TWD",
  };
}

function mergeMacronixIntoTaiwanRealizedRows(rows, macronixRows) {
  if (!macronixRows.length) {
    return rows;
  }

  const mergedRows = rows.map((row) => ({ ...row }));
  const target = mergedRows.find((row) => row.assetName === "旺宏");

  if (!target) {
    return [...mergedRows, ...macronixRows];
  }

  macronixRows.forEach((source) => {
    target.cost += source.cost;
    target.proceeds += source.proceeds;
    target.dividend += source.dividend;
    target.value += source.value;
    target.baseValue += source.baseValue;
  });

  target.assetClass = target.value >= 0 ? "獲利" : "虧損";
  target.price = target.cost;
  target.returnRate = target.cost ? (target.value / target.cost) * 100 : 0;
  target.account = "台股已實現＋旺宏副本";

  return mergedRows;
}

function normalizeRealizedUsRow(row) {
  const cost = toNumber(readColumn(row, ["買進成本"]));
  const proceeds = toNumber(readColumn(row, ["賣出總額"]));
  const dividend = toNumber(readColumn(row, ["配息"]));
  const value = toNumber(readColumn(row, ["總獲利", "淨利"]));
  return {
    assetClass: value >= 0 ? "獲利" : "虧損",
    assetName: readColumn(row, ["名稱"]),
    account: "美股已實現",
    quantity: 1,
    price: cost,
    cost,
    proceeds,
    dividend,
    value,
    baseValue: value * usdToTwdRate,
    returnRate: toPercent(readColumn(row, ["獲利（％）", "獲利(％)"])),
    exchangeRate: usdToTwdRate,
    currency: "USD",
  };
}

function isActiveAssetRow(row) {
  return row.baseValue > 0 && row.quantity > 0 && row.assetName && row.assetName !== "未命名資產";
}

function isSummaryRow(row) {
  return isSummaryName(readColumn(row, ["名稱", "Name", "assetName"]));
}

function isSummaryName(value) {
  return String(value || "").trim().toLowerCase() === "total";
}

function findUsdToTwdRate(rows) {
  const candidate = rows.find((row) => String(row[1] || "").trim() === "股票成本" && toNumber(row[3]) > 0);
  return candidate ? toNumber(candidate[3]) : 1;
}

function readColumn(row, names) {
  const key = names.find((name) => Object.prototype.hasOwnProperty.call(row, name));
  return key ? row[key] : "";
}

function toNumber(value) {
  const text = String(value || "").trim();
  const isParenthesizedNegative = /^\(.+\)$/.test(text);
  const cleaned = text.replace(/[()$,，\s]/g, "").replace("−", "-");
  const number = Number(cleaned);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return isParenthesizedNegative ? -Math.abs(number) : number;
}

function toPercent(value) {
  const cleaned = String(value || "").replace(/[%％,\s]/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function renderDashboard(rows) {
  currentRows = rows;
  const config = viewConfigs[currentView];
  if (currentView === "overview") {
    renderOverviewDashboard(rows, config);
    return;
  }
  const isRealizedView = currentView !== "holdings";
  const total = sum(rows, "baseValue");
  const chartRows = rows;
  const chartTotal = isRealizedView ? sumAbs(chartRows, "baseValue") : sum(chartRows, "baseValue");
  const byClass = groupSum(chartRows, "assetClass", isRealizedView);
  const byAccount = groupSum(chartRows, "account");
  const largestRow = [...rows].sort((a, b) => b.baseValue - a.baseValue)[0];

  elements.primaryMetricLabel.textContent = config.primaryLabel;
  elements.secondMetricLabel.textContent = config.secondLabel;
  elements.thirdMetricLabel.textContent = config.thirdLabel;
  elements.fourthMetricLabel.textContent = config.fourthLabel;
  elements.allocationTitle.textContent = config.allocationTitle;
  elements.barTitle.textContent = config.barTitle;
  elements.barSubtitle.textContent = config.barSubtitle;
  elements.detailTitle.textContent = config.detailTitle;

  elements.totalValue.textContent = rows.length ? config.totalLabel(total) : "--";
  elements.assetClassCount.textContent = rows.length ? String(isRealizedView ? rows.length : byClass.size) : "--";
  elements.accountCount.textContent = rows.length
    ? String(isRealizedView ? rows.filter((row) => row.baseValue > 0).length : byAccount.size)
    : "--";
  elements.largestClass.textContent = largestRow ? largestRow.assetName : "--";
  elements.allocationTotal.textContent = rows.length ? config.totalLabel(total) : "--";
  elements.updatedAt.textContent = rows.length ? new Date().toLocaleString("zh-TW") : "--";
  renderExtraMetrics(rows);

  renderDonut(byClass, chartTotal);
  if (isRealizedView) {
    renderProfitLossRanking(rows);
  } else {
    renderBars(byAccount, chartTotal);
  }
  renderTableHead();
  renderTable(rows, elements.tableSearch.value);
  applyPrivacyMasks();
}

function renderOverviewDashboard(rows, config) {
  const latest = [...rows].sort((a, b) => b.dateValue - a.dateValue)[0];
  const composition = latest ? getAssetComposition(latest) : [];
  const compositionTotal = composition.reduce((total, item) => total + item.value, 0);

  elements.primaryMetricLabel.textContent = config.primaryLabel;
  elements.secondMetricLabel.textContent = config.secondLabel;
  elements.thirdMetricLabel.textContent = config.thirdLabel;
  elements.fourthMetricLabel.textContent = config.fourthLabel;
  elements.allocationTitle.textContent = config.allocationTitle;
  elements.barTitle.textContent = config.barTitle;
  elements.barSubtitle.textContent = config.barSubtitle;
  elements.detailTitle.textContent = config.detailTitle;

  elements.totalValue.textContent = latest ? formatMoney(latest.displayNetAsset) : "--";
  elements.assetClassCount.textContent = latest ? formatMoney(latest.grossAsset) : "--";
  elements.accountCount.textContent = latest ? formatMoney(latest.loanBalance) : "--";
  elements.largestClass.textContent = latest ? formatSignedMoney(latest.difference) : "--";
  elements.allocationTotal.textContent = latest ? latest.dateLabel : "--";
  elements.updatedAt.textContent = rows.length ? new Date().toLocaleString("zh-TW") : "--";
  hideExtraMetrics();

  renderDonut(new Map(composition.map((item) => [item.name, item.value])), compositionTotal);
  renderLineChart(rows);
  renderTableHead();
  renderTable(rows, elements.tableSearch.value);
  applyPrivacyMasks();
}

function renderExtraMetrics(rows) {
  if (currentView !== "holdings") {
    hideExtraMetrics();
    return;
  }

  elements.extraMetrics.forEach((metric) => {
    metric.classList.remove("is-hidden");
  });
  elements.fifthMetricLabel.textContent = "今日台股損益";
  elements.sixthMetricLabel.textContent = "今日美股損益";
  elements.taiwanTodayProfit.textContent = formatDailyProfitValue(dailyProfitState.taiwan, rows);
  elements.usTodayProfit.textContent = formatDailyProfitValue(dailyProfitState.us, rows);
}

function hideExtraMetrics() {
  elements.extraMetrics.forEach((metric) => {
    metric.classList.add("is-hidden");
  });
  elements.taiwanTodayProfit.textContent = "--";
  elements.usTodayProfit.textContent = "--";
}

function formatDailyProfitValue(value, rows) {
  if (!rows.length || dailyProfitState.status === "idle") {
    return "--";
  }
  if (dailyProfitState.status === "loading") {
    return "查詢中";
  }
  if (dailyProfitState.status === "error" || value === null) {
    return "--";
  }
  return formatSignedMoney(value);
}

function renderView() {
  renderDashboard(viewData[currentView] || []);
}

function switchView(view) {
  if (!viewConfigs[view] || currentView === view) {
    return;
  }
  currentView = view;
  tableSort = { ...viewConfigs[currentView].defaultSort };
  elements.tableSearch.value = "";
  elements.tabButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === currentView);
  });
  renderView();
}

function renderTableHead() {
  const columns = viewConfigs[currentView].tableColumns;
  elements.tableHead.innerHTML = `
    <tr>
      ${columns
        .map(
          (column) => `
            <th class="${column.numeric ? "numeric" : ""}">
              <button type="button" class="sort-button" data-sort-key="${column.key}">${column.label}</button>
            </th>
          `,
        )
        .join("")}
    </tr>
  `;
  updateSortButtons();
}

function groupSum(rows, key, useAbsoluteValue = false) {
  return rows.reduce((map, row) => {
    map.set(row[key], (map.get(row[key]) || 0) + (useAbsoluteValue ? Math.abs(row.baseValue) : row.baseValue));
    return map;
  }, new Map());
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + row[key], 0);
}

function sumAbs(rows, key) {
  return rows.reduce((total, row) => total + Math.abs(row[key]), 0);
}

function renderDonut(grouped, total) {
  if (!total) {
    elements.allocationChart.innerHTML = '<p class="empty">尚無配置資料</p>';
    return;
  }

  let start = 0;
  const entries = [...grouped.entries()].sort((a, b) => b[1] - a[1]);
  const segments = entries.map(([name, value], index) => {
    const percent = (value / total) * 100;
    const end = start + percent;
    const color = palette[index % palette.length];
    const segment = `${color} ${start}% ${end}%`;
    start = end;
    return { name, value, percent, color, segment };
  });

  const legend = segments
    .map(
      (item) => `
        <div class="legend-item">
          <div class="legend-line">
            <span class="legend-name"><span class="swatch" style="background:${item.color}"></span>${escapeHtml(item.name)}</span>
            <span>${item.percent.toFixed(1)}%</span>
          </div>
          <div class="legend-line">
            <span>${formatMoney(item.value)}</span>
          </div>
        </div>
      `,
    )
    .join("");

  elements.allocationChart.innerHTML = `
    <div class="donut-chart" style="background: conic-gradient(${segments.map((item) => item.segment).join(", ")})"></div>
    <div class="legend">${legend}</div>
  `;
}

function renderBars(grouped, total) {
  if (!total) {
    elements.accountBars.innerHTML = '<p class="empty">尚無帳戶資料</p>';
    return;
  }

  elements.accountBars.innerHTML = [...grouped.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, value], index) => {
      const percent = (value / total) * 100;
      const color = palette[(index + 1) % palette.length];
      return `
        <div class="bar-row">
          <div class="bar-meta">
            <strong>${escapeHtml(name)}</strong>
            <span>${formatMoney(value)}，${percent.toFixed(1)}%</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${percent}%; background:${color}"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderProfitLossRanking(rows) {
  const profits = rows
    .filter((row) => row.baseValue > 0)
    .sort((a, b) => b.baseValue - a.baseValue)
    .slice(0, 5);
  const losses = rows
    .filter((row) => row.baseValue < 0)
    .sort((a, b) => a.baseValue - b.baseValue)
    .slice(0, 5);
  const maxValue = Math.max(...[...profits, ...losses].map((row) => Math.abs(row.baseValue)), 0);

  if (!maxValue) {
    elements.accountBars.innerHTML = '<p class="empty">尚無損益排行資料</p>';
    return;
  }

  elements.accountBars.innerHTML = `
    ${renderRankingSection("獲利前五", profits, maxValue, "#5f8061")}
    ${renderRankingSection("虧損前五", losses, maxValue, "#b16d63")}
  `;
}

function renderRankingSection(title, rows, maxValue, color) {
  const body = rows.length
    ? rows
        .map((row) => {
          const percent = (Math.abs(row.baseValue) / maxValue) * 100;
          return `
            <div class="bar-row">
              <div class="bar-meta">
                <strong>${escapeHtml(row.assetName)}</strong>
                <span>${formatSignedMoney(row.baseValue)}</span>
              </div>
              <div class="bar-track">
                <div class="bar-fill" style="width:${percent}%; background:${color}"></div>
              </div>
            </div>
          `;
        })
        .join("")
    : '<p class="empty compact-empty">尚無資料</p>';

  return `
    <div class="ranking-section">
      <h3>${escapeHtml(title)}</h3>
      ${body}
    </div>
  `;
}

function renderLineChart(rows) {
  if (rows.length < 2) {
    elements.accountBars.innerHTML = '<p class="empty">尚無足夠月份資料</p>';
    return;
  }

  const sortedRows = [...rows].sort((a, b) => a.dateValue - b.dateValue);
  const width = 680;
  const height = 300;
  const padding = { top: 34, right: 24, bottom: 48, left: 66 };
  const values = sortedRows.flatMap((row) => [row.grossAsset, row.displayNetAsset]).filter((value) => value > 0);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;
  const x = (index) => padding.left + (index / Math.max(sortedRows.length - 1, 1)) * (width - padding.left - padding.right);
  const y = (value) => padding.top + ((maxValue - value) / range) * (height - padding.top - padding.bottom);
  const grossPointList = sortedRows.map((row, index) => `${x(index)},${y(row.grossAsset)}`);
  const netPointList = sortedRows.map((row, index) => `${x(index)},${y(row.displayNetAsset)}`);
  const grossPoints = grossPointList.join(" ");
  const netPoints = netPointList.join(" ");
  const baselineY = height - padding.bottom;
  const grossAreaPoints = `${padding.left},${baselineY} ${grossPoints} ${width - padding.right},${baselineY}`;
  const netAreaPoints = `${padding.left},${baselineY} ${netPoints} ${width - padding.right},${baselineY}`;
  const latest = sortedRows[sortedRows.length - 1];
  const first = sortedRows[0];
  const latestX = x(sortedRows.length - 1);
  const latestGrossY = y(latest.grossAsset);
  const latestNetY = y(latest.displayNetAsset);

  elements.accountBars.innerHTML = `
    <div class="line-chart-wrap">
      <svg class="line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="每月資產變化曲線">
        <defs>
          <linearGradient id="grossAreaGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#496f83" stop-opacity="0.22" />
            <stop offset="100%" stop-color="#496f83" stop-opacity="0.02" />
          </linearGradient>
          <linearGradient id="netAreaGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#b89455" stop-opacity="0.24" />
            <stop offset="100%" stop-color="#b89455" stop-opacity="0.03" />
          </linearGradient>
        </defs>
        <rect class="chart-bg" x="${padding.left}" y="${padding.top}" width="${width - padding.left - padding.right}" height="${height - padding.top - padding.bottom}" rx="12" />
        ${[0, 0.25, 0.5, 0.75, 1]
          .map((ratio) => {
            const gridY = padding.top + ratio * (height - padding.top - padding.bottom);
            const value = maxValue - ratio * range;
            return `
              <line class="grid-line" x1="${padding.left}" y1="${gridY}" x2="${width - padding.right}" y2="${gridY}" />
              <text class="axis-value" x="${padding.left - 10}" y="${gridY + 4}" text-anchor="end">${formatCompactMoney(value)}</text>
            `;
          })
          .join("")}
        <polygon class="line-area gross-area" points="${grossAreaPoints}" />
        <polygon class="line-area net-area" points="${netAreaPoints}" />
        <polyline class="line-gross" points="${grossPoints}" />
        <polyline class="line-net" points="${netPoints}" />
        <circle class="point-gross" cx="${latestX}" cy="${latestGrossY}" r="4.5" />
        <circle class="point-net" cx="${latestX}" cy="${latestNetY}" r="4.5" />
        <g class="latest-label gross-label">
          <rect x="${Math.max(padding.left, latestX - 104)}" y="${Math.max(padding.top + 4, latestGrossY - 34)}" width="96" height="24" rx="8" />
          <text x="${Math.max(padding.left, latestX - 56)}" y="${Math.max(padding.top + 20, latestGrossY - 17)}" text-anchor="middle">${formatCompactMoney(latest.grossAsset)}</text>
        </g>
        <g class="latest-label net-label">
          <rect x="${Math.max(padding.left, latestX - 104)}" y="${Math.min(baselineY - 30, latestNetY + 10)}" width="96" height="24" rx="8" />
          <text x="${Math.max(padding.left, latestX - 56)}" y="${Math.min(baselineY - 14, latestNetY + 27)}" text-anchor="middle">${formatCompactMoney(latest.displayNetAsset)}</text>
        </g>
        <text x="${padding.left}" y="${height - 12}">${escapeHtml(formatMonth(first.dateLabel))}</text>
        <text x="${width - padding.right}" y="${height - 12}" text-anchor="end">${escapeHtml(formatMonth(latest.dateLabel))}</text>
      </svg>
      <div class="line-legend">
        <span><i class="legend-gross"></i>月初資產 ${formatMoney(latest.grossAsset)}</span>
        <span><i class="legend-net"></i>淨資產 ${formatMoney(latest.displayNetAsset)}</span>
      </div>
    </div>
  `;
}

function getAssetComposition(row) {
  return [
    { name: "郵局", value: row.postOffice },
    { name: "中國信託", value: row.ctbc },
    { name: "國泰世華", value: row.cathay },
    { name: "現金", value: row.cash },
  ].filter((item) => item.value > 0);
}

function renderTable(rows, query = "") {
  const keyword = query.trim().toLowerCase();
  const filteredRows = keyword
    ? rows.filter((row) =>
        viewConfigs[currentView].tableColumns.some((column) => String(row[column.key] || "").toLowerCase().includes(keyword)),
      )
    : rows;
  const sortedRows = sortRows(filteredRows);

  if (!sortedRows.length) {
    elements.assetRows.innerHTML = `
      <tr>
        <td colspan="${viewConfigs[currentView].tableColumns.length}" class="empty">目前沒有可顯示的資料。</td>
      </tr>
    `;
    return;
  }

  elements.assetRows.innerHTML = sortedRows
    .map(
      (row) => `
        <tr>
          ${viewConfigs[currentView].tableColumns
            .map((column) => {
              const value = column.render ? column.render(row) : row[column.key];
              return `<td class="${column.numeric ? "numeric" : ""}">${escapeHtml(value)}</td>`;
            })
            .join("")}
        </tr>
      `,
    )
    .join("");
  applyPrivacyMasks();
}

function updatePrivacyMode() {
  document.body.classList.toggle("is-private", privacyMode);
  elements.privacyToggle.setAttribute("aria-pressed", String(privacyMode));
  elements.privacyToggle.setAttribute("aria-label", privacyMode ? "顯示金額" : "隱藏金額");
  elements.privacyToggle.title = privacyMode ? "顯示金額" : "隱藏金額";
}

function applyPrivacyMasks() {
  document.querySelectorAll(".privacy-mask").forEach((element) => {
    restoreSvgPrivateText(element);
    element.classList.remove("privacy-mask");
  });
  document
    .querySelectorAll(
      [
        ".metric strong",
        ".legend-line:last-child span",
        ".bar-meta span",
        ".line-legend span",
        ".latest-label text",
        ".axis-value",
        "td.numeric",
      ].join(", "),
    )
    .forEach((element) => {
      updateSvgPrivateText(element);
      element.classList.add("privacy-mask");
    });
}

function updateSvgPrivateText(element) {
  if (element.namespaceURI !== "http://www.w3.org/2000/svg" || element.tagName.toLowerCase() !== "text") {
    return;
  }
  if (!element.dataset.publicText) {
    element.dataset.publicText = element.textContent;
  }
  element.textContent = privacyMode ? "***" : element.dataset.publicText;
}

function restoreSvgPrivateText(element) {
  if (element.namespaceURI !== "http://www.w3.org/2000/svg" || element.tagName.toLowerCase() !== "text") {
    return;
  }
  if (element.dataset.publicText) {
    element.textContent = element.dataset.publicText;
  }
}

function formatCurrencyValue(value, currency) {
  if (currency === "USD") {
    return new Intl.NumberFormat("zh-TW", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }
  return formatMoney(value);
}

function formatSignedCurrencyValue(value, currency) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatCurrencyValue(value, currency)}`;
}

function formatSignedMoney(value) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatMoney(value)}`;
}

function formatPercent(value) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${new Intl.NumberFormat("zh-TW", {
    maximumFractionDigits: 2,
  }).format(value)}%`;
}

function formatMonth(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.getFullYear()}/${date.getMonth() + 1}`;
}

function sortRows(rows) {
  const directionFactor = tableSort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const aValue = a[tableSort.key];
    const bValue = b[tableSort.key];

    if (numericSortKeys.has(tableSort.key)) {
      return (Number(aValue) - Number(bValue)) * directionFactor;
    }

    return String(aValue || "").localeCompare(String(bValue || ""), "zh-Hant", {
      numeric: true,
      sensitivity: "base",
    }) * directionFactor;
  });
}

function updateSortButtons() {
  document.querySelectorAll(".sort-button").forEach((button) => {
    const isActive = button.dataset.sortKey === tableSort.key;
    button.classList.toggle("is-active", isActive);
    button.dataset.sortDirection = isActive ? tableSort.direction : "";
    button.setAttribute("aria-sort", isActive ? (tableSort.direction === "asc" ? "ascending" : "descending") : "none");
  });
}

function formatMoney(value) {
  return new Intl.NumberFormat("zh-TW", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompactMoney(value) {
  return new Intl.NumberFormat("zh-TW", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-TW", {
    maximumFractionDigits: 4,
  }).format(value);
}

function setStatus(message) {
  elements.sourceStatus.textContent = message;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
