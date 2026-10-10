import test from "node:test";
import assert from "node:assert/strict";
import { issues, markForReplan, priorityScore, taskTree, topTasks, weeklyLoad } from "../src/engine.mjs";

const now = new Date("2026-10-03T12:00:00+08:00");

function state(tasks) {
  return {
    config: {
      topTaskCount: 3,
      radarDays: 90,
      weeklyCapacityHours: 18
    },
    goals: [
      { id: "Q0", title: "生活", weight: 5 },
      { id: "Q1", title: "学业", weight: 5 }
    ],
    tasks,
    sources: [],
    decisions: []
  };
}

test("overdue P0 task outranks distant P2 task", () => {
  const tasks = [
    {
      id: "A",
      parentId: "Q1",
      title: "overdue",
      type: "action",
      status: "todo",
      priority: 0,
      impact: 5,
      dueAt: "2026-10-02T23:59:59+08:00"
    },
    {
      id: "B",
      parentId: "Q1",
      title: "later",
      type: "action",
      status: "todo",
      priority: 2,
      impact: 2,
      dueAt: "2026-11-30T23:59:59+08:00"
    }
  ];
  const s = state(tasks);
  assert.ok(priorityScore(tasks[0], s.goals, now) > priorityScore(tasks[1], s.goals, now));
  assert.equal(topTasks(s, now, 1)[0].id, "A");
});

test("orphan active task is reported", () => {
  const s = state([
    {
      id: "A",
      parentId: "Q9",
      title: "orphan",
      type: "action",
      status: "todo",
      priority: 1,
      impact: 3
    }
  ]);
  assert.equal(issues(s, now)[0].code, "orphan_task");
});

test("blocked task requires an unblock condition", () => {
  const s = state([
    {
      id: "A",
      parentId: "Q1",
      title: "blocked",
      type: "action",
      status: "blocked",
      priority: 1,
      impact: 3
    }
  ]);
  assert.ok(issues(s, now).some((item) => item.code === "blocked_without_condition"));
});

test("weekly load is calculated from near-term estimates", () => {
  const s = state([
    {
      id: "A",
      parentId: "Q1",
      title: "near",
      type: "action",
      status: "todo",
      priority: 1,
      impact: 3,
      dueAt: "2026-10-05T23:59:59+08:00",
      estimateMin: 180
    }
  ]);
  assert.equal(weeklyLoad(s, now).plannedHours, 3);
  assert.equal(weeklyLoad(s, now).loadRatio, 0.17);
});

test("parent replan marks the whole subtree", () => {
  const s = state([
    {
      id: "P",
      parentId: "Q1",
      title: "parent",
      type: "milestone",
      status: "todo",
      priority: 1,
      impact: 5
    },
    {
      id: "C",
      parentId: "Q1",
      parentTaskId: "P",
      title: "child",
      type: "action",
      status: "todo",
      priority: 1,
      impact: 3
    }
  ]);
  assert.deepEqual(markForReplan(s, "P", "deadline moved"), ["P", "C"]);
  assert.equal(s.tasks[1].needsReplan, true);
  const q1 = taskTree(s).find((goal) => goal.id === "Q1");
  assert.equal(q1.tasks[0].children[0].id, "C");
});

test("task tree keeps descending beyond one child level", () => {
  const s = state([
    {
      id: "P",
      parentId: "Q1",
      title: "parent",
      type: "milestone",
      status: "todo"
    },
    {
      id: "C",
      parentId: "Q1",
      parentTaskId: "P",
      title: "child",
      type: "action",
      status: "todo"
    },
    {
      id: "G",
      parentId: "Q1",
      parentTaskId: "C",
      title: "grandchild",
      type: "action",
      status: "todo"
    }
  ]);
  const q1 = taskTree(s).find((goal) => goal.id === "Q1");
  assert.equal(q1.tasks[0].children[0].children[0].id, "G");
});

test("parent replan stops when legacy data contains a cycle", () => {
  const s = state([
    {
      id: "A",
      parentId: "Q1",
      parentTaskId: "B",
      title: "A",
      type: "action",
      status: "todo"
    },
    {
      id: "B",
      parentId: "Q1",
      parentTaskId: "A",
      title: "B",
      type: "action",
      status: "todo"
    }
  ]);
  assert.deepEqual(markForReplan(s, "A"), ["A", "B"]);
});

test("child deadline after parent deadline is reported", () => {
  const s = state([
    {
      id: "P",
      parentId: "Q1",
      title: "parent",
      type: "milestone",
      status: "todo",
      priority: 1,
      impact: 5,
      dueAt: "2026-10-05T23:59:59+08:00"
    },
    {
      id: "C",
      parentId: "Q1",
      parentTaskId: "P",
      title: "child",
      type: "action",
      status: "todo",
      priority: 1,
      impact: 3,
      dueAt: "2026-10-06T23:59:59+08:00"
    }
  ]);
  assert.ok(issues(s, now).some((item) => item.code === "child_after_parent"));
});
