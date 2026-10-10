// 备份归档层：生成不含密钥的 ZIP，并在恢复时逐数据集校验和冲突展示。
import { decodeText, encodeText, readZip, writeZip } from "./zip.mjs";
import { assertValidSchedule, assertValidState } from "./validation.mjs";

export const BACKUP_FORMAT = "student-planner-backup";
export const BACKUP_FORMAT_VERSION = 2;
export const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;

const DATASETS = ["config", "goals", "tasks", "sources", "decisions"];
const SECRET_KEY_PATTERN = /(api.?key|token|secret|authorization|credential)/i;

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sanitizeSettings(settings = {}) {
  // 设置恢复只保留非敏感键；密钥类键名无论值为何都直接丢弃。
  const safe = {};
  for (const [key, value] of Object.entries(settings)) {
    if (SECRET_KEY_PATTERN.test(key)) continue;
    safe[key] = value;
  }
  return safe;
}

export async function createBackupArchive(options) {
  // 状态和课表先通过 Zod，再写入归档，避免导出已知损坏数据。
  const {
    state,
    settings = {},
    briefText = "",
    documents = [],
    attachments = [],
    schedule = []
  } = options;
  const exportedAt = new Date().toISOString();
  const files = [];
  const safeSettings = sanitizeSettings({
    ...settings,
    timezone: settings.timezone ?? state.config.timezone ?? "Asia/Shanghai",
    exportedAt,
    secretsIncluded: false
  });

  const validatedState = assertValidState(state);
  const validatedSchedule = assertValidSchedule(schedule);
  for (const name of DATASETS) {
    files.push({ name: `data/${name}.json`, data: encodeText(json(validatedState[name])) });
  }
  files.push({ name: "data/schedule.json", data: encodeText(json(validatedSchedule)) });
  files.push({ name: "settings.json", data: encodeText(json(safeSettings)) });
  files.push({ name: "briefs/CHATBOX_BRIEF.md", data: encodeText(`${briefText}\n`) });
  for (const document of documents) {
    if (!document?.path || typeof document.content !== "string") continue;
    files.push({ name: document.path, data: encodeText(document.content) });
  }
  for (const attachment of attachments) {
    if (!attachment?.path || !(attachment.data instanceof Uint8Array)) continue;
    files.push({ name: attachment.path, data: attachment.data });
  }

  const manifest = {
    // manifest 只列文件名和版本，不包含任何凭据。
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: state.config.schemaVersion ?? 1,
    exportedAt,
    secretsIncluded: false,
    files: files.map((file) => file.name)
  };
  files.unshift({
    name: "manifest.json",
    data: encodeText(json(manifest))
  });

  return {
    blob: await writeZip(files, { compress: true, date: new Date(exportedAt) }),
    manifest,
    settings: safeSettings
  };
}

function parseJsonEntry(entries, name, required = true) {
  // 缺失可选文件返回 null；必需文件缺失则拒绝导入。
  const data = entries.get(name);
  if (!data) {
    if (required) throw new Error(`备份缺少文件：${name}`);
    return null;
  }
  try {
    return JSON.parse(decodeText(data));
  } catch {
    throw new Error(`备份中的 JSON 无法解析：${name}`);
  }
}

export async function parseBackupArchive(source) {
  // 只接受本应用格式，且拒绝高于当前格式版本的备份。
  const entries = source instanceof Map ? source : await readZip(source);
  const manifest = parseJsonEntry(entries, "manifest.json");
  if (manifest.format !== BACKUP_FORMAT) {
    throw new Error("这不是 Student Planner OS 备份包。");
  }
  if (manifest.formatVersion > BACKUP_FORMAT_VERSION) {
    throw new Error("备份包版本高于当前 App，暂不能导入。");
  }

  const state = {};
  for (const name of DATASETS) {
    state[name] = parseJsonEntry(entries, `data/${name}.json`);
  }
  const rawSettings = parseJsonEntry(entries, "settings.json", false) ?? {};
  const schedule = parseJsonEntry(entries, "data/schedule.json", false) ?? [];
  const stateValidation = assertValidState(state);
  const scheduleValidation = assertValidSchedule(schedule);
  // 文档和附件只读取约定目录，避免恢复任意 ZIP 内容。
  const settings = sanitizeSettings(rawSettings);
  const briefData = entries.get("briefs/CHATBOX_BRIEF.md");
  const documents = [];
  const attachments = [];
  for (const [path, data] of entries) {
    if (path.startsWith("memory/") && path.endsWith(".md")) {
      documents.push({ path, content: decodeText(data) });
    }
    if (path.startsWith("files/")) {
      attachments.push({ path, data });
    }
  }

  return {
    manifest,
    state: stateValidation,
    schedule: scheduleValidation,
    settings,
    briefText: briefData ? decodeText(briefData) : "",
    documents,
    attachments,
    hasSecrets: Object.keys(rawSettings).some((key) => SECRET_KEY_PATTERN.test(key))
  };
}

export function detectDatasetConflicts(localState, incomingState) {
  // 冲突报告只比较数据集摘要，不替用户决定覆盖策略。
  return [...DATASETS, "schedule"].map((name) => {
    const localValue = localState[name];
    const incomingValue = incomingState[name];
    return {
      name,
      localCount: Array.isArray(localValue) ? localValue.length : undefined,
      incomingCount: Array.isArray(incomingValue) ? incomingValue.length : undefined,
      identical: JSON.stringify(localValue) === JSON.stringify(incomingValue)
    };
  });
}
