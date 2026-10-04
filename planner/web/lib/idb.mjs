import { normalizeState } from "../../src/schema.mjs";
import {
  assertValidSchedule,
  assertValidState,
  validateDataset
} from "./validation.mjs";

export const DATASETS = ["config", "goals", "tasks", "sources", "decisions"];
const DB_NAME = "student-planner-os";
const DB_VERSION = 3;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("datasets")) {
        db.createObjectStore("datasets", { keyPath: "name" });
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("documents")) {
        db.createObjectStore("documents", { keyPath: "path" });
      }
      if (!db.objectStoreNames.contains("attachments")) {
        db.createObjectStore("attachments", { keyPath: "path" });
      }
      if (!db.objectStoreNames.contains("schedule")) {
        db.createObjectStore("schedule", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getSetting(db, key) {
  const transaction = db.transaction("settings", "readonly");
  const record = await requestResult(transaction.objectStore("settings").get(key));
  return record?.value;
}

export async function setSetting(db, key, value) {
  const transaction = db.transaction("settings", "readwrite");
  transaction.objectStore("settings").put({ key, value });
  await transactionDone(transaction);
}

export async function loadState(db, seedIfNeeded = true) {
  const transaction = db.transaction("datasets", "readonly");
  const store = transaction.objectStore("datasets");
  const records = await Promise.all(DATASETS.map((name) => requestResult(store.get(name))));
  const state = {};
  records.forEach((record, index) => {
    state[DATASETS[index]] = record?.value ?? (DATASETS[index] === "config" ? {} : []);
  });
  const initialized = await getSetting(db, "initialized");
  const hasData = records.some(Boolean);

  if (!initialized && !hasData && seedIfNeeded) {
    const seeded = await loadSeedState();
    await replaceState(db, seeded);
    await saveSchedule(db, await loadSeedSchedule());
    await setSetting(db, "initialized", true);
    return normalizeState(seeded);
  }

  return normalizeState(state);
}

export async function loadRawDatasets(db) {
  const transaction = db.transaction(["datasets", "schedule"], "readonly");
  const datasetStore = transaction.objectStore("datasets");
  const scheduleStore = transaction.objectStore("schedule");
  const records = await Promise.all([
    ...DATASETS.map((name) => requestResult(datasetStore.get(name))),
    requestResult(scheduleStore.getAll())
  ]);
  const raw = {};
  DATASETS.forEach((name, index) => {
    const record = records[index];
    raw[name] = record?.value ?? (name === "config" ? {} : []);
  });
  raw.schedule = records[records.length - 1].map((course) => ({ ...course }));
  return raw;
}

export async function loadSeedState() {
  const state = {};
  for (const name of DATASETS) {
    const response = await fetch(new URL(`../seed/${name}.json`, import.meta.url), { cache: "no-store" });
    if (!response.ok) throw new Error(`无法读取初始数据：${name}.json`);
    state[name] = await response.json();
  }
  return state;
}

export async function loadSeedSchedule() {
  const response = await fetch(new URL("../seed/schedule.json", import.meta.url), { cache: "no-store" });
  if (!response.ok) throw new Error("无法读取初始课表：schedule.json");
  return response.json();
}

export async function saveDataset(db, name, value) {
  if (!DATASETS.includes(name)) throw new Error(`未知数据集：${name}`);
  const validation = validateDataset(name, value);
  if (!validation.success) {
    throw new Error(`数据写入被拒绝：${name}`);
  }
  const transaction = db.transaction("datasets", "readwrite");
  transaction.objectStore("datasets").put({
    name,
    value: validation.data,
    updatedAt: new Date().toISOString()
  });
  await transactionDone(transaction);
}

export async function replaceState(db, state) {
  const normalized = assertValidState(normalizeState(state));
  const transaction = db.transaction("datasets", "readwrite");
  const store = transaction.objectStore("datasets");
  for (const name of DATASETS) {
    store.put({ name, value: normalized[name], updatedAt: new Date().toISOString() });
  }
  await transactionDone(transaction);
  await setSetting(db, "initialized", true);
  return normalized;
}

export async function clearLocalData(db) {
  const transaction = db.transaction(["datasets", "documents", "attachments", "schedule"], "readwrite");
  transaction.objectStore("datasets").clear();
  transaction.objectStore("documents").clear();
  transaction.objectStore("attachments").clear();
  transaction.objectStore("schedule").clear();
  await transactionDone(transaction);
  await setSetting(db, "initialized", true);
}

export async function loadDocuments(db) {
  const transaction = db.transaction("documents", "readonly");
  const records = await requestResult(transaction.objectStore("documents").getAll());
  return records.map((record) => ({ path: record.path, content: record.content }));
}

export async function saveDocuments(db, documents) {
  const transaction = db.transaction("documents", "readwrite");
  const store = transaction.objectStore("documents");
  for (const document of documents) {
    store.put({
      path: document.path,
      content: document.content,
      updatedAt: new Date().toISOString()
    });
  }
  await transactionDone(transaction);
}

export async function loadAttachments(db) {
  const transaction = db.transaction("attachments", "readonly");
  const records = await requestResult(transaction.objectStore("attachments").getAll());
  return records.map((record) => ({
    path: record.path,
    name: record.name,
    type: record.type,
    size: record.size,
    blob: record.blob
  }));
}

export async function saveAttachments(db, attachments) {
  const transaction = db.transaction("attachments", "readwrite");
  const store = transaction.objectStore("attachments");
  for (const attachment of attachments) {
    store.put({
      path: attachment.path,
      name: attachment.name,
      type: attachment.type,
      size: attachment.size,
      blob: attachment.blob,
      updatedAt: new Date().toISOString()
    });
  }
  await transactionDone(transaction);
}

export async function loadSchedule(db) {
  const transaction = db.transaction("schedule", "readonly");
  return requestResult(transaction.objectStore("schedule").getAll());
}

export async function saveSchedule(db, schedule) {
  const validated = assertValidSchedule(schedule);
  const transaction = db.transaction("schedule", "readwrite");
  const store = transaction.objectStore("schedule");
  store.clear();
  for (const course of validated) {
    store.put(course);
  }
  await transactionDone(transaction);
  return validated;
}
