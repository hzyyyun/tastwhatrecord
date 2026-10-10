// Chatbox 简报生成：把结构化状态压缩成不含 Markdown 代码围栏的对话文本。
import {
  bucketOf,
  preparationDays,
  radarItems,
  topTasks
} from "../../src/engine.mjs";

const DEFAULT_TIMEZONE = "Asia/Shanghai";

export function briefLength(text) {
  // 长度按可见字符计，忽略空白，便于约束简报体量。
  return text.replace(/\s/g, "").length;
}

export function formatPlannerDate(value) {
  // 日期统一按上海时区格式化，并显式返回无效输入原文。
  if (!value) return "未设置";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    hour12: false
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}`;
}

function firstItems(items, limit) {
  // 不修改原数组，只截取前 limit 项。
  const result = [];
  for (const item of items) {
    if (result.length >= limit) break;
    result.push(item);
  }
  return result;
}

function taskLine(task, index) {
  // 每条任务都保留截止、前置准备和当前处理桶。
  return [
    `${index + 1}. ${task.title}`,
    `截止：${formatPlannerDate(task.dueAt)}`,
    `前置：${preparationDays(task)} 天`,
    `状态：${bucketOf(task)}`
  ].join("；");
}

function nodeLine(item, index) {
  return [
    `${index + 1}. ${item.title}`,
    `抬升：${formatPlannerDate(item.raiseAt)}`,
    `复核：${formatPlannerDate(item.reviewAt)}`,
    `截止：${formatPlannerDate(item.dueAt)}`,
    `前置：${preparationDays(item)} 天`
  ].join("；");
}

function isTodayOrOverdue(task, timezone) {
  // 将截止时间和今天都转换为时区日期键，再按天比较。
  if (!task.dueAt) return false;
  const due = new Date(task.dueAt);
  if (Number.isNaN(due.getTime())) return false;
  const dateKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(due);
  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
  return dateKey <= todayKey;
}

const REQUEST_OPTIONS = {
  A: "请帮我判断今天最该先做的三件事，并说明理由。",
  B: "请帮我检查任务之间有没有冲突或遗漏。",
  C: "请基于我的现状，帮我重新规划接下来一周。"
};

export function createChatboxBrief(state, requestOption = "A", customRequest = "") {
  // 简报只包含当前状态和请求，发送给 Chatbox 后由模型分析，不直接改本地数据。
  const timezone = state.config?.timezone || DEFAULT_TIMEZONE;
  const top = firstItems(topTasks(state), 3);
  const nodes = firstItems(radarItems(state), 5);
  const today = firstItems(
    state.tasks
      .filter((task) => ["todo", "in_progress", "blocked", "active"].includes(task.status))
      .filter((task) => task.type !== "habit")
      .filter((task) => isTodayOrOverdue(task, timezone)),
    5
  );

  const goals = state.goals
    .map((goal) => `${goal.id} ${goal.title}（权重 ${goal.weight}）`)
    .join("；");
  const activeCount = state.tasks.filter((task) => ["todo", "in_progress", "blocked", "active"].includes(task.status)).length;
  const request = requestOption === "D"
    ? String(customRequest).trim()
    : (REQUEST_OPTIONS[requestOption] ?? REQUEST_OPTIONS.A);
  if (requestOption === "D" && !request) {
    throw new Error("选择 D 时必须填写自定义指令。");
  }
  const body = [
    "【当前状态】",
    `生成时间：${formatPlannerDate(new Date())}`,
    `主线树：${goals || "暂无"}`,
    `活动任务数：${activeCount}`,
    "",
    "当前优先（Top 3）",
    ...(top.length
      ? top.map((task, index) => taskLine(task, index))
      : ["暂无优先任务"]),
    "",
    "近期节点",
    ...(nodes.length
      ? nodes.map((item, index) => nodeLine(item, index))
      : ["未来 90 天暂无节点"]),
    "",
    "雷达事项",
    ...(nodes.length
      ? nodes.map((item, index) => nodeLine(item, index))
      : ["暂无雷达事项"]),
    "",
    "今日待办",
    ...(today.length
      ? today.map((task, index) => taskLine(task, index))
      : ["今日没有截止任务"]),
    "",
    "【指令请求】",
    request
  ].join("\n");
  return [
    "你现在是我的大学生活规划助理。你只负责基于以下简报帮我分析和建议，不要复读原文。",
    "",
    body
  ].join("\n");
}
