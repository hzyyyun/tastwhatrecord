// 资料入口：登记原始材料，并把经过人工/AI 提取的结构化结果写回数据集。
import fs from "node:fs";
import path from "node:path";
import {
  DATA_DIR,
  createId,
  nowIso,
  readJson,
  saveDecisions,
  saveSources,
  saveTasks,
  sha256,
  writeJson
} from "./store.mjs";

function extension(filePath) {
  // 无扩展名时使用 bin，保证后续类型判断总有一个稳定值。
  return path.extname(filePath).replace(".", "").toLowerCase() || "bin";
}

export function registerSource(filePath, options = {}) {
  // 使用内容哈希去重，同一材料重复登记时直接返回已有资料记录。
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) throw new Error(`Source not found: ${absolute}`);
  const stat = fs.statSync(absolute);
  const type = options.type ?? "file";
  const title = options.title ?? path.basename(absolute);
  const buffer = fs.readFileSync(absolute);
  const hash = sha256(buffer);
  const isText = type === "chat"
    || type === "text"
    || ["md", "txt", "json", "csv", "jsonl"].includes(extension(absolute));

  // 文本材料额外复制到 data/inbox，避免原路径失效后无法复查。
  let copiedPath = null;
  if (isText) {
    const inbox = path.join(DATA_DIR, "inbox");
    fs.mkdirSync(inbox, { recursive: true });
    copiedPath = path.join(inbox, `${hash.slice(0, 16)}.${extension(absolute)}`);
    if (!fs.existsSync(copiedPath)) fs.writeFileSync(copiedPath, buffer);
  }

  const sources = readJson("sources");
  const existing = sources.find((source) => source.hash === hash);
  if (existing) return existing;

  const source = {
    id: createId("SRC"),
    title,
    type,
    path: absolute,
    copiedPath,
    hash,
    size: stat.size,
    capturedAt: nowIso(),
    status: isText ? "pending_extraction" : "pending_vision",
    note: options.note ?? "",
    summary: "",
    taskIds: []
  };
  sources.push(source);
  saveSources(sources);
  return source;
}

export function importExtraction(extractionPath) {
  // 提取结果只创建任务和决策；原始资料记录负责保存来源和事实摘要。
  const extraction = JSON.parse(fs.readFileSync(path.resolve(extractionPath), "utf8"));
  if (!extraction.sourceId) throw new Error("Extraction requires sourceId.");

  const sources = readJson("sources");
  const source = sources.find((item) => item.id === extraction.sourceId);
  if (!source) throw new Error(`Unknown source: ${extraction.sourceId}`);

  const goals = readJson("goals");
  const goalIds = new Set(goals.map((goal) => goal.id));
  const fallbackGoalId = goals.find((goal) => goal.status === "active")?.id ?? goals[0]?.id;
  if (!fallbackGoalId) throw new Error("Extraction requires at least one configured goal.");

  const tasks = readJson("tasks");
  const taskIds = new Set(tasks.map((task) => task.id));
  const createdTaskIds = [];
  for (const item of extraction.tasks ?? []) {
    // 每个提取任务都挂到来源，形成从资料到行动的可追溯链路。
    const task = {
      id: item.id ?? createId("T"),
      parentId: item.parentId ?? fallbackGoalId,
      title: item.title,
      type: item.type ?? "action",
      status: item.status ?? "todo",
      priority: item.priority ?? 2,
      impact: item.impact ?? 3,
      dueAt: item.dueAt ?? null,
      reviewAt: item.reviewAt ?? null,
      estimateMin: item.estimateMin ?? 0,
      acceptance: item.acceptance ?? "",
      tags: item.tags ?? [],
      sourceIds: [source.id],
      updatedAt: nowIso()
    };
    if (!task.title) throw new Error("Every extracted task requires a title.");
    if (!goalIds.has(task.parentId)) throw new Error(`Unknown goal for extracted task: ${task.parentId}`);
    if (taskIds.has(task.id)) throw new Error(`Duplicate extracted task id: ${task.id}`);
    taskIds.add(task.id);
    tasks.push(task);
    createdTaskIds.push(task.id);
  }
  const decisions = readJson("decisions");
  const decisionIds = new Set(decisions.map((decision) => decision.id));
  for (const item of extraction.decisions ?? []) {
    // 决策记录保留选项和待补证据，不在此阶段做自动决断。
    const decision = {
      id: item.id ?? createId("D"),
      parentId: item.parentId ?? fallbackGoalId,
      title: item.title,
      status: item.status ?? "open",
      decisionBy: item.decisionBy ?? null,
      earlyReviewAt: item.earlyReviewAt ?? null,
      options: item.options ?? [],
      evidenceNeeded: item.evidenceNeeded ?? [],
      sourceIds: [source.id],
      updatedAt: nowIso()
    };
    if (!decision.parentId || !goalIds.has(decision.parentId)) {
      throw new Error(`Unknown goal for extracted decision: ${decision.parentId}`);
    }
    if (decisionIds.has(decision.id)) throw new Error(`Duplicate extracted decision id: ${decision.id}`);
    decisionIds.add(decision.id);
    decisions.push(decision);
  }
  // 任务和决策都完成校验后再写入，避免其中一个失败时留下半次导入。
  saveTasks(tasks);
  saveDecisions(decisions);

  source.status = "processed";
  source.summary = extraction.summary ?? source.summary;
  source.facts = extraction.facts ?? [];
  source.taskIds = [...new Set([...(source.taskIds ?? []), ...createdTaskIds])];
  saveSources(sources);

  const result = {
    // 导入摘要方便 CLI 和后续自动化检查本次执行结果。
    sourceId: source.id,
    status: source.status,
    createdTaskIds,
    createdDecisionCount: (extraction.decisions ?? []).length
  };
  // writeJson 只接受已登记的数据集名；导入摘要使用独立文件写入。
  writeJson("lastImport", result);
  return result;
}
