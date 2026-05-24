const sampleRows = [
  { assetClass: "台股", assetName: "0050 元大台灣 50", account: "永豐證券", quantity: 42, price: 168.2, value: 7064.4, currency: "TWD" },
  { assetClass: "美股", assetName: "VOO", account: "海外券商", quantity: 12, price: 486.5, value: 5838, currency: "USD" },
  { assetClass: "現金", assetName: "活存", account: "薪轉戶", quantity: 1, price: 280000, value: 280000, currency: "TWD" },
  { assetClass: "債券", assetName: "投資級債 ETF", account: "海外券商", quantity: 80, price: 28.6, value: 2288, currency: "USD" },
  { assetClass: "基金", assetName: "全球科技基金", account: "銀行信託", quantity: 350, price: 21.4, value: 7490, currency: "TWD" },
];

const palette = ["#9f6f45", "#5f8061", "#5e7896", "#b16d63", "#bf8f3c", "#7d6a8f", "#4f817d"];
const numericSortKeys = new Set(["quantity", "price", "value", "baseValue", "cost", "proceeds", "dividend", "returnRate"]);
const dataSources = {
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
  realizedTaiwan: {
    sheetUrl:
      "https://docs.google.com/spreadsheets/d/1INZO4qzBoqy3WeKf-YQIrQW5VApO9hz8_FT4ewvvtT8/edit?gid=1172399332#gid=1172399332",
    sheetName: "股票損益(已實現)－台股",
    gid: "1172399332",
  },
  realizedUs: {
    sheetUrl:
      "https://docs.google.com/spreadsheets/d/1INZO4qzBoqy3WeKf-YQIrQW5VApO9hz8_FT4ewvvtT8/edit?gid=1172399332#gid=1172399332",
    sheetName: "股票損益(已實現)－美股",
    gid: "1172399332",
  },
};
let currentRows = [];
let currentView = "holdings";
let usdToTwdRate = 1;
let viewData = {
  holdings: [],
  realizedTw: [],
  realizedUs: [],
};
let tableSort = {
  key: "baseValue",
  direction: "desc",
};

const viewConfigs = {
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
    barSubtitle: "依總獲利",
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
    barSubtitle: "依總獲利",
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

renderView();
loadFixedSources();

async function loadFixedSources() {
  try {
    setStatus("資料載入中...");
    const [taiwanRows, foreignRows] = await Promise.all([
      fetchSheetRows(
        dataSources.taiwan.sheetUrl,
        dataSources.taiwan.sheetName,
        dataSources.taiwan.gid,
        normalizeTaiwanStockRow,
      ),
      fetchForeignAccountRows(dataSources.foreign.sheetUrl, dataSources.foreign.sheetName, dataSources.foreign.gid),
    ]);
    const [realizedTaiwanRows, realizedUsRows] = await Promise.all([
      fetchRealizedRows(
        dataSources.realizedTaiwan.sheetUrl,
        dataSources.realizedTaiwan.sheetName,
        dataSources.realizedTaiwan.gid,
        normalizeRealizedTaiwanRow,
      ),
      fetchRealizedRows(
        dataSources.realizedUs.sheetUrl,
        dataSources.realizedUs.sheetName,
        dataSources.realizedUs.gid,
        normalizeRealizedUsRow,
      ),
    ]);
    viewData = {
      holdings: [...taiwanRows, ...foreignRows].filter((row) => row.baseValue > 0 && row.quantity > 0),
      realizedTw: realizedTaiwanRows,
      realizedUs: realizedUsRows,
    };
    renderView();
    const usdRate = foreignRows.find((row) => row.currency === "USD")?.exchangeRate;
    setStatus(
      `已載入：目前持股 ${viewData.holdings.length} 筆，台股已實現 ${realizedTaiwanRows.length} 筆，美股已實現 ${realizedUsRows.length} 筆${usdRate ? `，USD/TWD ${usdRate}` : ""}`,
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
  return rowsToObjects(parseCsvRows(csv))
    .map(normalizer)
    .filter(isActiveAssetRow);
}

async function fetchForeignAccountRows(sheetUrl, sheetName, gid) {
  if (!sheetName) {
    return [];
  }
  const csv = await fetchSheetCsv(sheetUrl, sheetName, gid);
  return parseForeignAccountRows(parseCsvRows(csv)).filter(isActiveAssetRow);
}

async function fetchRealizedRows(sheetUrl, sheetName, gid, normalizer) {
  const csv = await fetchSheetCsv(sheetUrl, sheetName, gid);
  return rowsToObjects(parseCsvRows(csv))
    .map(normalizer)
    .filter((row) => row.assetName && row.assetName !== "Total" && row.cost > 0);
}

async function fetchSheetCsv(sheetUrl, sheetName, gid) {
  const csvUrl = buildSheetApiUrl(sheetUrl, sheetName, gid);
  const response = await fetch(csvUrl);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Google Sheet 回應錯誤：${response.status}`);
  }
  return response.text();
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

function normalizeRealizedTaiwanRow(row) {
  const cost = toNumber(readColumn(row, ["買進成本"]));
  const proceeds = toNumber(readColumn(row, ["賣出總額"]));
  const dividend = toNumber(readColumn(row, ["配息"]));
  const value = toNumber(readColumn(row, ["總獲利", "淨利"]));
  return {
    assetClass: value >= 0 ? "獲利" : "虧損",
    assetName: readColumn(row, ["名稱"]),
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

function findUsdToTwdRate(rows) {
  const candidate = rows.find((row) => String(row[1] || "").trim() === "股票成本" && toNumber(row[3]) > 0);
  return candidate ? toNumber(candidate[3]) : 1;
}

function readColumn(row, names) {
  const key = names.find((name) => Object.prototype.hasOwnProperty.call(row, name));
  return key ? row[key] : "";
}

function toNumber(value) {
  const cleaned = String(value || "").replace(/[$,，\s]/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function toPercent(value) {
  const cleaned = String(value || "").replace(/[%％,\s]/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function renderDashboard(rows) {
  currentRows = rows;
  const config = viewConfigs[currentView];
  const isRealizedView = currentView !== "holdings";
  const total = sum(rows, "baseValue");
  const chartRows = isRealizedView ? rows.filter((row) => row.baseValue > 0) : rows;
  const chartTotal = sum(chartRows, "baseValue");
  const byClass = groupSum(chartRows, "assetClass");
  const byAccount = groupSum(chartRows, isRealizedView ? "assetName" : "account");
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

  renderDonut(byClass, chartTotal);
  renderBars(byAccount, chartTotal);
  renderTableHead();
  renderTable(rows, elements.tableSearch.value);
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

function groupSum(rows, key) {
  return rows.reduce((map, row) => {
    map.set(row[key], (map.get(row[key]) || 0) + row.baseValue);
    return map;
  }, new Map());
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + row[key], 0);
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

function renderTable(rows, query = "") {
  const keyword = query.trim().toLowerCase();
  const filteredRows = keyword
    ? rows.filter((row) =>
        [row.assetClass, row.assetName, row.account, row.currency].some((value) =>
          String(value).toLowerCase().includes(keyword),
        ),
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
