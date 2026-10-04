export const SCHEMA_VERSION = 1;

export const DEFAULT_CONFIG = {
  timezone: "Asia/Shanghai",
  weeklyCapacityHours: 18,
  dailyDeepWorkHours: 3,
  topTaskCount: 3,
  radarDays: 90,
  reviewCadence: "weekly-sunday",
  defaultReviewDays: 14,
  tavilyMonthlyQuota: 1000,
  tavilyLowQuotaThreshold: 50
};

export const DEFAULT_PREPARATION_DAYS = {
  action: 14,
  research: 14,
  decision: 30,
  milestone: 28,
  habit: 0
};

const TASK_TYPES = new Set(["action", "research", "decision", "milestone", "habit"]);
const TASK_STATUSES = new Set(["todo", "in_progress", "blocked", "done", "active", "cancelled"]);
const BUCKETS = new Set(["A", "B", "C", "D"]);
const WEEKDAYS = new Set([1, 2, 3, 4, 5, 6, 7]);

function numberOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function optionalNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function optionalString(value) {
  return typeof value === "string" ? value : "";
}

export function normalizeConfig(config = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    schemaVersion: numberOr(config.schemaVersion, SCHEMA_VERSION)
  };
}

export function normalizeGoal(goal = {}) {
  return {
    ...goal,
    id: goal.id ?? "",
    title: goal.title ?? "",
    description: optionalString(goal.description),
    weight: numberOr(goal.weight, 3),
    status: goal.status ?? "active",
    schemaVersion: numberOr(goal.schemaVersion, SCHEMA_VERSION)
  };
}

export function normalizeTask(task = {}) {
  const type = TASK_TYPES.has(task.type) ? task.type : "action";
  const status = TASK_STATUSES.has(task.status) ? task.status : "todo";
  const bucket = BUCKETS.has(task.bucket) ? task.bucket : null;
  return {
    ...task,
    id: task.id ?? "",
    parentId: task.parentId ?? "Q0",
    parentTaskId: task.parentTaskId ?? null,
    title: task.title ?? "",
    type,
    status,
    bucket,
    priority: numberOr(task.priority, 2),
    impact: numberOr(task.impact, 3),
    dueAt: task.dueAt ?? null,
    reviewAt: task.reviewAt ?? null,
    estimateMin: numberOr(task.estimateMin, 0),
    acceptance: optionalString(task.acceptance),
    cadence: task.cadence ?? null,
    minimum: task.minimum ?? null,
    progress: numberOr(task.progress, 0),
    target: optionalNumber(task.target),
    unit: task.unit ?? null,
    preparationDays: optionalNumber(task.preparationDays),
    raiseAt: task.raiseAt ?? null,
    needsReplan: task.needsReplan ?? false,
    replanReason: optionalString(task.replanReason),
    unblockCondition: optionalString(task.unblockCondition),
    waitingFor: optionalString(task.waitingFor),
    tags: Array.isArray(task.tags) ? task.tags : [],
    sourceIds: Array.isArray(task.sourceIds) ? task.sourceIds : [],
    schemaVersion: numberOr(task.schemaVersion, SCHEMA_VERSION),
    createdAt: task.createdAt ?? null,
    updatedAt: task.updatedAt ?? null,
    completedAt: task.completedAt ?? null
  };
}

export function normalizeSource(source = {}) {
  return {
    ...source,
    id: source.id ?? "",
    title: source.title ?? "",
    type: source.type ?? "file",
    path: source.path ?? "",
    copiedPath: source.copiedPath ?? null,
    hash: source.hash ?? null,
    size: numberOr(source.size, 0),
    capturedAt: source.capturedAt ?? null,
    status: source.status ?? "pending_extraction",
    note: optionalString(source.note),
    summary: optionalString(source.summary),
    taskIds: Array.isArray(source.taskIds) ? source.taskIds : [],
    schemaVersion: numberOr(source.schemaVersion, SCHEMA_VERSION)
  };
}

export function normalizeDecision(decision = {}) {
  return {
    ...decision,
    id: decision.id ?? "",
    parentId: decision.parentId ?? "Q0",
    title: decision.title ?? "",
    status: decision.status ?? "open",
    decisionBy: decision.decisionBy ?? null,
    earlyReviewAt: decision.earlyReviewAt ?? null,
    options: Array.isArray(decision.options) ? decision.options : [],
    evidenceNeeded: Array.isArray(decision.evidenceNeeded) ? decision.evidenceNeeded : [],
    sourceIds: Array.isArray(decision.sourceIds) ? decision.sourceIds : [],
    schemaVersion: numberOr(decision.schemaVersion, SCHEMA_VERSION),
    updatedAt: decision.updatedAt ?? null
  };
}

export function normalizeCourse(course = {}) {
  const periodStart = Number.isInteger(course.periodStart) ? course.periodStart : 1;
  const periodEnd = Number.isInteger(course.periodEnd) ? course.periodEnd : periodStart;
  return {
    ...course,
    id: course.id ?? "",
    dayOfWeek: WEEKDAYS.has(course.dayOfWeek) ? course.dayOfWeek : 1,
    periodStart,
    periodEnd: Math.max(periodStart, periodEnd),
    title: course.title ?? "",
    location: optionalString(course.location),
    startTime: course.startTime ?? null,
    endTime: course.endTime ?? null,
    teacher: optionalString(course.teacher),
    weekRange: optionalString(course.weekRange),
    source: course.source ?? "manual",
    schemaVersion: numberOr(course.schemaVersion, SCHEMA_VERSION),
    createdAt: course.createdAt ?? null,
    updatedAt: course.updatedAt ?? null
  };
}

export function normalizeSchedule(schedule = []) {
  return (Array.isArray(schedule) ? schedule : []).map(normalizeCourse);
}

export function normalizeState(state = {}) {
  return {
    config: normalizeConfig(Array.isArray(state.config) ? {} : state.config),
    goals: (Array.isArray(state.goals) ? state.goals : []).map(normalizeGoal),
    tasks: (Array.isArray(state.tasks) ? state.tasks : []).map(normalizeTask),
    sources: (Array.isArray(state.sources) ? state.sources : []).map(normalizeSource),
    decisions: (Array.isArray(state.decisions) ? state.decisions : []).map(normalizeDecision),
    schedule: normalizeSchedule(state.schedule ?? [])
  };
}
