import fs from "node:fs";
import path from "node:path";
import {
  RESEARCH_DIR,
  ROOT,
  loadState,
  writeGenerated
} from "./store.mjs";
import {
  bucketOf,
  calculateRaiseAt,
  compactBrief,
  issues,
  radarItems,
  recentOpenTasks,
  topTasks,
  weeklyLoad
} from "./engine.mjs";

function formatDate(value) {
  if (!value) return "未设";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function taskTable(tasks) {
  if (!tasks.length) return "无";
  const rows = [
    "| ID | 主线 | 状态 | 任务 | 抬升 | 截止 | 验收 |",
    "|---|---|---|---|---|---|---|"
  ];
  for (const task of tasks) {
    rows.push(`| ${task.id} | ${task.parentId} | ${bucketOf(task)} | ${task.title} | ${formatDate(calculateRaiseAt(task))} | ${formatDate(task.dueAt)} | ${task.acceptance ?? "未设"} |`);
  }
  return rows.join("\n");
}

export function renderAll(now = new Date()) {
  const state = loadState();
  const top = topTasks(state, now);
  const radar = radarItems(state, now);
  const open = recentOpenTasks(state, now);
  const load = weeklyLoad(state, now);
  const problems = issues(state, now);
  const habits = state.tasks.filter((task) => task.type === "habit" && task.status === "active");

  const current = [
    "# Planner OS Current State",
    "",
    `生成时间：${formatDate(now)}`,
    "",
    "## 今日前三项",
    taskTable(top),
    "",
    "## 当前负荷",
    `- 未来 7 天已知任务：${load.plannedHours} 小时`,
    `- 每周容量：${load.capacityHours} 小时`,
    `- 负荷率：${Math.round(load.loadRatio * 100)}%`,
    "",
    "## 未来 90 天",
    ...radar.map((item) => `- ${item.title} | 抬升 ${formatDate(item.raiseAt)} | 复核 ${formatDate(item.reviewAt)} | 截止 ${formatDate(item.dueAt)}`),
    "",
    "## 习惯进度",
    ...habits.map((habit) => `- ${habit.title}：${habit.progress}/${habit.target} ${habit.unit}`),
    "",
    "## 系统检查",
    ...(problems.length ? problems.map((item) => `- [${item.level}] ${item.message}`) : ["- 无"]),
    "",
    "## 当前数据源",
    ...state.sources.map((source) => `- ${source.id} | ${source.title} | ${source.status}`)
  ].join("\n");

  const today = [
    "# Today",
    "",
    `日期：${formatDate(now)}`,
    "",
    taskTable(top),
    "",
    "## 最低可行日",
    "1. 课程不缺席。",
    "2. 高数或 C 至少 25 分钟。",
    "3. 英语至少 10 分钟。",
    "4. 24:00 前睡觉。"
  ].join("\n");

  const radarDoc = [
    "# Radar",
    "",
    `生成时间：${formatDate(now)}`,
    "",
    ...radar.map((item) => `- ${item.title} | 抬升 ${formatDate(item.raiseAt)} | 复核 ${formatDate(item.reviewAt)} | 截止 ${formatDate(item.dueAt)} | ${item.link}`)
  ].join("\n");

  const brief = compactBrief(state, now);

  writeGenerated("CURRENT_STATE.md", `${current}\n`);
  writeGenerated("TODAY.md", `${today}\n`);
  writeGenerated("RADAR.md", `${radarDoc}\n`);
  writeGenerated("CHATBOX_BRIEF.md", `${brief}\n`);
  fs.mkdirSync(RESEARCH_DIR, { recursive: true });

  return {
    root: ROOT,
    top: top.map((task) => task.id),
    radar: radar.map((item) => item.id),
    open: open.map((task) => task.id),
    issues: problems,
    load
  };
}
