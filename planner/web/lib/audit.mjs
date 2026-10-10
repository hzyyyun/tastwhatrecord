// 本地体检规则：只检查课表硬冲突和临近且尚未排期的任务。
const ACTIVE_STATUSES = new Set(["todo", "in_progress", "blocked", "active"]);

function periodsOverlap(first, second) {
  // 同一天且节次区间相交才算硬冲突。
  return first.dayOfWeek === second.dayOfWeek
    && first.periodStart <= second.periodEnd
    && second.periodStart <= first.periodEnd;
}

export function buildAuditReport(state, schedule = state.schedule ?? [], now = new Date()) {
  // 两两比较课程，当前数据规模下 O(n^2) 足够简单且可预测。
  const issues = [];
  const courses = Array.isArray(schedule) ? schedule : [];
  for (let firstIndex = 0; firstIndex < courses.length; firstIndex += 1) {
    const first = courses[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < courses.length; secondIndex += 1) {
      const second = courses[secondIndex];
      if (!periodsOverlap(first, second)) continue;
      issues.push({
        type: "schedule_conflict",
        severity: "red",
        title: "课表时间硬冲突",
        message: `${first.title} 与 ${second.title} 在同一天发生节次重叠。`,
        courseIds: [first.id, second.id]
      });
    }
  }
  return {
    generatedAt: now.toISOString(),
    checkedCourses: courses.length,
    counts: {
      scheduleConflict: issues.length
    },
    issues
  };
}

export function buildRadarWarnings(state, now = new Date()) {
  // 已安排 scheduledStartAt 的任务不重复进入未排期警告。
  const warnings = [];
  for (const task of state.tasks) {
    if (!ACTIVE_STATUSES.has(task.status) || !task.dueAt || task.scheduledStartAt) continue;
    const due = new Date(task.dueAt);
    if (Number.isNaN(due.getTime())) continue;
    const days = (due.getTime() - now.getTime()) / 86_400_000;
    if (days > 7) continue;
    warnings.push({
      taskId: task.id,
      title: task.title,
      dueAt: task.dueAt,
      days,
      severity: days < 0 ? "red" : "yellow"
    });
  }
  return warnings.sort((first, second) => first.days - second.days);
}
