#!/usr/bin/env node
// CLI 入口：解析命令和参数，调用数据层/引擎/渲染层，不在命令分支中保存业务状态。
import { parseArgs } from "node:util";
import { ensureStore, createId, loadState, nowIso, readJson, saveGoals, saveTasks } from "../src/store.mjs";
import { bucketOf, calculateRaiseAt, compactBrief, issues, markForReplan, radarItems, taskTree, topTasks } from "../src/engine.mjs";
import { normalizeTask } from "../src/schema.mjs";
import { renderAll } from "../src/render.mjs";
import { importExtraction, registerSource } from "../src/ingest.mjs";
import { fetchResearch } from "../src/research.mjs";

function parseValue(value) {
  // 命令行参数默认都是字符串，仅对布尔和数字做最小转换。
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function positional(args, index = 0, name = "argument") {
  if (!args[index]) throw new Error(`Missing ${name}`);
  return args[index];
}

function formatTask(task) {
  // 终端输出保持单行，便于复制和日志比对。
  return `${task.id} [${task.parentId}/${bucketOf(task)}] ${task.title} | ${task.status} | 抬升 ${calculateRaiseAt(task) ?? "未设"} | 截止 ${task.dueAt ?? "未设"} | ${task.acceptance ?? "未设验收"}`;
}

function print(value) {
  process.stdout.write(`${typeof value === "string" ? value : JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  // strict=false 允许不同子命令使用各自参数，最终由命令分支决定是否必需。
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    strict: false,
    options: {
      id: { type: "string" },
      title: { type: "string" },
      description: { type: "string" },
      weight: { type: "string" },
      parent: { type: "string" },
      status: { type: "string" },
      priority: { type: "string" },
      impact: { type: "string" },
      due: { type: "string" },
      review: { type: "string" },
      estimate: { type: "string" },
      preparation: { type: "string" },
      bucket: { type: "string" },
      waiting: { type: "string" },
      unblock: { type: "string" },
      acceptance: { type: "string" },
      type: { type: "string" },
      cadence: { type: "string" },
      minimum: { type: "string" },
      target: { type: "string" },
      unit: { type: "string" },
      mode: { type: "string" },
      url: { type: "string" },
      task: { type: "string" },
      question: { type: "string" },
      note: { type: "string" },
      reason: { type: "string" },
      nextReview: { type: "string" }
    }
  });

  const command = positionals[0] ?? "help";
  ensureStore();
  const state = () => loadState();

  if (command === "help") {
    // 帮助文本就是 CLI 的能力边界，新增命令时同步维护。
    print([
      "planner commands:",
      "  render",
      "  today",
      "  radar",
      "  brief --mode chat",
      "  issues",
      "  tree",
      "  replan <task-or-goal-id> --reason text",
      "  add-goal --id Q6 --title <title>",
      "  add-task --title <title> [--parent Q1] [--priority 1] [--due ISO] [--review ISO] [--estimate 60] [--impact 5] [--acceptance text] [--type action]",
      "  update <task-id> --status todo|in_progress|blocked|done|active [--due ISO] [--review ISO] [--preparation 14] [--priority 1]",
      "  done <task-id>",
      "  ingest <path> [--type chat|image|text|file] [--title title]",
      "  import-extraction <json>",
      "  research --task <task-id> --url <url> [--question text]"
    ].join("\n"));
    return;
  }

  if (command === "render") {
    print(renderAll());
    return;
  }

  if (command === "today") {
    print(topTasks(state()).map(formatTask).join("\n"));
    return;
  }

  if (command === "radar") {
    print(radarItems(state()).map((item) => `${item.id} ${item.title} | 抬升 ${item.raiseAt ?? "未设"} | 复核 ${item.reviewAt ?? "未设"} | 截止 ${item.dueAt ?? "未设"}`).join("\n"));
    return;
  }

  if (command === "brief") {
    // 两种模式当前输出相同内容，保留参数以便后续扩展精简/完整模式。
    const brief = compactBrief(state());
    if (values.mode === "chat") print(brief);
    else print(brief);
    return;
  }

  if (command === "issues") {
    print(issues(state()));
    return;
  }

  if (command === "tree") {
    // 主线 -> 一级任务 -> 子任务；更深层级由 engine.taskTree 负责组装。
    const tree = taskTree(state());
    print(tree.map((goal) => {
      const children = goal.tasks.map((task) => {
        const nested = task.children.map((child) => `    - ${child.id} ${child.title} [${child.status}]`).join("\n");
        return `  - ${task.id} ${task.title} [${task.status}]${nested ? `\n${nested}` : ""}`;
      }).join("\n");
      return `${goal.id} ${goal.title}\n${children || "  - 无直接任务"}`;
    }).join("\n\n"));
    return;
  }

  if (command === "replan") {
    // 先把子树标记为 needsReplan，再把规范化后的更新写回原始任务数组。
    const id = positional(positionals, 1, "task-or-goal-id");
    const current = state();
    const updated = markForReplan(current, id, values.reason ?? "上级任务变化");
    if (!updated.length) throw new Error(`No child tasks found for: ${id}`);
    const updatedIds = new Set(updated);
    const rawTasks = readJson("tasks");
    const normalizedById = new Map(current.tasks.map((task) => [task.id, task]));
    saveTasks(rawTasks.map((task) => updatedIds.has(task.id) ? normalizedById.get(task.id) : task));
    print({ rootId: id, markedTaskIds: updated });
    return;
  }

  if (command === "add-goal") {
    // 主线 ID 必须唯一，权重由 schema 约束为可排序的战略值。
    const id = values.id ?? positionals[1];
    if (!id || !values.title) throw new Error("add-goal requires --id and --title");
    const goals = readJson("goals");
    if (goals.some((goal) => goal.id === id)) throw new Error(`Goal exists: ${id}`);
    goals.push({
      id,
      title: values.title,
      description: values.description ?? "",
      weight: values.weight ? parseValue(values.weight) : 3,
      status: "active"
    });
    saveGoals(goals);
    print({ id, status: "created" });
    return;
  }

  if (command === "add-task") {
    // normalizeTask 会补齐可选字段，避免 CLI 创建出结构不完整的任务。
    if (!values.title) throw new Error("add-task requires --title");
    const goals = readJson("goals");
    const parentId = values.parent
      ?? goals.find((goal) => goal.status === "active")?.id
      ?? goals[0]?.id;
    if (!parentId || !goals.some((goal) => goal.id === parentId)) {
      throw new Error(`Unknown or missing goal: ${parentId ?? "none"}`);
    }
    const tasks = readJson("tasks");
    const task = normalizeTask({
      id: values.id ?? createId("T"),
      parentId,
      title: values.title,
      type: values.type ?? "action",
      status: values.status ?? "todo",
      priority: values.priority ? parseValue(values.priority) : 2,
      impact: values.impact ? parseValue(values.impact) : 3,
      dueAt: values.due ?? null,
      reviewAt: values.review ?? null,
      estimateMin: values.estimate ? parseValue(values.estimate) : 0,
      preparationDays: values.preparation ? parseValue(values.preparation) : null,
      bucket: values.bucket ?? null,
      waitingFor: values.waiting ?? "",
      unblockCondition: values.unblock ?? "",
      acceptance: values.acceptance ?? "",
      cadence: values.cadence ?? null,
      minimum: values.minimum ?? null,
      progress: 0,
      target: values.target ? parseValue(values.target) : null,
      unit: values.unit ?? null,
      tags: [],
      sourceIds: [],
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
    tasks.push(task);
    saveTasks(tasks);
    print(task);
    return;
  }

  if (command === "update") {
    // 只允许白名单字段更新，防止命令行参数意外写入内部字段。
    const id = positional(positionals, 1, "task-id");
    const tasks = readJson("tasks");
    const task = tasks.find((item) => item.id === id);
    if (!task) throw new Error(`Unknown task: ${id}`);
    const fields = ["status", "priority", "impact", "due", "review", "estimate", "preparation", "bucket", "waiting", "unblock", "acceptance", "title", "parent", "cadence", "minimum", "target", "unit"];
    for (const field of fields) {
      if (values[field] === undefined) continue;
      const key = {
        parent: "parentId",
        due: "dueAt",
        review: "reviewAt",
        estimate: "estimateMin",
        preparation: "preparationDays",
        waiting: "waitingFor",
        unblock: "unblockCondition"
      }[field] ?? field;
      task[key] = parseValue(values[field]);
    }
    task.updatedAt = nowIso();
    saveTasks(tasks.map((item) => item.id === id ? normalizeTask(task) : item));
    print(normalizeTask(task));
    return;
  }

  if (command === "done") {
    // 完成动作同时记录 completedAt 和 updatedAt，供巡检判断新鲜度。
    const id = positional(positionals, 1, "task-id");
    const tasks = readJson("tasks");
    const task = tasks.find((item) => item.id === id);
    if (!task) throw new Error(`Unknown task: ${id}`);
    task.status = "done";
    task.completedAt = nowIso();
    task.updatedAt = task.completedAt;
    saveTasks(tasks);
    print({ id, status: "done" });
    return;
  }

  if (command === "ingest") {
    const source = registerSource(positional(positionals, 1, "path"), {
      type: values.type,
      title: values.title,
      note: values.note
    });
    print(source);
    return;
  }

  if (command === "import-extraction") {
    print(importExtraction(positional(positionals, 1, "json-path")));
    return;
  }

  if (command === "research") {
    print(await fetchResearch({
      task: values.task,
      url: values.url,
      question: values.question,
      title: values.title,
      nextReviewAt: values.nextReview
    }));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
