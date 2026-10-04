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
  return path.extname(filePath).replace(".", "").toLowerCase() || "bin";
}

export function registerSource(filePath, options = {}) {
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
  const extraction = JSON.parse(fs.readFileSync(path.resolve(extractionPath), "utf8"));
  if (!extraction.sourceId) throw new Error("Extraction requires sourceId.");

  const sources = readJson("sources");
  const source = sources.find((item) => item.id === extraction.sourceId);
  if (!source) throw new Error(`Unknown source: ${extraction.sourceId}`);

  const tasks = readJson("tasks");
  const createdTaskIds = [];
  for (const item of extraction.tasks ?? []) {
    const task = {
      id: item.id ?? createId("T"),
      parentId: item.parentId ?? "Q0",
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
    tasks.push(task);
    createdTaskIds.push(task.id);
  }
  saveTasks(tasks);

  const decisions = readJson("decisions");
  for (const item of extraction.decisions ?? []) {
    decisions.push({
      id: item.id ?? createId("D"),
      parentId: item.parentId ?? "Q0",
      title: item.title,
      status: item.status ?? "open",
      decisionBy: item.decisionBy ?? null,
      earlyReviewAt: item.earlyReviewAt ?? null,
      options: item.options ?? [],
      evidenceNeeded: item.evidenceNeeded ?? [],
      sourceIds: [source.id],
      updatedAt: nowIso()
    });
  }
  saveDecisions(decisions);

  source.status = "processed";
  source.summary = extraction.summary ?? source.summary;
  source.facts = extraction.facts ?? [];
  source.taskIds = [...new Set([...(source.taskIds ?? []), ...createdTaskIds])];
  saveSources(sources);

  const result = {
    sourceId: source.id,
    status: source.status,
    createdTaskIds,
    createdDecisionCount: (extraction.decisions ?? []).length
  };
  writeJson("last-import.json", result);
  return result;
}

