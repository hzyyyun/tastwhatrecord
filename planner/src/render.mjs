// 渲染层：把规范化状态转换为四个可读的 Markdown 快照。
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
  // 统一使用上海时区输出，避免不同机器本地时区导致日期漂移。
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
  // 表格保留最常用的排序依据和验收标准，方便直接复制到对话。
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
  // 每次渲染都重新读取状态，确保生成文件不带进程内缓存。
  const state = loadState();
  const top = topTasks(state, now);
  const radar = radarItems(state, now);
  const open = recentOpenTasks(state, now);
  const load = weeklyLoad(state, now);
  const problems = issues(state, now);
  const habits = state.tasks.filter((task) => task.type === "habit" && task.status === "active");

  const current = [
    // CURRENT_STATE 是完整运行快照，供人工快速核对系统判断。
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
    // TODAY 只保留当天行动和最低可行线，降低执行时的信息负担。
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
    // RADAR 重点展示抬升、复核、截止三个时间锚点。
    "# Radar",
    "",
    `生成时间：${formatDate(now)}`,
    "",
    ...radar.map((item) => `- ${item.title} | 抬升 ${formatDate(item.raiseAt)} | 复核 ${formatDate(item.reviewAt)} | 截止 ${formatDate(item.dueAt)} | ${item.link}`)
  ].join("\n");

  const brief = compactBrief(state, now);

  // 生成文件全部由本函数重建，不反向读取或修改，避免循环依赖。
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
