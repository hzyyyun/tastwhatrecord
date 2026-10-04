import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CONFIG,
  SCHEMA_VERSION,
  normalizeState,
  normalizeTask
} from "../src/schema.mjs";
import { bucketOf, calculateRaiseAt, preparationDays } from "../src/engine.mjs";

test("legacy task data is preserved and optional defaults are filled", () => {
  const legacy = {
    id: "T-legacy",
    parentId: "Q1",
    title: "legacy task",
    type: "action",
    status: "todo",
    priority: 1,
    impact: 5,
    dueAt: "2026-10-31T23:59:59+08:00",
    customField: "keep-me"
  };
  const task = normalizeTask(legacy);
  assert.equal(task.id, "T-legacy");
  assert.equal(task.customField, "keep-me");
  assert.equal(task.schemaVersion, SCHEMA_VERSION);
  assert.equal(task.parentTaskId, null);
  assert.equal(task.preparationDays, null);
  assert.deepEqual(task.tags, []);
  assert.deepEqual(task.sourceIds, []);
});

test("normalizeState supplies defaults without changing known fields", () => {
  const state = normalizeState({
    config: { timezone: "Asia/Shanghai" },
    goals: [{ id: "Q1", title: "study" }],
    tasks: [{ id: "T1", parentId: "Q1", title: "task" }],
    sources: [],
    decisions: []
  });
  assert.equal(state.config.weeklyCapacityHours, DEFAULT_CONFIG.weeklyCapacityHours);
  assert.equal(state.goals[0].weight, 3);
  assert.equal(state.tasks[0].status, "todo");
  assert.equal(state.tasks[0].schemaVersion, SCHEMA_VERSION);
});

test("raise date uses preparation days", () => {
  const task = normalizeTask({
    id: "T1",
    parentId: "Q1",
    title: "competition",
    type: "research",
    dueAt: "2026-10-31T23:59:59+08:00"
  });
  assert.equal(preparationDays(task), 14);
  assert.equal(new Date(calculateRaiseAt(task)).toISOString(), "2026-10-17T15:59:59.000Z");
});

test("task preparation override is respected", () => {
  const task = normalizeTask({
    id: "T1",
    parentId: "Q1",
    title: "custom",
    type: "action",
    dueAt: "2026-10-31T23:59:59+08:00",
    preparationDays: 5
  });
  assert.equal(new Date(calculateRaiseAt(task)).toISOString(), "2026-10-26T15:59:59.000Z");
});

test("bucket derivation handles A, B, C and future D", () => {
  const now = new Date("2026-10-03T00:00:00+08:00");
  assert.equal(bucketOf({ status: "todo", type: "action" }, now), "A");
  assert.equal(bucketOf({ status: "blocked", type: "action" }, now), "C");
  assert.equal(bucketOf({ status: "todo", type: "action", waitingFor: "teacher" }, now), "B");
  assert.equal(bucketOf({
    status: "todo",
    type: "decision",
    dueAt: "2026-12-31T23:59:59+08:00"
  }, now), "D");
});

