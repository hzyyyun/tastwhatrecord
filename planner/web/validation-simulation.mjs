import {
  loadState,
  openDatabase,
  replaceState,
  saveSchedule
} from "./lib/idb.mjs";
import { normalizeState } from "../src/schema.mjs";

async function run() {
  const output = document.querySelector("#simulation-results");
  const db = await openDatabase();
  const current = await loadState(db);
  const results = [];

  try {
    await replaceState(db, normalizeState({
      ...current,
      tasks: [...current.tasks, {
        id: "INVALID-TEST",
        parentId: current.goals[0]?.id ?? "Q0",
        title: "错误日期测试",
        type: "action",
        status: "todo",
        dueAt: "明天"
      }]
    }));
    results.push({ ok: false, label: "任务日期“明天”", message: "没有被拦截" });
  } catch (error) {
    results.push({ ok: true, label: "任务日期“明天”", message: error.message });
  }

  try {
    await saveSchedule(db, [{
      id: "INVALID-COURSE",
      dayOfWeek: 1,
      periodStart: 5,
      periodEnd: 2,
      title: "错误节次测试",
      source: "manual"
    }]);
    results.push({ ok: false, label: "课表节次倒置", message: "没有被拦截" });
  } catch (error) {
    results.push({ ok: true, label: "课表节次倒置", message: error.message });
  }

  output.innerHTML = results.map((result) => `
    <div class="${result.ok ? "healthy" : "unhealthy"}">
      ${result.label}：${result.ok ? "拦截成功" : "拦截失败"}。${result.message}
    </div>
  `).join("");
}

run().catch((error) => {
  document.querySelector("#simulation-results").innerHTML =
    `<div class="unhealthy">模拟运行失败：${error.message}</div>`;
});

