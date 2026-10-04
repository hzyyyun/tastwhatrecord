import {
  normalizeCourse,
  normalizeSchedule,
  normalizeState,
  normalizeTask
} from "../../src/schema.mjs";
import { assertValidState } from "./validation.mjs";

const ALLOWED_UPDATE_FIELDS = new Set([
  "title",
  "type",
  "status",
  "priority",
  "impact",
  "dueAt",
  "reviewAt",
  "estimateMin",
  "acceptance",
  "parentId",
  "parentTaskId",
  "preparationDays",
  "raiseAt",
  "needsReplan",
  "replanReason",
  "unblockCondition",
  "waitingFor",
  "tags"
]);
const ALLOWED_COURSE_FIELDS = new Set([
  "dayOfWeek",
  "periodStart",
  "periodEnd",
  "title",
  "location",
  "startTime",
  "endTime",
  "teacher",
  "weekRange",
  "source"
]);

const TASK_TYPES = new Set(["action", "research", "decision", "milestone", "habit"]);
function operationId(operation, index) {
  return `${operation.op ?? "operation"}-${index}`;
}

function sanitizeTaskPayload(payload = {}) {
  if (!String(payload.parentId ?? "").trim()) throw new Error("新任务必须挂到一条主线。");
  if (!String(payload.title ?? "").trim()) throw new Error("新任务缺少标题。");
  const type = TASK_TYPES.has(payload.type) ? payload.type : "action";
  return normalizeTask({
    ...payload,
    id: payload.id || crypto.randomUUID(),
    type,
    status: payload.status ?? "todo",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

function applyOne(state, operation) {
  const next = structuredClone(state);
  switch (operation.op) {
    case "create_task": {
      if (!next.goals.some((goal) => goal.id === operation.payload?.parentId)) {
        throw new Error(`主线不存在：${operation.payload?.parentId}`);
      }
      const task = sanitizeTaskPayload(operation.payload);
      if (next.tasks.some((item) => item.id === task.id)) {
        throw new Error(`任务 ID 已存在：${task.id}`);
      }
      next.tasks.push(task);
      return {
        state: next,
        change: {
          before: "不存在",
          after: `${task.id} ${task.title}`
        }
      };
    }
    case "update_task": {
      const id = operation.id ?? operation.payload?.id;
      const task = next.tasks.find((item) => item.id === id);
      if (!task) throw new Error(`找不到任务：${id}`);
      const changes = operation.changes ?? operation.payload?.changes ?? {};
      const before = JSON.stringify(Object.fromEntries(Object.keys(changes).map((key) => [key, task[key]])));
      for (const [key, value] of Object.entries(changes)) {
        if (!ALLOWED_UPDATE_FIELDS.has(key)) continue;
        task[key] = value;
      }
      task.updatedAt = new Date().toISOString();
      const after = JSON.stringify(Object.fromEntries(Object.keys(changes).map((key) => [key, task[key]])));
      return {
        state: next,
        change: { before, after }
      };
    }
    case "set_task_status": {
      const id = operation.id ?? operation.payload?.id;
      const status = operation.status ?? operation.payload?.status;
      const task = next.tasks.find((item) => item.id === id);
      if (!task) throw new Error(`找不到任务：${id}`);
      const before = task.status;
      task.status = status;
      task.updatedAt = new Date().toISOString();
      if (status === "done") task.completedAt = task.updatedAt;
      return {
        state: next,
        change: { before: `status=${before}`, after: `status=${status}` }
      };
    }
    case "archive_task": {
      const id = operation.id ?? operation.payload?.id;
      const task = next.tasks.find((item) => item.id === id);
      if (!task) throw new Error(`找不到任务：${id}`);
      const before = task.status;
      task.status = "cancelled";
      task.updatedAt = new Date().toISOString();
      return {
        state: next,
        change: { before: `status=${before}`, after: "status=cancelled" }
      };
    }
    case "create_decision": {
      const payload = operation.payload ?? {};
      if (!next.goals.some((goal) => goal.id === payload.parentId)) {
        throw new Error(`主线不存在：${payload.parentId}`);
      }
      if (!String(payload.title ?? "").trim()) throw new Error("新决策缺少标题。");
      const decision = {
        id: payload.id || crypto.randomUUID(),
        parentId: payload.parentId,
        title: payload.title,
        status: "open",
        decisionBy: payload.decisionBy ?? null,
        earlyReviewAt: payload.earlyReviewAt ?? null,
        options: Array.isArray(payload.options) ? payload.options : [],
        evidenceNeeded: Array.isArray(payload.evidenceNeeded) ? payload.evidenceNeeded : [],
        sourceIds: [],
        schemaVersion: 1,
        updatedAt: new Date().toISOString()
      };
      next.decisions.push(decision);
      return {
        state: next,
        change: {
          before: "不存在",
          after: `${decision.id} ${decision.title}`
        }
      };
    }
    case "create_schedule_item": {
      const course = normalizeCourse({
        ...(operation.payload ?? {}),
        id: operation.payload?.id || crypto.randomUUID(),
        source: operation.payload?.source ?? "text",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      next.schedule = normalizeSchedule([...(next.schedule ?? []), course]);
      return {
        state: next,
        change: {
          before: "不存在",
          after: `${course.id} ${course.title}`
        }
      };
    }
    case "update_schedule_item": {
      const id = operation.id ?? operation.payload?.id;
      const changes = operation.changes ?? operation.payload?.changes ?? {};
      const course = (next.schedule ?? []).find((item) => item.id === id);
      if (!course) throw new Error(`找不到课程：${id}`);
      const before = JSON.stringify(Object.fromEntries(Object.keys(changes).map((key) => [key, course[key]])));
      for (const [key, value] of Object.entries(changes)) {
        if (ALLOWED_COURSE_FIELDS.has(key)) course[key] = value;
      }
      course.updatedAt = new Date().toISOString();
      const after = JSON.stringify(Object.fromEntries(Object.keys(changes).map((key) => [key, course[key]])));
      return {
        state: next,
        change: { before, after }
      };
    }
    case "archive_schedule_item": {
      const id = operation.id ?? operation.payload?.id;
      const schedule = next.schedule ?? [];
      const index = schedule.findIndex((item) => item.id === id);
      if (index < 0) throw new Error(`找不到课程：${id}`);
      const [course] = schedule.splice(index, 1);
      next.schedule = schedule;
      return {
        state: next,
        change: {
          before: `${course.id} ${course.title}`,
          after: "已从课表移除"
        }
      };
    }
    case "create_research_record": {
      const payload = operation.payload ?? {};
      if (!String(payload.title ?? "").trim()) throw new Error("研究记录缺少标题。");
      const sourceId = payload.sourceId || crypto.randomUUID();
      const taskIds = payload.taskId ? [payload.taskId] : [];
      const source = {
        id: sourceId,
        title: String(payload.title),
        type: "web-research",
        path: payload.records?.[0]?.url ?? "",
        copiedPath: null,
        hash: null,
        size: 0,
        capturedAt: payload.accessedAt ?? new Date().toISOString(),
        status: payload.simulated ? "simulated" : "researched",
        note: String(payload.answer ?? ""),
        summary: String(payload.answer ?? ""),
        taskIds,
        decisionId: payload.decisionId ?? null,
        goalId: payload.goalId ?? null,
        nextReviewAt: payload.nextReviewAt ?? null,
        records: Array.isArray(payload.records) ? payload.records : [],
        schemaVersion: 1
      };
      next.sources.push(source);
      if (payload.taskId) {
        const task = next.tasks.find((item) => item.id === payload.taskId);
        if (!task) throw new Error(`关联任务不存在：${payload.taskId}`);
        task.sourceIds = [...new Set([...(task.sourceIds ?? []), sourceId])];
        task.updatedAt = new Date().toISOString();
      }
      if (payload.decisionId) {
        const decision = next.decisions.find((item) => item.id === payload.decisionId);
        if (!decision) throw new Error(`关联决策不存在：${payload.decisionId}`);
        decision.sourceIds = [...new Set([...(decision.sourceIds ?? []), sourceId])];
        decision.updatedAt = new Date().toISOString();
      }
      return {
        state: next,
        change: {
          before: "不存在",
          after: `${sourceId} ${source.title}`
        }
      };
    }
    default:
      throw new Error(`不支持的提案类型：${operation.op}`);
  }
}

export function previewProposal(state, proposal) {
  const previews = [];
  let working = state;
  proposal.operations.forEach((operation, index) => {
    try {
      const result = applyOne(working, operation);
      working = result.state;
      previews.push({
        id: operationId(operation, index),
        index,
        op: operation.op,
        reason: String(operation.reason ?? ""),
        valid: true,
        before: result.change.before,
        after: result.change.after
      });
    } catch (error) {
      previews.push({
        id: operationId(operation, index),
        index,
        op: operation.op,
        reason: String(operation.reason ?? ""),
        valid: false,
        error: error.message
      });
    }
  });
  return previews;
}

export function applySelectedProposal(state, proposal, selectedIndexes) {
  const selected = new Set(selectedIndexes);
  const normalizedBefore = assertValidState(normalizeState(state));
  let next = normalizedBefore;
  const applied = [];
  proposal.operations.forEach((operation, index) => {
    if (!selected.has(index)) return;
    const result = applyOne(next, operation);
    next = result.state;
    applied.push(operationId(operation, index));
  });
  const normalized = assertValidState(normalizeState(next));
  const changedDatasets = ["config", "goals", "tasks", "sources", "decisions", "schedule"]
    .filter((name) => JSON.stringify(normalizedBefore[name] ?? []) !== JSON.stringify(normalized[name] ?? []));
  return {
    state: normalized,
    applied,
    changedDatasets
  };
}
