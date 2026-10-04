import test from "node:test";
import assert from "node:assert/strict";
import { buildAuditReport, buildRadarWarnings } from "../web/lib/audit.mjs";

test("audit report only finds hard schedule conflicts", () => {
  const now = new Date("2026-10-05T12:00:00+08:00");
  const report = buildAuditReport({
    goals: [{ id: "Q1", title: "study" }],
    tasks: []
  }, [
    { id: "C1", dayOfWeek: 1, periodStart: 1, periodEnd: 3, title: "高数" },
    { id: "C2", dayOfWeek: 1, periodStart: 3, periodEnd: 4, title: "英语" },
    { id: "C3", dayOfWeek: 2, periodStart: 1, periodEnd: 3, title: "程序" }
  ], now);
  assert.equal(report.counts.scheduleConflict, 1);
  assert.equal(report.issues[0].type, "schedule_conflict");
});

test("nearby unscheduled tasks are reported in the radar warning area", () => {
  const now = new Date("2026-10-05T12:00:00+08:00");
  const warnings = buildRadarWarnings({
    tasks: [
      { id: "A", title: "高数", status: "todo", dueAt: "2026-10-06T12:00:00+08:00" },
      {
        id: "B",
        title: "已排期",
        status: "todo",
        dueAt: "2026-10-06T12:00:00+08:00",
        scheduledStartAt: "2026-10-05T18:00:00+08:00"
      }
    ]
  }, now);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].taskId, "A");
});

