import test from "node:test";
import assert from "node:assert/strict";
import {
  createBackupArchive,
  detectDatasetConflicts,
  parseBackupArchive
} from "../web/lib/archive.mjs";
import {
  createChatboxFixtureZip,
  extractChatboxJson,
  extractChatboxSession,
  inspectChatboxJson,
  inspectChatboxZip
} from "../web/lib/chatbox.mjs";

const state = {
  config: { timezone: "Asia/Shanghai", schemaVersion: 1 },
  goals: [{ id: "Q1", title: "study" }],
  tasks: [{ id: "T1", parentId: "Q1", title: "task", status: "todo" }],
  sources: [],
  decisions: []
};

test("backup archive round-trips JSON and Markdown without secrets", async () => {
  const archive = await createBackupArchive({
    state,
    settings: { timezone: "Asia/Shanghai", apiKey: "must-not-appear" },
    briefText: "# Brief",
    documents: [{ path: "memory/requirements.md", content: "# Requirements" }],
    attachments: [{ path: "files/example.txt", data: new TextEncoder().encode("file-data") }],
    schedule: [{
      id: "course-1",
      dayOfWeek: 1,
      periodStart: 1,
      periodEnd: 2,
      title: "综合英语",
      location: "S-108"
    }]
  });
  const parsed = await parseBackupArchive(archive.blob);
  assert.equal(parsed.manifest.format, "student-planner-backup");
  assert.equal(parsed.manifest.secretsIncluded, false);
  assert.equal(parsed.state.goals[0].title, "study");
  assert.equal(parsed.briefText, "# Brief\n");
  assert.equal(parsed.documents[0].content, "# Requirements");
  assert.equal(new TextDecoder().decode(parsed.attachments[0].data), "file-data");
  assert.equal(parsed.schedule[0].title, "综合英语");
  assert.equal(Object.hasOwn(parsed.settings, "apiKey"), false);
  assert.equal(parsed.hasSecrets, false);
});

test("backup archive rejects a foreign ZIP", async () => {
  const { writeZip } = await import("../web/lib/zip.mjs");
  const blob = await writeZip([{ name: "other.txt", data: "x" }]);
  await assert.rejects(() => parseBackupArchive(blob), /缺少文件/);
});

test("conflict preview reports dataset differences without choosing a winner", () => {
  const conflicts = detectDatasetConflicts(state, {
    ...state,
    tasks: [...state.tasks, { id: "T2", parentId: "Q1", title: "other" }]
  });
  const tasks = conflicts.find((item) => item.name === "tasks");
  assert.equal(tasks.identical, false);
  assert.equal(tasks.localCount, 1);
  assert.equal(tasks.incomingCount, 2);
});

test("Chatbox inspection reads only the manifest", async () => {
  const blob = await createChatboxFixtureZip();
  const inspection = await inspectChatboxZip(blob);
  assert.equal(inspection.sessions.length, 2);
  assert.equal(inspection.sessions[0].name, "目标会话");
});

test("Chatbox extraction ignores unselected invalid sessions and private reasoning", async () => {
  const blob = await createChatboxFixtureZip();
  const extracted = await extractChatboxSession(blob, "sessions/selected/session.json");
  assert.equal(extracted.counts.requirements, 1);
  assert.equal(extracted.counts.architecture, 1);
  assert.match(extracted.documents[0].content, /需要建立外部记忆库/);
  assert.match(extracted.documents[1].content, /任务树、抬升链和巡检链/);
  assert.doesNotMatch(extracted.documents[1].content, /private/);
});

test("single-session Chatbox JSON can produce an extraction preview", async () => {
  const file = {
    name: "session.json",
    text: async () => JSON.stringify({
      id: "json-session",
      name: "JSON 会话",
      messages: [
        { role: "user", contentParts: [{ type: "text", text: "需要接入本地记忆。" }] },
        { role: "assistant", contentParts: [{ type: "text", text: "整体架构包含任务树和抬升链。" }] }
      ]
    })
  };
  const inspection = await inspectChatboxJson(file);
  assert.equal(inspection.sessions[0].name, "JSON 会话");
  const extracted = await extractChatboxJson(file);
  assert.equal(extracted.counts.requirements, 1);
  assert.equal(extracted.counts.architecture, 1);
});

test("Chatbox extraction falls back to the file name when session name is missing", async () => {
  const file = {
    name: "unnamed-session.json",
    text: async () => JSON.stringify({
      id: "unnamed",
      messages: [
        { role: "user", contentParts: [{ type: "text", text: "需要整理任务。" }] }
      ]
    })
  };
  const extracted = await extractChatboxJson(file);
  assert.match(extracted.documents[0].content, /unnamed-session\.json/);
});
