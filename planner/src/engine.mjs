import { DEFAULT_PREPARATION_DAYS } from "./schema.mjs";

const PRIORITY_WEIGHT = {
  0: 45,
  1: 35,
  2: 22,
  3: 10
};

const ACTIVE_STATUSES = new Set(["todo", "in_progress", "active", "blocked"]);

export function daysUntil(value, now = new Date()) {
  if (!value) return null;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return null;
  return (target.getTime() - now.getTime()) / 86_400_000;
}

export function urgencyScore(task, now = new Date()) {
  const dueDays = daysUntil(task.dueAt, now);
  const reviewDays = daysUntil(task.reviewAt, now);

  let score = 0;
  if (dueDays !== null) {
    if (dueDays < 0) score = 90;
    else if (dueDays <= 1) score = 70;
    else if (dueDays <= 3) score = 50;
    else if (dueDays <= 7) score = 32;
    else if (dueDays <= 30) score = 16;
    else if (dueDays <= 90) score = 6;
  }
  if (reviewDays !== null && reviewDays <= 0) score = Math.max(score, 68);
  return score;
}

export function priorityScore(task, goals, now = new Date()) {
  const goal = goals.find((item) => item.id === task.parentId);
  const goalWeight = goal?.weight ?? 1;
  const priority = PRIORITY_WEIGHT[task.priority] ?? 10;
  const impact = (task.impact ?? 3) * 5;
  const blocker = task.status === "blocked" ? -30 : 0;
  const habit = task.type === "habit" ? -8 : 0;
  return priority + goalWeight * 5 + impact + urgencyScore(task, now) + blocker + habit;
}

export function activeTasks(tasks) {
  return tasks.filter((task) => ACTIVE_STATUSES.has(task.status));
}

export function preparationDays(task) {
  if (Number.isFinite(task.preparationDays)) return Math.max(0, task.preparationDays);
  return DEFAULT_PREPARATION_DAYS[task.type] ?? DEFAULT_PREPARATION_DAYS.action;
}

export function calculateRaiseAt(task) {
  if (task.raiseAt) return task.raiseAt;
  if (!task.dueAt) return null;
  const due = new Date(task.dueAt);
  if (Number.isNaN(due.getTime())) return null;
  const days = preparationDays(task);
  if (!days) return task.dueAt;
  due.setUTCDate(due.getUTCDate() - days);
  return due.toISOString();
}

export function bucketOf(task, now = new Date()) {
  if (task.bucket) return task.bucket;
  if (task.status === "done" || task.status === "cancelled") return "done";
  if (task.status === "blocked") return "C";
  if (task.waitingFor) return "B";
  const raiseAt = calculateRaiseAt(task);
  const current = now instanceof Date ? now.getTime() : now;
  if (raiseAt && new Date(raiseAt).getTime() > current) return "D";
  return "A";
}

export function taskTree(state) {
  const byParent = new Map();
  for (const task of state.tasks) {
    const key = task.parentTaskId ?? task.parentId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(task);
  }
  return state.goals.map((goal) => ({
    ...goal,
    tasks: (byParent.get(goal.id) ?? []).map((task) => ({
      ...task,
      children: byParent.get(task.id) ?? []
    }))
  }));
}

export function topTasks(state, now = new Date(), limit = state.config.topTaskCount ?? 3) {
  return activeTasks(state.tasks)
    .filter((task) => task.type !== "habit")
    .map((task) => ({ ...task, score: priorityScore(task, state.goals, now) }))
    .sort((a, b) => b.score - a.score || String(a.dueAt ?? "").localeCompare(String(b.dueAt ?? "")))
    .slice(0, limit);
}

export function radarItems(state, now = new Date()) {
  const days = state.config.radarDays ?? 90;
  const tasks = activeTasks(state.tasks)
    .filter((task) => {
      const due = daysUntil(task.dueAt, now);
      const review = daysUntil(task.reviewAt, now);
      const raise = daysUntil(calculateRaiseAt(task), now);
      return (due !== null && due <= days)
        || (review !== null && review <= days)
        || (raise !== null && raise <= days);
    })
    .map((task) => ({
      id: task.id,
      title: task.title,
      type: task.type,
      parentId: task.parentId,
      dueAt: task.dueAt,
      reviewAt: task.reviewAt,
      raiseAt: calculateRaiseAt(task),
      preparationDays: preparationDays(task),
      priority: task.priority,
      status: task.status,
      link: `task:${task.id}`
    }));

  const decisions = state.decisions
    .filter((decision) => decision.status === "open")
    .filter((decision) => {
      const due = daysUntil(decision.decisionBy, now);
      const review = daysUntil(decision.earlyReviewAt, now);
      return (due !== null && due <= days) || (review !== null && review <= days);
    })
    .map((decision) => ({
      id: decision.id,
      title: decision.title,
      type: "decision",
      parentId: decision.parentId,
      dueAt: decision.decisionBy,
      reviewAt: decision.earlyReviewAt,
      status: decision.status,
      preparationDays: DEFAULT_PREPARATION_DAYS.decision,
      link: `decision:${decision.id}`
    }));

  return [...tasks, ...decisions].sort((a, b) => {
    const aTime = new Date(a.raiseAt ?? a.reviewAt ?? a.dueAt ?? "9999-12-31").getTime();
    const bTime = new Date(b.raiseAt ?? b.reviewAt ?? b.dueAt ?? "9999-12-31").getTime();
    return aTime - bTime;
  });
}

export function recentOpenTasks(state, now = new Date()) {
  return activeTasks(state.tasks)
    .filter((task) => {
      const due = daysUntil(task.dueAt, now);
      const review = daysUntil(task.reviewAt, now);
      return (due !== null && due <= 7) || (review !== null && review <= 0);
    })
    .sort((a, b) => priorityScore(b, state.goals, now) - priorityScore(a, state.goals, now));
}

export function weeklyLoad(state, now = new Date()) {
  const estimates = recentOpenTasks(state, now)
    .filter((task) => task.type !== "habit")
    .reduce((sum, task) => sum + (task.estimateMin ?? 0), 0);
  const capacity = (state.config.weeklyCapacityHours ?? 18) * 60;
  return {
    plannedMinutes: estimates,
    plannedHours: Number((estimates / 60).toFixed(1)),
    capacityMinutes: capacity,
    capacityHours: state.config.weeklyCapacityHours ?? 18,
    loadRatio: capacity ? Number((estimates / capacity).toFixed(2)) : 0
  };
}

export function issues(state, now = new Date()) {
  const goalIds = new Set(state.goals.map((goal) => goal.id));
  const taskIds = new Set(state.tasks.map((task) => task.id));
  const taskById = new Map(state.tasks.map((task) => [task.id, task]));
  const active = activeTasks(state.tasks);
  const result = [];

  for (const task of active) {
    if (!task.parentId || !goalIds.has(task.parentId)) {
      result.push({
        level: "error",
        code: "orphan_task",
        id: task.id,
        message: `${task.title} 未连接到有效主线或项目。`
      });
    }
    if (task.parentTaskId && !taskIds.has(task.parentTaskId)) {
      result.push({
        level: "error",
        code: "missing_parent_task",
        id: task.id,
        message: `${task.title} 指向不存在的上级任务 ${task.parentTaskId}。`
      });
    }
    if (task.parentTaskId && dayBoundary(task.dueAt) > dayBoundary(taskById.get(task.parentTaskId)?.dueAt)) {
      result.push({
        level: "warning",
        code: "child_after_parent",
        id: task.id,
        message: `${task.title} 的截止时间晚于上级任务。`
      });
    }
    if (task.status === "blocked" && !task.unblockCondition) {
      result.push({
        level: "warning",
        code: "blocked_without_condition",
        id: task.id,
        message: `${task.title} 已阻塞，但没有记录复活条件。`
      });
    }
    if (task.updatedAt && daysUntil(task.updatedAt, now) < -21 && task.status === "in_progress") {
      result.push({
        level: "warning",
        code: "stale_in_progress",
        id: task.id,
        message: `${task.title} 超过 21 天没有更新。`
      });
    }
    if (task.needsReplan) {
      result.push({
        level: "warning",
        code: "needs_replan",
        id: task.id,
        message: `${task.title} 因上级变化需要重新拆分或重排时间。`
      });
    }
    if (task.parentTaskId && taskById.get(task.parentTaskId)?.status === "done" && task.status !== "done") {
      result.push({
        level: "warning",
        code: "active_child_of_done_parent",
        id: task.id,
        message: `${task.title} 的上级已完成，但本任务仍处于活动状态。`
      });
    }
  }

  const load = weeklyLoad(state, now);
  if (load.loadRatio > 1.15) {
    result.push({
      level: "warning",
      code: "capacity_overload",
      id: "SYSTEM",
      message: `未来 7 天计划 ${load.plannedHours}h，超过周容量 ${load.capacityHours}h。`
    });
  }

  return result;
}

function dayBoundary(value) {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

export function markForReplan(state, rootId, reason = "上级任务变化") {
  const updates = [];
  const childMap = new Map();
  for (const task of state.tasks) {
    if (!childMap.has(task.parentTaskId)) childMap.set(task.parentTaskId, []);
    childMap.get(task.parentTaskId).push(task);
  }

  const queue = state.goals.some((goal) => goal.id === rootId)
    ? [...(childMap.get(rootId) ?? [])]
    : [state.tasks.find((task) => task.id === rootId)].filter(Boolean);

  while (queue.length) {
    const task = queue.shift();
    task.needsReplan = true;
    task.replanReason = reason;
    task.updatedAt = new Date().toISOString();
    updates.push(task.id);
    queue.push(...(childMap.get(task.id) ?? []));
  }
  return updates;
}

export function compactBrief(state, now = new Date()) {
  const today = topTasks(state, now);
  const radar = radarItems(state, now).slice(0, 5);
  const problems = issues(state, now);
  const activeHabits = state.tasks.filter((task) => task.type === "habit" && task.status === "active");
  const replanTasks = activeTasks(state.tasks).filter((task) => task.needsReplan);
  const formattedNow = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(now);
  const lines = [
    "# Planner Brief",
    "",
    `更新时间：${formattedNow}`,
    "",
    "## 现在最重要",
    ...today.map((task, index) => `${index + 1}. [${task.parentId}/${bucketOf(task, now)}] ${task.title} | 截止：${task.dueAt ?? "未设"} | 抬升：${calculateRaiseAt(task) ?? "未设"} | 验收：${task.acceptance ?? "未设"}`),
    "",
    "## 未来 90 天",
    ...radar.map((item) => `- ${item.title} | 抬升：${item.raiseAt ?? "未设"} | 复核：${item.reviewAt ?? "未设"} | 截止：${item.dueAt ?? "未设"}`),
    "",
    "## 习惯",
    ...activeHabits.map((habit) => `- ${habit.title} | ${habit.progress}/${habit.target} ${habit.unit} | ${habit.minimum}`),
    "",
    "## 系统提醒",
    ...(problems.length ? problems.map((item) => `- [${item.level}] ${item.message}`) : ["- 无"]),
    "",
    "## 需要重规划",
    ...(replanTasks.length ? replanTasks.map((task) => `- ${task.id} ${task.title}：${task.replanReason ?? "上级任务变化"}`) : ["- 无"]),
    "",
    "## 下一步",
    "只处理前 1-3 项；完成、阻塞或信息变化后立即回写数据。"
  ];
  return lines.join("\n");
}
