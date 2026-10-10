// 基础网页研究模块：抓取页面、保存原文和研究提示，不调用外部 AI。
import fs from "node:fs";
import path from "node:path";
import {
  RESEARCH_DIR,
  createId,
  nowIso,
  readJson,
  saveSources,
  saveTasks
} from "./store.mjs";

function htmlToText(html) {
  // 移除脚本和样式后再剥离标签，保留足够给人工复查的正文。
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchResearch(options) {
  // 网络请求必须有超时，避免 CLI 长时间无响应。
  if (!options.url) throw new Error("research requires --url");
  const taskId = options.task;
  const tasks = readJson("tasks");
  const task = tasks.find((item) => item.id === taskId);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
  let response;
  try {
    response = await fetch(options.url, {
      signal: controller.signal,
      headers: { "user-agent": "StudentPlannerOS/0.1" }
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);

  const html = await response.text();
  // 控制单次抓取体积，防止超大页面占满本地文件。
  const text = htmlToText(html).slice(0, 40_000);
  const capturedAt = nowIso();
  const sourceId = createId("SRC");
  const researchId = createId("RES");
  const prefix = `${researchId}-${taskId ?? "general"}`;
  const textPath = path.join(RESEARCH_DIR, `${prefix}.txt`);
  const notePath = path.join(RESEARCH_DIR, `${prefix}.md`);
  fs.mkdirSync(RESEARCH_DIR, { recursive: true });
  fs.writeFileSync(textPath, `${text}\n`, "utf8");

  const note = [
    // 研究包同时保存来源、抓取时间和提取约束，供模型/人工继续处理。
    `# Research Pack: ${task?.title ?? options.question ?? "General"}`,
    "",
    `- Task: ${taskId ?? "none"}`,
    `- URL: ${options.url}`,
    `- Captured: ${capturedAt}`,
    `- Question: ${options.question ?? "未指定"}`,
    "",
    "## Extraction instructions",
    "",
    "1. 只提取与问题和任务验收标准直接相关的信息。",
    "2. 每条关键结论必须对应本文件中的原文证据。",
    "3. 明确区分事实、推断和仍待核实的信息。",
    "4. 输出：结论、证据、影响、下一步、下一次复核日期。",
    "",
    "## Source text",
    "",
    text
  ].join("\n");
  fs.writeFileSync(notePath, `${note}\n`, "utf8");

  const sources = readJson("sources");
  // 网页来源登记为待分析资料，并关联到调用方指定任务。
  sources.push({
    id: sourceId,
    title: options.title ?? `Web research: ${options.url}`,
    type: "web",
    path: options.url,
    copiedPath: textPath,
    capturedAt,
    status: "pending_analysis",
    note: options.question ?? "",
    summary: "",
    taskIds: taskId ? [taskId] : [],
    researchPack: notePath,
    nextReviewAt: options.nextReviewAt ?? null
  });
  saveSources(sources);

  if (task) {
    task.sourceIds = [...new Set([...(task.sourceIds ?? []), sourceId])];
    task.updatedAt = capturedAt;
    saveTasks(tasks);
  }

  return { sourceId, taskId, researchPack: notePath, sourceText: textPath };
}
