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

