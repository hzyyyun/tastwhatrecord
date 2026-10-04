function nextForPrefix(goals, prefix) {
  const safePrefix = prefix.trim() || "Q";
  const escaped = safePrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}(\\d+)$`, "i");
  let max = 0;
  for (const goal of goals) {
    const match = pattern.exec(goal.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${safePrefix}${max + 1}`;
}

export function resolveGoalId(goals, input = "Q") {
  const value = input.trim() || "Q";
  if (/^[A-Za-z0-9_-]+$/.test(value) && /\d+$/.test(value)) {
    if (goals.some((goal) => goal.id === value)) {
      throw new Error(`主线 ID 已存在：${value}`);
    }
    return value;
  }
  return nextForPrefix(goals, value);
}

export const nextGoalId = resolveGoalId;
