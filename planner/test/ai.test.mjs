import test from "node:test";
import assert from "node:assert/strict";
import {
  decryptCredentials,
  encryptCredentials,
  validateCredentials
} from "../web/lib/ai-vault.mjs";
import {
  extractScheduleFromText,
  generateChangeProposal
} from "../web/lib/ai-client.mjs";
import {
  nextUsageRecord,
  performTavilySearch,
  researchToMarkdown
} from "../web/lib/tavily.mjs";
import {
  applySelectedProposal,
  previewProposal
} from "../web/lib/proposal.mjs";

const sampleCredentials = {
  baseURL: "https://gateway.invalid/v1",
  model: "unit-test-model",
  apiKey: "unit-test-credential",
  tavilyApiKey: "unit-test-search-credential"
};

test("credential vault encrypts and decrypts local values", async () => {
  const record = await encryptCredentials(sampleCredentials, "local-passphrase");
  const serialized = JSON.stringify(record);
  assert.doesNotMatch(serialized, /unit-test-credential/);
  assert.doesNotMatch(serialized, /unit-test-search-credential/);
  const decrypted = await decryptCredentials(record, "local-passphrase");
  assert.deepEqual(decrypted, sampleCredentials);
});

test("credential vault rejects the wrong passphrase", async () => {
  const record = await encryptCredentials(sampleCredentials, "local-passphrase");
  await assert.rejects(() => decryptCredentials(record, "wrong-passphrase"), /口令错误/);
});

test("Tavily key is optional for the local vault", () => {
  const credentials = validateCredentials({
    baseURL: "https://gateway.invalid/v1",
    model: "unit-test-model",
    apiKey: "unit-test-credential",
    tavilyApiKey: ""
  });
  assert.equal(credentials.tavilyApiKey, "");
});

test("AI client requests only an OpenAI-compatible chat completion", async () => {
  let captured = null;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            summary: "one change",
            operations: [{ op: "create_task", payload: { parentId: "Q1", title: "new" }, reason: "test" }]
          })
        }
      }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const proposal = await generateChangeProposal({
    credentials: sampleCredentials,
    prompt: "test",
    state: {
      goals: [{ id: "Q1", title: "study" }],
      tasks: [],
      decisions: []
    },
    fetchImpl
  });
  assert.equal(captured.url, "https://gateway.invalid/v1/chat/completions");
  assert.ok(captured.options.headers.authorization.startsWith("Bearer "));
  assert.equal(proposal.operations.length, 1);
});

test("AI schedule text extraction returns confirmation-only operations", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({
          courses: [{
            dayOfWeek: 1,
            periodStart: 1,
            periodEnd: 2,
            title: "综合英语",
            location: "S-南108"
          }]
        })
      }
    }]
  }), { status: 200, headers: { "content-type": "application/json" } });
  const proposal = await extractScheduleFromText({
    credentials: sampleCredentials,
    text: "周一 1-2 综合英语 S-南108",
    fetchImpl
  });
  assert.equal(proposal.operations[0].op, "create_schedule_item");
  assert.equal(proposal.operations[0].payload.title, "综合英语");
});

test("Tavily records URL, access time and review time", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    answer: "answer",
    results: [{ title: "source", url: "https://example.com", content: "evidence", score: 0.9 }]
  }), { status: 200, headers: { "content-type": "application/json" } });
  const result = await performTavilySearch({
    apiKey: "unit-test-search-credential",
    query: "question",
    nextReviewAt: "2026-10-17T00:00:00.000Z",
    fetchImpl
  });
  assert.equal(result.records[0].url, "https://example.com");
  assert.match(result.records[0].accessedAt, /^20/);
  assert.equal(result.records[0].nextReviewAt, "2026-10-17T00:00:00.000Z");
  assert.match(researchToMarkdown(result), /下次复核/);
});

test("Tavily usage tracks daily and monthly totals without a hard limit", () => {
  const now = new Date("2026-10-03T12:00:00+08:00");
  const next = nextUsageRecord({
    dateKey: "2026-10-03",
    dailyCount: 12,
    monthKey: "2026-10",
    monthlyCount: 999
  }, now);
  assert.equal(next.dailyCount, 13);
  assert.equal(next.monthlyCount, 1000);
});

test("proposal preview and apply do not mutate until selected", () => {
  const state = {
    config: {},
    goals: [{ id: "Q1", title: "study" }],
    tasks: [{ id: "T1", parentId: "Q1", title: "old", status: "todo" }],
    sources: [],
    decisions: []
  };
  const proposal = {
    summary: "",
    operations: [
      { op: "update_task", id: "T1", changes: { title: "new" }, reason: "rename" },
      { op: "create_task", payload: { parentId: "Q1", title: "created" }, reason: "add" }
    ]
  };
  const previews = previewProposal(state, proposal);
  assert.equal(previews.length, 2);
  assert.equal(state.tasks[0].title, "old");
  const applied = applySelectedProposal(state, proposal, [0]);
  assert.equal(applied.state.tasks[0].title, "new");
  assert.equal(applied.state.tasks.length, 1);
  assert.equal(state.tasks[0].title, "old");
});

test("schedule proposal writes only to the isolated schedule dataset", () => {
  const state = {
    config: {},
    goals: [{ id: "Q1", title: "study" }],
    tasks: [],
    sources: [],
    decisions: [],
    schedule: []
  };
  const proposal = {
    summary: "",
    operations: [{
      op: "create_schedule_item",
      payload: {
        dayOfWeek: 2,
        periodStart: 3,
        periodEnd: 5,
        title: "高等数学"
      },
      reason: "课表识别"
    }]
  };
  const result = applySelectedProposal(state, proposal, [0]);
  assert.equal(result.state.tasks.length, 0);
  assert.equal(result.state.schedule[0].title, "高等数学");
  assert.deepEqual(result.changedDatasets, ["schedule"]);
});
