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
  const safe = {};
  for (const [key, value] of Object.entries(settings)) {
    if (SECRET_KEY_PATTERN.test(key)) continue;
    safe[key] = value;
  }
  return safe;
}

export async function createBackupArchive(options) {
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
