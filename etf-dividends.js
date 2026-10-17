(function (root) {
  const CACHE_TTL = 6 * 60 * 60 * 1000;
  const API = "https://api.finmindtrade.com/api/v4/data";

  function taiwanToday() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }

  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function normalize(records, ticker, today = taiwanToday()) {
    const events = new Map();
    for (const row of [...records].sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
      if (String(row.stock_id) !== ticker) continue;
      const paymentDate = row.CashDividendPaymentDate;
      const exDate = row.CashExDividendTradingDate;
      const amount = Number(row.CashEarningsDistribution || 0) + Number(row.CashStatutorySurplus || 0);
      if (!validDate(paymentDate) || !validDate(exDate) || !Number.isFinite(amount) || amount <= 0) continue;
      // Corrections to the same ex-dividend event replace earlier announcements.
      events.set(exDate, { paymentDate, exDate, amount });
    }
    const all = [...events.values()].sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
    return {
      paid: all.filter((row) => row.paymentDate <= today).slice(0, 4),
      upcoming: all.filter((row) => row.paymentDate > today).reverse(),
    };
  }

  function normalizeCatalog(records) {
    const latest = {};
    for (const row of records) {
      if (["twse", "tpex"].includes(row.type) && validDate(row.date)) latest[row.type] = [latest[row.type] || "", row.date].sort().at(-1);
    }
    const funds = new Map();
    for (const row of records) {
      if (!/ETF/.test(row.industry_category) || !["twse", "tpex"].includes(row.type) || row.date !== latest[row.type]) continue;
      if (!/^00\d{2,4}[A-Z]?$/.test(row.stock_id)) continue;
      funds.set(row.stock_id, { ticker: row.stock_id, name: row.stock_name, market: row.type === "twse" ? "上市" : "上櫃" });
    }
    return [...funds.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
  }

  async function fetchCatalog(force = false) {
    let cache;
    try { cache = JSON.parse(root.localStorage.getItem("etf-catalog-v1")); } catch {}
    const usable = Array.isArray(cache?.funds) && cache.funds.length && Number.isFinite(cache.updatedAt);
    if (!force && usable && Date.now() - cache.updatedAt < CACHE_TTL) return { ...cache, stale: false };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await root.fetch(`${API}?dataset=TaiwanStockInfo`, { signal: controller.signal });
      const body = await response.json();
      if (!response.ok || body.status !== 200 || !Array.isArray(body.data)) throw new Error("ETF 清單暫時無法取得");
      const funds = normalizeCatalog(body.data);
      if (!funds.length) throw new Error("ETF 清單沒有可用資料");
      const result = { funds, updatedAt: Date.now() };
      try { root.localStorage.setItem("etf-catalog-v1", JSON.stringify(result)); } catch {}
      return { ...result, stale: false };
    } catch (error) {
      if (usable) return { ...cache, stale: true };
      throw error;
    } finally { clearTimeout(timer); }
  }

  async function fetchHistory(ticker, { force = false, storage = root.localStorage, fetcher = root.fetch.bind(root) } = {}) {
    const key = `etf-dividends-v1:${ticker}`;
    let cached;
    try { cached = JSON.parse(storage.getItem(key)); } catch { /* Storage may be disabled. */ }
    const usable = cached?.ticker === ticker && Array.isArray(cached.records) && Number.isFinite(cached.updatedAt);
    if (!force && usable && Date.now() - cached.updatedAt < CACHE_TTL) return { ...cached, stale: false };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const query = new URLSearchParams({ dataset: "TaiwanStockDividend", data_id: ticker, start_date: "2005-01-01" });
      const response = await fetcher(`${API}?${query}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`行情來源回應 ${response.status}`);
      const body = await response.json();
      if (body.status !== 200 || !Array.isArray(body.data)) throw new Error("配息來源暫時無法提供資料");
      const result = { ticker, updatedAt: Date.now(), records: body.data };
      try { storage.setItem(key, JSON.stringify(result)); } catch { /* The current response remains usable. */ }
      return { ...result, stale: false };
    } catch (error) {
      if (usable) return { ...cached, stale: true };
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchYieldDataset(dataset, ticker, force = false) {
    const key = `etf-yield-v1:${dataset}:${ticker}`;
    let cache;
    try { cache = JSON.parse(root.localStorage.getItem(key)); } catch {}
    const usable = Array.isArray(cache?.records) && Number.isFinite(cache.updatedAt);
    if (!force && usable && Date.now() - cache.updatedAt < CACHE_TTL) return { ...cache, stale: false };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const query = new URLSearchParams({ dataset });
      if (ticker) {
        query.set("data_id", ticker);
        query.set("start_date", new Date(Date.parse(`${taiwanToday()}T00:00:00Z`) - 30 * 86400000).toISOString().slice(0, 10));
      }
      const response = await root.fetch(`${API}?${query}`, { signal: controller.signal });
      const body = await response.json();
      if (!response.ok || body.status !== 200 || !Array.isArray(body.data)) throw new Error("年化配息率資料讀取失敗");
      const result = { records: body.data, updatedAt: Date.now() };
      try { root.localStorage.setItem(key, JSON.stringify(result)); } catch {}
      return { ...result, stale: false };
    } catch (error) {
      if (usable) return { ...cache, stale: true };
      throw error;
    } finally { clearTimeout(timer); }
  }

  let splitRequest;
  async function fetchYieldInputs(ticker, force = false) {
    const prices = await fetchYieldDataset("TaiwanStockPrice", ticker, force);
    if (!splitRequest) splitRequest = fetchYieldDataset("TaiwanStockSplitPrice", "", force).finally(() => { splitRequest = null; });
    const splits = await splitRequest;
    const quote = prices.records.filter((row) => row.stock_id === ticker && validDate(row.date) && row.date <= taiwanToday() && Number(row.close) > 0)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    return { quote, splits: splits.records, stale: prices.stale || splits.stale };
  }

  function estimateYield(paid, quote, splits, ticker, today = taiwanToday()) {
    if (paid.length < 2) return { reason: "配息紀錄不足，暫無法判斷頻率" };
    if (!quote || !validDate(quote.date) || !Number.isFinite(Number(quote.close)) || Number(quote.close) <= 0) return { reason: "暫無可用收盤價" };
    const day = (date) => Date.parse(`${date}T00:00:00Z`) / 86400000;
    if (day(today) - day(quote.date) > 14 || quote.date > today) return { reason: "收盤價日期過舊，暫不估算" };
    const rows = [...paid].sort((a, b) => b.exDate.localeCompare(a.exDate)).slice(0, 4);
    const gaps = rows.slice(1).map((row, i) => day(rows[i].exDate) - day(row.exDate));
    const frequency = [
      { label: "月配", count: 12, min: 20, max: 45 },
      { label: "季配", count: 4, min: 65, max: 115 },
      { label: "半年配", count: 2, min: 140, max: 225 },
      { label: "年配", count: 1, min: 300, max: 430 },
    ].find((item) => gaps.every((gap) => gap >= item.min && gap <= item.max));
    if (!frequency) return { reason: "配息頻率不規則或變更中，暫不估算" };
    if (day(today) - day(rows[0].paymentDate) > frequency.max * 1.75) return { reason: "最近配息已超過推估週期，暫不估算" };
    const events = new Map(splits.filter((row) => row.stock_id === ticker).map((row) => [row.date, row]));
    // Provider omits 0050's split. Exact ratio from Yuanta's 2025-06-17 announcement:
    // https://wwwc.twse.com.tw/zh/ETFortune/announcement?company=A00005&date=20250617&fund=0050&seq=1&type=other
    if (ticker === "0050") events.set("2025-06-18", { date: "2025-06-18", before_price: 4, after_price: 1 });
    let adjusted = false;
    let sum = 0;
    for (const row of rows) {
      let amount = row.amount;
      for (const split of events.values()) {
        if (!validDate(split.date)) return { reason: "分割日期不完整，暫不估算" };
        if (split.date <= row.exDate || split.date > quote.date) continue;
        const ratio = Number(split.before_price) / Number(split.after_price);
        if (!Number.isFinite(ratio) || ratio <= 0) return { reason: "分割比例不完整，暫不估算" };
        // Reference prices are rounded; ETF splits use integer multiples.
        const factor = ratio >= 1 ? Math.round(ratio) : 1 / Math.round(1 / ratio);
        if (Math.abs(ratio / factor - 1) > 0.01) return { reason: "分割比例需確認，暫不估算" };
        amount /= factor;
        adjusted = true;
      }
      sum += amount;
    }
    const annualDividend = sum / rows.length * frequency.count;
    return { rate: annualDividend / Number(quote.close) * 100, annualDividend, frequency: frequency.label, count: rows.length, adjusted };
  }

  const api = { normalize, normalizeCatalog, fetchHistory, fetchCatalog, taiwanToday, fetchYieldInputs, estimateYield };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.EtfDividends = api;
})(typeof window !== "undefined" ? window : globalThis);
