export async function performTavilySearch(options) {
  const {
    apiKey,
    query,
    maxResults = 5,
    nextReviewAt,
    fetchImpl = fetch
  } = options;
  if (!apiKey) throw new Error("请先在设置里填入 Tavily API Key，才能使用联网功能。");
  if (!String(query).trim()) throw new Error("请输入研究问题。");
  const accessedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let response;
  try {
    response = await fetchImpl("https://api.tavily.com/search", {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        include_answer: true,
        max_results: maxResults
      })
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Tavily 请求超时，请稍后重试。");
    }
    throw new Error("Tavily 网络连接失败，请检查网络和 API Key。");
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`Tavily 请求失败：HTTP ${response.status}`);
  const payload = await response.json();
  const records = (payload.results ?? []).map((result) => ({
    title: String(result.title ?? ""),
    url: String(result.url ?? ""),
    content: String(result.content ?? ""),
    score: Number(result.score ?? 0),
    accessedAt,
    nextReviewAt
  }));
  return {
    query,
    answer: String(payload.answer ?? ""),
    records,
    accessedAt,
    nextReviewAt
  };
}

export function getUsageDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function getUsageMonthKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit"
  }).format(date);
}

export function nextUsageRecord(record, date = new Date()) {
  const dateKey = getUsageDateKey(date);
  const monthKey = getUsageMonthKey(date);
  const dailyCount = record?.dateKey === dateKey ? Number(record.dailyCount ?? record.count ?? 0) : 0;
  const monthlyCount = record?.monthKey === monthKey ? Number(record.monthlyCount ?? 0) : 0;
  return {
    dateKey,
    dailyCount: dailyCount + 1,
    monthKey,
    monthlyCount: monthlyCount + 1,
    updatedAt: date.toISOString()
  };
}

export function researchToMarkdown(result) {
  return [
    `# Tavily Research: ${result.query}`,
    "",
    `- 访问时间：${result.accessedAt}`,
    `- 下次复核：${result.nextReviewAt}`,
    "",
    "## 摘要",
    result.answer || "Tavily 未返回摘要。",
    "",
    "## 来源",
    ...result.records.flatMap((record, index) => [
      `### ${index + 1}. ${record.title || "未命名来源"}`,
      `- URL：${record.url}`,
      `- 访问时间：${record.accessedAt}`,
      `- 下次复核：${record.nextReviewAt}`,
      "",
      record.content,
      ""
    ])
  ].join("\n");
}
