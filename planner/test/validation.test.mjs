import test from "node:test";
import assert from "node:assert/strict";
import {
  assertValidSchedule,
  inspectStateHealth,
  validateState
} from "../web/lib/validation.mjs";

const validState = {
  config: { timezone: "Asia/Shanghai" },
  goals: [{ id: "Q1", title: "study" }],
  tasks: [{
    id: "T1",
    parentId: "Q1",
    title: "task",
    type: "action",
    status: "todo",
    dueAt: "2026-10-05T23:59:59+08:00"
  }],
  sources: [],
  decisions: [],
  schedule: []
};

test("Zod accepts a valid complete state", () => {
  const result = validateState(validState);
  assert.equal(result.success, true);
  assert.equal(result.data.tasks[0].title, "task");
});

test("mainline IDs are customizable but still validated", () => {
  const custom = structuredClone(validState);
  custom.goals = [{ id: "G_research", title: "科研与作品集", weight: 7 }];
  custom.tasks[0].parentId = "G_research";
  assert.equal(validateState(custom).success, true);
  custom.goals[0].weight = 0;
  assert.equal(validateState(custom).success, false);
});

test("Zod rejects an invalid date before write", () => {
  const invalid = structuredClone(validState);
  invalid.tasks[0].dueAt = "tomorrow";
  const result = validateState(invalid);
  assert.equal(result.success, false);
  assert.equal(result.issues[0].dataset, "tasks");
  assert.match(result.issues[0].message, /日期格式无效/);
});

test("Zod rejects a schedule course with an invalid period range", () => {
  assert.throws(
    () => assertValidSchedule([{
      id: "C1",
      dayOfWeek: 1,
      periodStart: 5,
      periodEnd: 2,
      title: "course"
    }]),
    /课表写入被拒绝/
  );
});

test("data health report finds only the broken dataset", () => {
  const broken = structuredClone(validState);
  broken.schedule = [{
    id: "C1",
    dayOfWeek: 9,
    periodStart: 1,
    periodEnd: 2,
    title: "course"
  }];
  const reports = inspectStateHealth(broken, broken.schedule);
  assert.equal(reports.find((report) => report.dataset === "tasks").ok, true);
  assert.equal(reports.find((report) => report.dataset === "schedule").ok, false);
});
