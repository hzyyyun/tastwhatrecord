// CLI 数据层：统一负责 JSON 文件定位、默认文件创建、原子写入和状态规范化。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { normalizeState } from "./schema.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "..");
export const DATA_DIR = path.join(ROOT, "data");
export const GENERATED_DIR = path.join(ROOT, "generated");
export const RESEARCH_DIR = path.join(GENERATED_DIR, "research");

// 一个数据集只对应一个文件；键名是代码内名称，值名是对外文件名。
const FILES = {
  config: "config.json",
  goals: "goals.json",
  tasks: "tasks.json",
  sources: "sources.json",
  decisions: "decisions.json",
  schedule: "schedule.json",
  lastImport: "last-import.json"
};

export function ensureStore() {
  // 首次运行或目录被清理后，自动补齐数据目录和空文件。
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  fs.mkdirSync(RESEARCH_DIR, { recursive: true });

  for (const [name, file] of Object.entries(FILES)) {
    const target = path.join(DATA_DIR, file);
    if (fs.existsSync(target)) continue;
    const initial = name === "config" || name === "lastImport" ? {} : [];
    fs.writeFileSync(target, `${JSON.stringify(initial, null, 2)}\n`, "utf8");
  }
}

export function readJson(name) {
  ensureStore();
  const file = FILES[name];
  if (!file) throw new Error(`Unknown data set: ${name}`);
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
}

export function writeJson(name, value) {
  ensureStore();
  const file = FILES[name];
  if (!file) throw new Error(`Unknown data set: ${name}`);
  const target = path.join(DATA_DIR, file);
  // 先写临时文件再重命名，避免进程中断时留下半截 JSON。
  const temp = `${target}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temp, target);
}

export function loadState() {
  // 读取分散在各文件的数据，并在进入业务逻辑前补齐可选字段。
  ensureStore();
  return normalizeState({
    config: readJson("config"),
    goals: readJson("goals"),
    tasks: readJson("tasks"),
    sources: readJson("sources"),
    decisions: readJson("decisions"),
    schedule: readJson("schedule")
  });
}

export function saveSchedule(schedule) {
  writeJson("schedule", schedule);
}

export function saveTasks(tasks) {
  writeJson("tasks", tasks);
}

export function saveSources(sources) {
  writeJson("sources", sources);
}

export function saveDecisions(decisions) {
  writeJson("decisions", decisions);
}

export function saveGoals(goals) {
  writeJson("goals", goals);
}

export function sha256(value) {
  // 用于资料去重，避免同一文件被重复登记。
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function nowIso() {
  return new Date().toISOString();
}

export function createId(prefix) {
  // 时间前缀保证可读，随机后缀避免同一秒内生成重复 ID。
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${stamp}-${suffix}`;
}

export function writeGenerated(file, content) {
  ensureStore();
  fs.writeFileSync(path.join(GENERATED_DIR, file), content, "utf8");
}
