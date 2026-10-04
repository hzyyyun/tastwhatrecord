import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  briefLength,
  createChatboxBrief,
  formatPlannerDate
} from "../web/lib/brief.mjs";

test("Chatbox brief keeps complete dates and complete task fields", () => {
  const state = {
    config: { radarDays: 90, topTaskCount: 3 },
    goals: [
      { id: "Q0", title: "生活底盘", weight: 5 },
      { id: "Q1", title: "学业与考研", weight: 5 }
    ],
    tasks: [
      {
        id: "T1",
        parentId: "Q1",
        title: "完成高数作业",
        type: "action",
        status: "todo",
        priority: 1,
        impact: 5,
        dueAt: "2026-10-05T23:59:59+08:00"
      }
    ],
    decisions: [],
    sources: []
  };
  const brief = createChatboxBrief(state, "B");
  assert.ok(briefLength(brief) > 250);
  assert.match(brief, /你现在是我的大学生活规划助理。你只负责基于以下简报帮我分析和建议，不要复读原文/);
  assert.match(brief, /【当前状态】/);
  assert.match(brief, /【指令请求】/);
  assert.match(brief, /请帮我检查任务之间有没有冲突或遗漏/);
  assert.doesNotMatch(brief, /```|^#/m);
  assert.doesNotMatch(brief, /…|\.\.\./);
  assert.match(brief, /截止：2026-10-05 23:59/);
  assert.match(brief, /前置：14 天/);
  assert.equal(formatPlannerDate("2026-10-03T23:59:59+08:00"), "2026-10-03 23:59");
});

test("brief generator does not use string truncation", () => {
  const source = fs.readFileSync(
    new URL("../web/lib/brief.mjs", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(source, /\.slice\s*\(|\.substring\s*\(/);
});

test("brief supports the three fixed Chatbox requests", () => {
  const base = {
    config: { timezone: "Asia/Shanghai", radarDays: 90, topTaskCount: 3 },
    goals: [{ id: "Q0", title: "生活", weight: 5 }],
    tasks: [],
    decisions: [],
    sources: []
  };
  assert.match(createChatboxBrief(base, "A"), /请帮我判断今天最该先做的三件事，并说明理由/);
  assert.match(createChatboxBrief(base, "B"), /请帮我检查任务之间有没有冲突或遗漏/);
  assert.match(createChatboxBrief(base, "C"), /请基于我的现状，帮我重新规划接下来一周/);
  assert.match(
    createChatboxBrief(base, "D", "请只列出未来三天的风险。"),
    /请只列出未来三天的风险。/
  );
});
