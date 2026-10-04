const ACTIVE_STATUSES = new Set(["todo", "in_progress", "blocked", "active"]);

function periodsOverlap(first, second) {
  return first.dayOfWeek === second.dayOfWeek
    && first.periodStart <= second.periodEnd
    && second.periodStart <= first.periodEnd;
}

export function buildAuditReport(state, schedule = state.schedule ?? [], now = new Date()) {
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

