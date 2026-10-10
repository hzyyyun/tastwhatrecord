// 数据校验层：Zod 负责结构约束，健康检查负责把结果汇总到界面。
import { z } from "../../node_modules/zod/index.js";

// nullable 字符串既允许 null，也允许可解析的日期字符串。
const dateString = z.string()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "日期格式无效")
  .nullable()
  .default(null);

const stringArray = z.array(z.string()).default([]);
const schemaVersion = z.number().int().positive().default(1);
const goalId = z.string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "主线 ID 只能包含字母、数字、下划线和连字符");

export const configSchema = z.object({
  // passthrough 保留未来新增字段，保证 v1 数据向后兼容。
  timezone: z.string().min(1).default("Asia/Shanghai"),
  weeklyCapacityHours: z.number().positive().default(18),
  dailyDeepWorkHours: z.number().positive().default(3),
  topTaskCount: z.number().int().positive().default(3),
  radarDays: z.number().int().positive().default(90),
  reviewCadence: z.string().default("weekly-sunday"),
  defaultReviewDays: z.number().int().nonnegative().default(14),
  tavilyMonthlyQuota: z.number().int().positive().default(1000),
  tavilyLowQuotaThreshold: z.number().int().nonnegative().default(50),
  schemaVersion
}).passthrough();

export const goalSchema = z.object({
  id: goalId,
  title: z.string().min(1),
  description: z.string().default(""),
  weight: z.number().min(1).max(10).default(3),
  status: z.string().min(1).default("active"),
  schemaVersion
}).passthrough();

export const taskSchema = z.object({
  // 任务必须有真实 ID 和主线归属，状态与类型使用固定枚举。
  id: z.string().min(1),
  parentId: goalId,
  parentTaskId: z.string().nullable().default(null),
  title: z.string().min(1, "任务标题不能为空"),
  type: z.enum(["action", "research", "decision", "milestone", "habit"]).default("action"),
  status: z.enum(["todo", "in_progress", "blocked", "done", "active", "cancelled"]).default("todo"),
  bucket: z.enum(["A", "B", "C", "D"]).nullable().default(null),
  priority: z.number().int().min(0).max(3).default(2),
  impact: z.number().int().min(0).max(5).default(3),
  dueAt: dateString,
  reviewAt: dateString,
  estimateMin: z.number().int().nonnegative().default(0),
  acceptance: z.string().default(""),
  cadence: z.string().nullable().default(null),
  minimum: z.string().nullable().default(null),
  progress: z.number().nonnegative().default(0),
  target: z.number().nullable().default(null),
  unit: z.string().nullable().default(null),
  preparationDays: z.number().int().nonnegative().nullable().default(null),
  raiseAt: dateString,
  needsReplan: z.boolean().default(false),
  replanReason: z.string().default(""),
  unblockCondition: z.string().default(""),
  waitingFor: z.string().default(""),
  tags: stringArray,
  sourceIds: stringArray,
  schemaVersion,
  createdAt: dateString,
  updatedAt: dateString,
  completedAt: dateString
}).passthrough();

export const sourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: z.string().min(1).default("file"),
  path: z.string().default(""),
  copiedPath: z.string().nullable().default(null),
  hash: z.string().nullable().default(null),
  size: z.number().int().nonnegative().default(0),
  capturedAt: dateString,
  status: z.string().min(1).default("pending_extraction"),
  note: z.string().default(""),
  summary: z.string().default(""),
  taskIds: stringArray,
  goalId: z.string().nullable().default(null),
  decisionId: z.string().nullable().default(null),
  nextReviewAt: dateString,
  records: z.array(z.object({
    title: z.string().default(""),
    url: z.string().default(""),
    content: z.string().default(""),
    accessedAt: dateString,
    nextReviewAt: dateString
  }).passthrough()).default([]),
  schemaVersion
}).passthrough();

export const decisionSchema = z.object({
  id: z.string().min(1),
  parentId: goalId,
  title: z.string().min(1),
  status: z.string().min(1).default("open"),
  decisionBy: dateString,
  earlyReviewAt: dateString,
  options: stringArray,
  evidenceNeeded: stringArray,
  sourceIds: stringArray,
  schemaVersion,
  updatedAt: dateString
}).passthrough();

export const courseSchema = z.object({
  // 课表以节次为主，开始/结束时间用于展示和冲突辅助判断。
  id: z.string().min(1),
  dayOfWeek: z.number().int().min(1).max(7),
  periodStart: z.number().int().min(1).max(15),
  periodEnd: z.number().int().min(1).max(15),
  title: z.string().min(1, "课程名称不能为空"),
  location: z.string().default(""),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "开始时间应为 HH:mm").nullable().default(null),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "结束时间应为 HH:mm").nullable().default(null),
  teacher: z.string().default(""),
  weekRange: z.string().default(""),
  source: z.enum(["manual", "text", "image"]).default("manual"),
  schemaVersion,
  createdAt: dateString,
  updatedAt: dateString
}).passthrough().refine((course) => course.periodEnd >= course.periodStart, {
  message: "结束节次不能早于开始节次",
  path: ["periodEnd"]
});

export const scheduleSchema = z.array(courseSchema);

export const stateSchema = z.object({
  config: configSchema,
  goals: z.array(goalSchema),
  tasks: z.array(taskSchema),
  sources: z.array(sourceSchema),
  decisions: z.array(decisionSchema),
  schedule: scheduleSchema.optional()
}).passthrough();

const DATASET_SCHEMAS = {
  config: configSchema,
  goals: z.array(goalSchema),
  tasks: z.array(taskSchema),
  sources: z.array(sourceSchema),
  decisions: z.array(decisionSchema),
  schedule: scheduleSchema
};

export function formatValidationIssues(issues) {
  return issues.map((issue) => {
    const path = issue.path.length ? issue.path.join(".") : "根节点";
    return `${path}: ${issue.message}`;
  }).join("；");
}

export function validateDataset(name, value) {
  // 按数据集名称查找对应 schema，未知名称直接暴露配置错误。
  const schema = DATASET_SCHEMAS[name];
  if (!schema) throw new Error(`没有为 ${name} 定义 Zod schema。`);
  return schema.safeParse(value);
}

export function validateState(state) {
  // 逐数据集校验并记录问题；失败的数据集会回退为空值而不阻断启动。
  const parsed = {};
  const issues = [];
  const names = ["config", "goals", "tasks", "sources", "decisions"];
  for (const name of names) {
    const result = validateDataset(name, state[name]);
    if (result.success) {
      parsed[name] = result.data;
    } else {
      issues.push({
        dataset: name,
        message: formatValidationIssues(result.error.issues)
      });
      parsed[name] = name === "config" ? configSchema.parse({}) : [];
    }
  }
  const scheduleResult = validateDataset("schedule", state.schedule ?? []);
  if (scheduleResult.success) {
    parsed.schedule = scheduleResult.data;
  } else {
    issues.push({
      dataset: "schedule",
      message: formatValidationIssues(scheduleResult.error.issues)
    });
    parsed.schedule = [];
  }
  return {
    success: issues.length === 0,
    data: parsed,
    issues
  };
}

export function assertValidState(state) {
  // 写入路径使用断言版本，任何结构问题都在持久化前抛出。
  const result = validateState(state);
  if (!result.success) {
    throw new Error(`数据写入被拒绝：${result.issues.map((issue) => `${issue.dataset}（${issue.message}）`).join("；")}`);
  }
  return result.data;
}

export function assertValidSchedule(schedule) {
  // 课表单独断言，便于课表管理界面给出专门的错误信息。
  const result = validateDataset("schedule", schedule);
  if (!result.success) {
    throw new Error(`课表写入被拒绝：${formatValidationIssues(result.error.issues)}`);
  }
  return result.data;
}

export function inspectStateHealth(state, schedule = state.schedule ?? []) {
  // 返回每个数据集的健康状态，不因一个异常跳过其他数据集检查。
  const reports = [];
  for (const name of ["config", "goals", "tasks", "sources", "decisions"]) {
    const result = validateDataset(name, state[name]);
    reports.push({
      dataset: name,
      ok: result.success,
      message: result.success ? "正常" : formatValidationIssues(result.error.issues)
    });
  }
  const scheduleResult = validateDataset("schedule", schedule);
  reports.push({
    dataset: "schedule",
    ok: scheduleResult.success,
    message: scheduleResult.success ? "正常" : formatValidationIssues(scheduleResult.error.issues)
  });
  return reports;
}
