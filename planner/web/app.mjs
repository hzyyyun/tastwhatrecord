// 浏览器主控制器：集中处理界面事件、IndexedDB 状态、AI 提案和导入导出流程。
import {
  clearLocalData,
  getSetting,
  loadAttachments,
  loadDocuments,
  loadRawDatasets,
  loadState,
  openDatabase,
  replaceState,
  saveAttachments,
  saveDocuments,
  saveSchedule,
  setSetting
} from "./lib/idb.mjs";
import {
  MAX_ARCHIVE_BYTES,
  createBackupArchive,
  detectDatasetConflicts,
  parseBackupArchive
} from "./lib/archive.mjs";
import {
  extractChatboxSession,
  extractChatboxJson,
  inspectChatboxJson,
  inspectChatboxZip
} from "./lib/chatbox.mjs";
import {
  getCredentialVaultMetadata,
  saveCredentialVault,
  unlockCredentialVault
} from "./lib/ai-vault.mjs";
import {
  extractScheduleFromImage,
  extractScheduleFromText,
  generateChangeProposal
} from "./lib/ai-client.mjs";
import {
  getUsageDateKey,
  nextUsageRecord,
  performTavilySearch,
  researchToMarkdown
} from "./lib/tavily.mjs";
import {
  applySelectedProposal,
  previewProposal
} from "./lib/proposal.mjs";
import {
  calculateRaiseAt,
  radarItems,
  taskTree,
  topTasks
} from "../src/engine.mjs";
import { createChatboxBrief } from "./lib/brief.mjs";
import { normalizeCourse, normalizeState } from "../src/schema.mjs";
import { resolveGoalId } from "./lib/goals.mjs";
import {
  inspectStateHealth,
  validateState
} from "./lib/validation.mjs";
import { buildAuditReport, buildRadarWarnings } from "./lib/audit.mjs";

// 启动时一次性缓存 DOM 引用；元素缺失会在初始化阶段尽早暴露。
const elements = {
  globalErrorBanner: document.querySelector("#global-error-banner"),
  globalErrorMessage: document.querySelector("#global-error-message"),
  dismissGlobalError: document.querySelector("#dismiss-global-error"),
  taskCount: document.querySelector("#task-count"),
  radarCount: document.querySelector("#radar-count"),
  documentCount: document.querySelector("#document-count"),
  sourceCount: document.querySelector("#source-count"),
  todayList: document.querySelector("#today-list"),
  todayScheduleList: document.querySelector("#today-schedule-list"),
  todayCount: document.querySelector("#today-count"),
  treeView: document.querySelector("#tree-view"),
  radarList: document.querySelector("#radar-list"),
  radarWarningList: document.querySelector("#radar-warning-list"),
  radarRange: document.querySelector("#radar-range"),
  briefButton: document.querySelector("#brief-button"),
  generateBrief: document.querySelector("#generate-brief"),
  briefCustomRequest: document.querySelector("#brief-custom-request"),
  backupButton: document.querySelector("#backup-button"),
  restoreButton: document.querySelector("#restore-button"),
  chatboxButton: document.querySelector("#chatbox-button"),
  inboxButton: document.querySelector("#inbox-button"),
  goalsButton: document.querySelector("#goals-button"),
  scheduleButton: document.querySelector("#schedule-button"),
  radarButton: document.querySelector("#radar-button"),
  liftButton: document.querySelector("#lift-button"),
  aiSettingsButton: document.querySelector("#ai-settings-button"),
  aiProposalButton: document.querySelector("#ai-proposal-button"),
  researchButton: document.querySelector("#research-button"),
  auditButton: document.querySelector("#audit-button"),
  clearButton: document.querySelector("#clear-button"),
  aiStatus: document.querySelector("#ai-status"),
  briefDialog: document.querySelector("#brief-dialog"),
  briefText: document.querySelector("#brief-text"),
  copyBrief: document.querySelector("#copy-brief"),
  importDialog: document.querySelector("#import-dialog"),
  conflictList: document.querySelector("#conflict-list"),
  restoreSettings: document.querySelector("#restore-settings"),
  restoreDocuments: document.querySelector("#restore-documents"),
  restoreAttachments: document.querySelector("#restore-attachments"),
  confirmImport: document.querySelector("#confirm-import"),
  chatboxDialog: document.querySelector("#chatbox-dialog"),
  chatboxSession: document.querySelector("#chatbox-session"),
  chatboxStatus: document.querySelector("#chatbox-status"),
  extractSession: document.querySelector("#extract-session"),
  saveExtraction: document.querySelector("#save-extraction"),
  generateChatboxProposal: document.querySelector("#generate-chatbox-proposal"),
  simulateChatboxProposal: document.querySelector("#simulate-chatbox-proposal"),
  chatboxRequirements: document.querySelector("#chatbox-requirements"),
  chatboxArchitecture: document.querySelector("#chatbox-architecture"),
  backupFile: document.querySelector("#backup-file"),
  chatboxFile: document.querySelector("#chatbox-file"),
  inboxDialog: document.querySelector("#inbox-dialog"),
  chooseInboxFile: document.querySelector("#choose-inbox-file"),
  inboxPasteText: document.querySelector("#inbox-paste-text"),
  addInboxText: document.querySelector("#add-inbox-text"),
  inboxList: document.querySelector("#inbox-list"),
  inboxFile: document.querySelector("#inbox-file"),
  processSourceDialog: document.querySelector("#process-source-dialog"),
  processSourceTitle: document.querySelector("#process-source-title"),
  processSourceType: document.querySelector("#process-source-type"),
  processSourceGoal: document.querySelector("#process-source-goal"),
  processSourceButton: document.querySelector("#process-source-button"),
  simulateSourceButton: document.querySelector("#simulate-source-button"),
  liftDialog: document.querySelector("#lift-dialog"),
  liftList: document.querySelector("#lift-list"),
  taskDialog: document.querySelector("#task-dialog"),
  taskDialogId: document.querySelector("#task-dialog-id"),
  taskDialogTitle: document.querySelector("#task-dialog-title"),
  taskDialogStatus: document.querySelector("#task-dialog-status"),
  taskDialogPriority: document.querySelector("#task-dialog-priority"),
  taskDialogDue: document.querySelector("#task-dialog-due"),
  taskDialogReview: document.querySelector("#task-dialog-review"),
  taskDialogPreparation: document.querySelector("#task-dialog-preparation"),
  taskDialogAcceptance: document.querySelector("#task-dialog-acceptance"),
  taskDialogUnblock: document.querySelector("#task-dialog-unblock"),
  saveTaskDetail: document.querySelector("#save-task-detail"),
  scheduleDialog: document.querySelector("#schedule-dialog"),
  chooseScheduleImage: document.querySelector("#choose-schedule-image"),
  simulateScheduleRecognition: document.querySelector("#simulate-schedule-recognition"),
  scheduleCourseId: document.querySelector("#schedule-course-id"),
  scheduleDay: document.querySelector("#schedule-day"),
  scheduleTitle: document.querySelector("#schedule-title"),
  schedulePeriodStart: document.querySelector("#schedule-period-start"),
  schedulePeriodEnd: document.querySelector("#schedule-period-end"),
  scheduleLocation: document.querySelector("#schedule-location"),
  scheduleTeacher: document.querySelector("#schedule-teacher"),
  scheduleStartTime: document.querySelector("#schedule-start-time"),
  scheduleEndTime: document.querySelector("#schedule-end-time"),
  scheduleWeekRange: document.querySelector("#schedule-week-range"),
  saveCourse: document.querySelector("#save-course"),
  resetCourseForm: document.querySelector("#reset-course-form"),
  scheduleList: document.querySelector("#schedule-list"),
  scheduleImageFile: document.querySelector("#schedule-image-file"),
  goalsDialog: document.querySelector("#goals-dialog"),
  goalNewPrefix: document.querySelector("#goal-new-prefix"),
  goalNewTitle: document.querySelector("#goal-new-title"),
  goalNewWeight: document.querySelector("#goal-new-weight"),
  addGoalButton: document.querySelector("#add-goal-button"),
  goalsList: document.querySelector("#goals-list"),
  deleteGoalDialog: document.querySelector("#delete-goal-dialog"),
  deleteGoalMessage: document.querySelector("#delete-goal-message"),
  deleteGoalTransferTarget: document.querySelector("#delete-goal-transfer-target"),
  deleteGoalTransfer: document.querySelector("#delete-goal-transfer"),
  deleteGoalCascade: document.querySelector("#delete-goal-cascade"),
  snapshotStatus: document.querySelector("#snapshot-status"),
  aiSettingsDialog: document.querySelector("#ai-settings-dialog"),
  aiBaseUrl: document.querySelector("#ai-base-url"),
  aiModel: document.querySelector("#ai-model"),
  aiApiKey: document.querySelector("#ai-api-key"),
  tavilyApiKey: document.querySelector("#tavily-api-key"),
  vaultPassphrase: document.querySelector("#vault-passphrase"),
  vaultPassphraseConfirm: document.querySelector("#vault-passphrase-confirm"),
  aiSettingsStatus: document.querySelector("#ai-settings-status"),
  dataHealthReport: document.querySelector("#data-health-report"),
  dataHealthButton: document.querySelector("#data-health-button"),
  validationSimulationButton: document.querySelector("#validation-simulation-button"),
  saveAiSettings: document.querySelector("#save-ai-settings"),
  unlockAiSettings: document.querySelector("#unlock-ai-settings"),
  lockAiSettings: document.querySelector("#lock-ai-settings"),
  proposalDialog: document.querySelector("#proposal-dialog"),
  proposalPrompt: document.querySelector("#proposal-prompt"),
  generateProposal: document.querySelector("#generate-proposal"),
  simulateAiProposal: document.querySelector("#simulate-ai-proposal"),
  proposalSummary: document.querySelector("#proposal-summary"),
  proposalList: document.querySelector("#proposal-list"),
  applyProposal: document.querySelector("#apply-proposal"),
  researchDialog: document.querySelector("#research-dialog"),
  researchTask: document.querySelector("#research-task"),
  researchGoal: document.querySelector("#research-goal"),
  researchOutput: document.querySelector("#research-output"),
  researchQuery: document.querySelector("#research-query"),
  researchUsage: document.querySelector("#research-usage"),
  runResearch: document.querySelector("#run-research"),
  simulateResearch: document.querySelector("#simulate-research"),
  researchResults: document.querySelector("#research-results"),
  saveResearch: document.querySelector("#save-research"),
  auditDialog: document.querySelector("#audit-dialog"),
  auditSummary: document.querySelector("#audit-summary"),
  auditList: document.querySelector("#audit-list"),
  toast: document.querySelector("#toast")
};

// 运行期状态：db/state 是核心数据，其余变量保存当前弹窗或异步流程的临时上下文。
let db;
let state;
let documents = [];
let attachments = [];
let pendingImport = null;
let pendingChatbox = null;
let pendingProposal = null;
let pendingResearch = null;
let credentials = null;
let scheduleCourses = [];
let dataHealthIssues = [];
let pendingGoalDelete = null;
let pendingSourceProcess = null;
let toastTimer;

function escapeHtml(value) {
  // 所有插入 innerHTML 的用户数据都必须经过转义，防止 HTML 注入。
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const STATUS_LABELS = {
  // 状态只做展示翻译，实际可写值由 Zod schema 约束。
  todo: "待办",
  in_progress: "进行中",
  blocked: "受阻",
  done: "已完成",
  cancelled: "归档",
  active: "持续进行"
};

function statusLabel(status) {
  return STATUS_LABELS[status] ?? status;
}

function toast(message) {
  // 短提示只保留一个活动计时器，后一条消息会覆盖前一条。
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 2400);
}

function activeTasks() {
  // blocked 仍属于需要持续跟踪的活动任务。
  return state.tasks.filter((task) => ["todo", "in_progress", "blocked", "active"].includes(task.status));
}

function plannerWeekdayNumber(date = new Date()) {
  // 将 Intl 返回的英文星期映射为课表使用的 1-7。
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: state.config?.timezone || "Asia/Shanghai",
    weekday: "short"
  }).format(date);
  return { Sun: 7, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[weekday];
}

function courseTimeLabel(course) {
  // 优先显示精确时间；没有时间时退化为节次范围。
  if (course.startTime && course.endTime) return `${course.startTime}-${course.endTime}`;
  if (course.periodStart === course.periodEnd) return `第 ${course.periodStart} 节`;
  return `第 ${course.periodStart}-${course.periodEnd} 节`;
}

function renderTodaySchedule() {
  // 只取当前时区的星期，并按开始节次排序。
  const weekday = plannerWeekdayNumber();
  const courses = scheduleCourses
    .filter((course) => course.dayOfWeek === weekday)
    .sort((a, b) => a.periodStart - b.periodStart);
  elements.todayScheduleList.innerHTML = courses.length
    ? courses.map((course) => `
      <button class="task-open course-item" type="button" data-course-id="${escapeHtml(course.id)}">
        <span class="course-time">${escapeHtml(courseTimeLabel(course))}</span>
        <span>
          <strong>${escapeHtml(course.title)}</strong>
          <span class="task-meta">${escapeHtml(course.location || "地点未设置")}${course.teacher ? ` · ${escapeHtml(course.teacher)}` : ""}</span>
        </span>
      </button>
    `).join("")
    : '<p class="task-meta">今天没有已录入课程。</p>';
}

function taskButton(task, subtitle) {
  // 任务按钮统一携带 data-task-id，由全局点击代理打开详情。
  return `
    <button class="task-open" type="button" data-task-id="${escapeHtml(task.id)}">
      <strong>${escapeHtml(task.title)}</strong>
      <span class="task-meta">${escapeHtml(subtitle)}</span>
    </button>
  `;
}

function renderTreeTask(task, level = 0) {
  // 任务树递归渲染子节点；level 参数用于保留后续扩展缩进样式的入口。
  const children = task.children ?? [];
  return `
    <li>
      ${taskButton(task, `${statusLabel(task.status)}${task.parentTaskId ? " · 子任务" : ""}`)}
      ${children.length ? `<ul class="tree-list">${children.map((child) => renderTreeTask(child, level + 1)).join("")}</ul>` : ""}
    </li>
  `;
}

function render() {
  // 所有数据写入完成后统一重绘首页，避免局部视图与内存状态不一致。
  const radar = radarItems(state);
  const radarWarnings = buildRadarWarnings(state);
  const today = topTasks(state);
  const active = activeTasks();
  elements.taskCount.textContent = String(active.length);
  elements.radarCount.textContent = String(radar.length);
  elements.documentCount.textContent = String(documents.length);
  elements.sourceCount.textContent = String(state.sources.length);
  elements.todayCount.textContent = `${today.length} 项优先`;
  elements.radarRange.textContent = `未来 ${state.config.radarDays} 天`;
  elements.radarWarningList.innerHTML = radarWarnings.length
    ? radarWarnings.map((warning) => `
      <div class="radar-warning-item ${warning.severity}">
        <button class="task-open" type="button" data-task-id="${escapeHtml(warning.taskId)}">
          <strong>${escapeHtml(warning.title)}</strong>
        </button>
        <span>${warning.days < 0 ? `已逾期 ${Math.abs(Math.round(warning.days))} 天` : `${Math.ceil(warning.days)} 天内到期且未排期`}</span>
      </div>
    `).join("")
    : '<p class="task-meta">没有临近且未排期的任务。</p>';
  renderTodaySchedule();

  elements.todayList.innerHTML = today.length
    ? today.map((task) => `
      <li>
        ${taskButton(task, `${task.parentId} · ${statusLabel(task.status)} · 截止 ${task.dueAt ?? "未设"}`)}
      </li>
    `).join("")
    : '<li class="task-meta">暂无活动任务</li>';

  elements.treeView.innerHTML = taskTree(state).map((goal) => {
    const tasks = goal.tasks.map((task) => renderTreeTask(task)).join("");
    return `
      <details class="tree-goal" open>
        <summary>${escapeHtml(goal.id)} · ${escapeHtml(goal.title)}</summary>
        <ul class="tree-list">${tasks || '<li class="task-meta">无直接任务</li>'}</ul>
      </details>
    `;
  }).join("");

  elements.radarList.innerHTML = radar.length
    ? radar.map((item) => `
      <li>
        ${item.link?.startsWith("task:")
          ? taskButton(item, `抬升 ${item.raiseAt ?? "未设"} · 截止 ${item.dueAt ?? "未设"}`)
          : `<strong>${escapeHtml(item.title)}</strong><span class="radar-meta">决策 · 复核 ${escapeHtml(item.reviewAt ?? "未设")} · 截止 ${escapeHtml(item.dueAt ?? "未设")}</span>`}
      </li>
    `).join("")
    : '<li class="radar-meta">暂无临期事项</li>';
}

function download(blob, filename) {
  // 创建临时对象 URL 触发浏览器下载，随后释放内存。
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function timestampName() {
  // 文件名使用本地时间，便于用户按下载时间辨认。
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

async function showBrief() {
  // 每次打开都回到默认选项并清空上次生成结果。
  elements.briefText.value = "";
  elements.briefCustomRequest.value = "";
  elements.copyBrief.disabled = true;
  const firstChoice = document.querySelector('input[name="brief-choice"]');
  if (firstChoice) firstChoice.checked = true;
  elements.briefDialog.showModal();
}

function generateSelectedBrief() {
  // 只根据当前选中项生成文本，不改变任务数据。
  const choice = document.querySelector('input[name="brief-choice"]:checked')?.value ?? "A";
  elements.briefText.value = createChatboxBrief(state, choice, elements.briefCustomRequest.value);
  elements.copyBrief.disabled = false;
}

async function backup() {
  // 先构造不含密钥的归档，再更新最后备份时间和内存快照。
  const briefText = createChatboxBrief(state);
  const archiveAttachments = await Promise.all(attachments.map(async (attachment) => ({
    path: attachment.path,
    data: new Uint8Array(await attachment.blob.arrayBuffer())
  })));
  const archive = await createBackupArchive({
    state,
    settings: {
      timezone: state.config.timezone
    },
    briefText,
    documents,
    attachments: archiveAttachments,
    schedule: scheduleCourses
  });
  download(archive.blob, `student-planner-backup-${timestampName()}.zip`);
  await setSetting(db, "lastBackupAt", archive.manifest.exportedAt);
  await setSetting(db, "autoSnapshot", {
    id: `SNAPSHOT-${crypto.randomUUID().slice(0, 8)}`,
    createdAt: archive.manifest.exportedAt,
    schemaVersion: archive.manifest.schemaVersion,
    state,
    schedule: scheduleCourses,
    documents,
    attachments,
    briefText,
    settings: archive.settings
  });
  await renderSnapshotStatus();
  toast("备份已导出，API Key 未包含。");
}

async function renderSnapshotStatus() {
  // 设置页只展示上次自动快照时间，不返回快照中的完整数据。
  const snapshot = await getSetting(db, "autoSnapshot");
  elements.snapshotStatus.textContent = snapshot
    ? `自动快照：${snapshot.createdAt}（第二版启用自动回滚）`
    : "自动快照：暂无";
}

function renderConflicts(conflicts) {
  // 每个数据集提供一个“备份/本地”二选一控件，默认使用备份。
  elements.conflictList.innerHTML = conflicts.map((conflict) => {
    const localLabel = conflict.localCount === undefined ? "本地配置" : `本地 ${conflict.localCount} 项`;
    const incomingLabel = conflict.incomingCount === undefined ? "备份配置" : `备份 ${conflict.incomingCount} 项`;
    return `
      <div class="conflict-row">
        <strong>${escapeHtml(conflict.name)}</strong>
        <span>${escapeHtml(localLabel)} / ${escapeHtml(incomingLabel)}</span>
        <select data-dataset="${escapeHtml(conflict.name)}">
          <option value="incoming">使用备份</option>
          <option value="local">保留本地</option>
        </select>
      </div>
    `;
  }).join("");
}

async function prepareImport(file) {
  // 导入前先完整解析和校验备份，只有确认后才写入本地。
  if (file.size > MAX_ARCHIVE_BYTES) throw new Error("备份包超过 100 MB 限制。");
  const parsed = await parseBackupArchive(file);
  pendingImport = parsed;
  renderConflicts(detectDatasetConflicts(
    { ...state, schedule: scheduleCourses },
    { ...parsed.state, schedule: parsed.schedule }
  ));
  elements.importDialog.showModal();
}

async function confirmImport() {
  // 逐数据集应用用户选择，设置/文档/附件再按复选框决定是否恢复。
  if (!pendingImport) return;
  const selections = new Map(
    [...elements.conflictList.querySelectorAll("select[data-dataset]")]
      .map((select) => [select.dataset.dataset, select.value])
  );
  const next = {};
  for (const name of ["config", "goals", "tasks", "sources", "decisions"]) {
    next[name] = selections.get(name) === "local" ? state[name] : pendingImport.state[name];
  }
  state = normalizeState(next);
  await replaceState(db, state);
  scheduleCourses = selections.get("schedule") === "local"
    ? scheduleCourses
    : pendingImport.schedule;
  await saveSchedule(db, scheduleCourses);

  if (elements.restoreSettings.checked) {
    for (const [key, value] of Object.entries(pendingImport.settings)) {
      if (/api.?key|token|secret|authorization|credential/i.test(key)) continue;
      await setSetting(db, key, value);
    }
  }
  if (elements.restoreDocuments.checked && pendingImport.documents.length) {
    const byPath = new Map(documents.map((document) => [document.path, document]));
    for (const document of pendingImport.documents) byPath.set(document.path, document);
    documents = [...byPath.values()];
    await saveDocuments(db, documents);
  }
  if (elements.restoreAttachments.checked && pendingImport.attachments.length) {
    const byPath = new Map(attachments.map((attachment) => [attachment.path, attachment]));
    for (const attachment of pendingImport.attachments) {
      byPath.set(attachment.path, {
        path: attachment.path,
        name: attachment.path.split("/").pop(),
        type: "",
        size: attachment.data.byteLength,
        blob: new Blob([attachment.data])
      });
    }
    attachments = [...byPath.values()];
    await saveAttachments(db, attachments);
  }

  elements.importDialog.close();
  pendingImport = null;
  render();
  toast("导入恢复完成。");
}

// 清空是破坏性操作，要求用户输入固定确认词后才能继续。
async function clearAll() {
  const answer = window.prompt('此操作会清空浏览器中的全部本地数据。请输入“清空”确认：');
  if (answer !== "清空") {
    toast("已取消清空。");
    return;
  }
  await clearLocalData(db);
  state = normalizeState({});
  documents = [];
  attachments = [];
  scheduleCourses = [];
  render();
  toast("本地数据已清空，可以开始导入恢复测试。");
}

async function prepareChatbox(file) {
  // ZIP 与 JSON 都先检查格式和会话列表，提取正文必须由用户主动触发。
  if (file.size > MAX_ARCHIVE_BYTES) throw new Error("Chatbox 备份超过 100 MB 限制。");
  const mode = file.name.toLowerCase().endsWith(".json") ? "json" : "zip";
  const inspection = mode === "json"
    ? await inspectChatboxJson(file)
    : await inspectChatboxZip(file);
  pendingChatbox = {
    file,
    mode,
    inspection,
    extraction: null
  };
  elements.chatboxSession.innerHTML = inspection.sessions
    .map((session) => `<option value="${escapeHtml(session.path)}">${escapeHtml(session.name)}</option>`)
    .join("");
  elements.chatboxRequirements.value = "";
  elements.chatboxArchitecture.value = "";
  elements.chatboxStatus.textContent = `发现 ${inspection.sessions.length} 个会话。请选择一个后提取。`;
  elements.saveExtraction.disabled = true;
  elements.generateChatboxProposal.disabled = true;
  elements.simulateChatboxProposal.disabled = true;
  elements.chatboxDialog.showModal();
}

async function extractSelectedChatbox() {
  // 只提取当前选中会话，提取结果暂存在内存中，未主动保存前不落盘。
  if (!pendingChatbox) return;
  const sessionPath = elements.chatboxSession.value;
  const extraction = pendingChatbox.mode === "json"
    ? await extractChatboxJson(pendingChatbox.file)
    : await extractChatboxSession(pendingChatbox.file, sessionPath);
  pendingChatbox.extraction = extraction;
  elements.chatboxRequirements.value = extraction.documents[0].content;
  elements.chatboxArchitecture.value = extraction.documents[1].content;
  elements.chatboxStatus.textContent = `已提取：诉求 ${extraction.counts.requirements} 条，架构 ${extraction.counts.architecture} 条。原文仍在内存中，尚未保存。`;
  elements.saveExtraction.disabled = false;
  elements.generateChatboxProposal.disabled = false;
  elements.simulateChatboxProposal.disabled = false;
}

async function saveChatboxExtraction() {
  // 保存的是用户可编辑的提取文档，原始 ZIP 和完整消息不会进入 IndexedDB。
  if (!pendingChatbox?.extraction) return;
  const incoming = [
    {
      path: "memory/requirements.md",
      content: elements.chatboxRequirements.value
    },
    {
      path: "memory/architecture.md",
      content: elements.chatboxArchitecture.value
    }
  ];
  const byPath = new Map(documents.map((document) => [document.path, document]));
  for (const document of incoming) byPath.set(document.path, document);
  documents = [...byPath.values()];
  await saveDocuments(db, documents);
  pendingChatbox = null;
  elements.chatboxFile.value = "";
  elements.chatboxDialog.close();
  render();
  toast("提取结果已写入记忆文档，ZIP 与原文未保存。");
}

async function updateAIStatus() {
  // 状态栏只反映“已解锁/已配置/未配置”，不展示密钥内容。
  const metadata = await getCredentialVaultMetadata(db);
  if (credentials) {
    elements.aiStatus.textContent = `AI 已解锁：${credentials.model}`;
    elements.aiStatus.classList.remove("neutral");
  } else if (metadata?.configured) {
    elements.aiStatus.textContent = "AI 已配置，等待解锁";
    elements.aiStatus.classList.add("neutral");
  } else {
    elements.aiStatus.textContent = "AI 未配置";
    elements.aiStatus.classList.add("neutral");
  }
}

async function openAISettings() {
  // 打开设置时只回填非敏感元数据，密钥与口令输入框始终清空。
  const metadata = await getCredentialVaultMetadata(db);
  elements.dataHealthReport.innerHTML = "";
  elements.aiBaseUrl.value = metadata?.baseURL ?? "";
  elements.aiModel.value = metadata?.model ?? "";
  elements.aiApiKey.value = "";
  elements.tavilyApiKey.value = "";
  elements.vaultPassphrase.value = "";
  elements.vaultPassphraseConfirm.value = "";
  elements.aiSettingsStatus.textContent = metadata?.configured
    ? `已保存配置，模型：${metadata.model}。Tavily：${metadata.tavilyConfigured ? "已配置" : "未配置"}。输入口令可解锁。`
    : "尚未保存配置。";
  elements.aiSettingsDialog.showModal();
}

async function saveAISettings() {
  // 保存时校验两次口令一致，加密后立即解锁当前页面会话。
  const passphrase = elements.vaultPassphrase.value;
  if (passphrase !== elements.vaultPassphraseConfirm.value) {
    throw new Error("两次输入的口令不一致。");
  }
  credentials = await saveCredentialVault(db, passphrase, {
    baseURL: elements.aiBaseUrl.value,
    model: elements.aiModel.value,
    apiKey: elements.aiApiKey.value,
    tavilyApiKey: elements.tavilyApiKey.value
  });
  elements.aiApiKey.value = "";
  elements.tavilyApiKey.value = "";
  elements.vaultPassphrase.value = "";
  elements.vaultPassphraseConfirm.value = "";
  elements.aiSettingsStatus.textContent = "配置已加密保存并解锁。";
  await updateAIStatus();
  toast("AI 与 Tavily 配置已加密保存。");
}

async function unlockAISettings() {
  // 解锁只在当前内存中持有明文凭据，刷新页面后需要重新输入口令。
  const passphrase = elements.vaultPassphrase.value;
  credentials = await unlockCredentialVault(db, passphrase);
  elements.aiBaseUrl.value = credentials.baseURL;
  elements.aiModel.value = credentials.model;
  elements.aiApiKey.value = "";
  elements.tavilyApiKey.value = "";
  elements.vaultPassphrase.value = "";
  elements.vaultPassphraseConfirm.value = "";
  elements.aiSettingsStatus.textContent = "保险箱已解锁，Key 仅在当前页面内存中使用。";
  await updateAIStatus();
  toast("AI 与 Tavily 已解锁。");
}

async function lockAISettings() {
  // 主动锁定会清除内存凭据，但保留 IndexedDB 中的密文记录。
  credentials = null;
  elements.aiSettingsStatus.textContent = "保险箱已锁定。";
  await updateAIStatus();
  toast("AI 与 Tavily 已锁定。");
}

function requireCredentials() {
  // AI/搜索操作统一要求先解锁，避免各流程各自检查。
  if (!credentials) throw new Error("请先在“AI 与搜索设置”中解锁保险箱。");
  return credentials;
}

async function openProposalDialog() {
  // 新打开提案时清除上一次操作上下文，避免误应用旧结果。
  pendingProposal = null;
  elements.proposalSummary.textContent = "";
  elements.proposalList.innerHTML = "";
  elements.applyProposal.disabled = true;
  elements.proposalDialog.showModal();
}

function renderProposalPreview(proposal) {
  // 对每个操作逐条预演，并把基线状态保存下来供确认应用时复用。
  const baseState = normalizeState({ ...state, schedule: scheduleCourses });
  const previews = previewProposal(baseState, proposal);
  pendingProposal = { proposal, previews, baseState };
  elements.proposalSummary.textContent = proposal.summary || `共 ${previews.length} 项变更建议。`;
  elements.proposalList.innerHTML = previews.map((preview) => `
    <article class="proposal-item ${preview.valid ? "" : "invalid"}">
      <header>
        <label>
          <input type="checkbox" data-proposal-index="${preview.index}" ${preview.valid ? "checked" : "disabled"}>
          ${escapeHtml(preview.op)}
        </label>
        <strong>${preview.valid ? "可应用" : "无效"}</strong>
      </header>
      <p>${escapeHtml(preview.reason || "AI 未提供理由。")}</p>
      ${preview.valid
        ? `<div class="diff">变更前：${escapeHtml(preview.before)}\n变更后：${escapeHtml(preview.after)}</div>`
        : `<div class="diff">${escapeHtml(preview.error)}</div>`}
    </article>
  `).join("");
  elements.applyProposal.disabled = !previews.some((preview) => preview.valid);
}

async function generateProposal() {
  // 生成期间禁用按钮，防止重复请求；返回结果只进入预览。
  const activeCredentials = requireCredentials();
  elements.generateProposal.disabled = true;
  elements.proposalSummary.textContent = "正在生成提案...";
  try {
    const proposal = await generateChangeProposal({
      credentials: activeCredentials,
      state,
      prompt: elements.proposalPrompt.value
    });
    renderProposalPreview(proposal);
  } finally {
    elements.generateProposal.disabled = false;
  }
}

async function applyProposalSelection() {
  // 只应用用户勾选的操作，并分别持久化任务类数据和课表数据。
  if (!pendingProposal) return;
  const selected = [...elements.proposalList.querySelectorAll("input[data-proposal-index]:checked")]
    .map((input) => Number(input.dataset.proposalIndex));
  if (!selected.length) throw new Error("请至少选择一项变更。");
  const result = applySelectedProposal(pendingProposal.baseState, pendingProposal.proposal, selected);
  state = normalizeState(result.state);
  scheduleCourses = result.state.schedule ?? [];
  if (result.changedDatasets.some((name) => name !== "schedule")) {
    await replaceState(db, state);
  }
  if (result.changedDatasets.includes("schedule")) {
    await saveSchedule(db, scheduleCourses);
  }
  if (pendingResearch?.sourceId) {
    const path = `memory/research/${timestampName()}-${pendingResearch.sourceId}.md`;
    const existing = new Map(documents.map((document) => [document.path, document]));
    existing.set(path, { path, content: researchToMarkdown(pendingResearch.result) });
    documents = [...existing.values()];
    await saveDocuments(db, [existing.get(path)]);
    pendingResearch = null;
  }
  pendingProposal = null;
  elements.proposalDialog.close();
  render();
  toast(`已应用 ${result.applied.length} 项确认变更。`);
}

function nextReviewTime(task) {
  // 默认复核日不超过任务截止日，避免给已完成节点安排迟到复查。
  const now = new Date();
  const defaultDays = Number(state.config.defaultReviewDays ?? 14);
  const defaultDate = new Date(now.getTime() + defaultDays * 86_400_000);
  if (!task?.dueAt) return defaultDate.toISOString();
  const due = new Date(task.dueAt);
  if (Number.isNaN(due.getTime())) return defaultDate.toISOString();
  return new Date(Math.min(defaultDate.getTime(), due.getTime())).toISOString();
}

async function renderResearchUsage() {
  // 显示上海时区下的日/月用量，超额只提示，不在这里阻止调用。
  const usage = await getSetting(db, "researchUsage");
  const dateKey = getUsageDateKey();
  const monthKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit"
  }).format(new Date());
  const dailyCount = usage?.dateKey === dateKey
    ? Number(usage.dailyCount ?? usage.count ?? 0)
    : 0;
  const monthlyCount = usage?.monthKey === monthKey ? Number(usage.monthlyCount ?? 0) : 0;
  const quota = Number(state.config.tavilyMonthlyQuota ?? 1000);
  const threshold = Number(state.config.tavilyLowQuotaThreshold ?? 50);
  const remaining = quota - monthlyCount;
  const warning = remaining <= threshold
    ? '<div class="unhealthy">免费额度即将用尽，超出后将按次计费。</div>'
    : "";
  elements.researchUsage.innerHTML = `
    <div>总配额：${quota} 次/月</div>
    <div>今日已用：${dailyCount} 次</div>
    <div>本月已用：${monthlyCount} 次</div>
    <div>剩余：${remaining} 次</div>
    ${warning}
  `;
}

async function openResearchDialog() {
  // 研究可关联任务或主线，但不强制；输出方式由用户后续确认。
  const tasks = activeTasks().filter((task) => task.type !== "habit");
  elements.researchTask.innerHTML = [
    '<option value="">不关联任务</option>',
    ...tasks.map((task) => `<option value="${escapeHtml(task.id)}">${escapeHtml(task.title)}</option>`)
  ].join("");
  elements.researchGoal.innerHTML = [
    '<option value="">不关联主线</option>',
    ...state.goals.map((goal) => `<option value="${escapeHtml(goal.id)}">${escapeHtml(goal.title)}</option>`)
  ].join("");
  elements.researchQuery.value = "";
  pendingResearch = null;
  elements.researchResults.innerHTML = "";
  elements.saveResearch.disabled = true;
  await renderResearchUsage();
  elements.researchDialog.showModal();
}

async function runResearch() {
  // 真实搜索前确认 Tavily Key 已解锁，成功后才增加用量计数。
  const activeCredentials = requireCredentials();
  if (!activeCredentials.tavilyApiKey) {
    throw new Error("请先在设置里填入 Tavily API Key，才能使用联网功能。");
  }
  const taskId = elements.researchTask.value;
  const goalId = elements.researchGoal.value;
  const task = state.tasks.find((item) => item.id === taskId);
  const query = elements.researchQuery.value.trim();
  const usage = await getSetting(db, "researchUsage");
  const nextUsage = nextUsageRecord(usage, new Date());
  elements.runResearch.disabled = true;
  try {
    const result = await performTavilySearch({
      apiKey: activeCredentials.tavilyApiKey,
      query,
      maxResults: 5,
      nextReviewAt: nextReviewTime(task)
    });
    await setSetting(db, "researchUsage", nextUsage);
    pendingResearch = { taskId, goalId, result, simulated: false };
    renderResearchResults(result);
    elements.saveResearch.disabled = false;
    await renderResearchUsage();
    toast(`Tavily 已返回 ${result.records.length} 条来源。`);
  } finally {
    elements.runResearch.disabled = false;
  }
}

async function saveResearchRecord() {
  // 研究结果先生成变更提案，再由统一提案预览流程落盘。
  if (!pendingResearch) return;
  const { taskId, goalId, result, simulated } = pendingResearch;
  const sourceId = `SRC-RESEARCH-${crypto.randomUUID().slice(0, 8)}`;
  pendingResearch.sourceId = sourceId;
  const output = elements.researchOutput.value;
  const operations = [];
  let linkedTaskId = taskId;
  let linkedDecisionId = "";
  if (output === "task" && !linkedTaskId) {
    if (!goalId) throw new Error("创建研究任务时必须关联一条主线。");
    linkedTaskId = `T-RESEARCH-${crypto.randomUUID().slice(0, 8)}`;
    operations.push({
      op: "create_task",
      payload: {
        id: linkedTaskId,
        parentId: goalId,
        title: `研究：${result.query}`,
        type: "research",
        status: "todo",
        priority: 2,
        impact: 3,
        acceptance: "形成研究结论并决定下一步行动"
      },
      reason: "将研究请求写入任务树"
    });
  }
  if (output === "decision") {
    if (!goalId) throw new Error("创建决策记录时必须关联一条主线。");
    linkedDecisionId = `D-RESEARCH-${crypto.randomUUID().slice(0, 8)}`;
    operations.push({
      op: "create_decision",
      payload: {
        id: linkedDecisionId,
        parentId: goalId,
        title: `研究决策：${result.query}`,
        options: [],
        evidenceNeeded: ["根据研究记录补充判断依据"]
      },
      reason: "将研究请求写入决策模块"
    });
  }
  operations.push({
    op: "create_research_record",
    payload: {
      sourceId,
      title: `${simulated ? "模拟研究" : "Tavily"}: ${result.query}`,
      query: result.query,
      answer: result.answer,
      records: result.records,
      accessedAt: result.accessedAt,
      nextReviewAt: result.nextReviewAt,
      taskId: linkedTaskId,
      decisionId: linkedDecisionId,
      goalId,
      simulated
    },
    reason: "保存联网研究记录"
  });
  const proposal = {
    summary: simulated ? "模拟研究记录，等待人工确认。" : "Tavily 研究记录，等待人工确认。",
    operations
  };
  elements.researchDialog.close();
  renderProposalPreview(proposal);
  elements.proposalDialog.showModal();
}

function renderResearchResults(result) {
  // 结果卡片只做安全转义展示，不在渲染时触发网络请求。
  elements.researchResults.innerHTML = result.records.map((record) => `
    <article class="research-item">
      <h3>${escapeHtml(record.title || "未命名来源")}</h3>
      <p>${escapeHtml(record.content)}</p>
      <p>URL：${escapeHtml(record.url)}<br>访问：${escapeHtml(record.accessedAt)}<br>复核：${escapeHtml(record.nextReviewAt)}</p>
    </article>
  `).join("");
}

function simulateResearch() {
  // 模拟结果标记 simulated=true，不消耗 Tavily 用量，也明确不是真实来源。
  const query = elements.researchQuery.value.trim();
  if (!query) throw new Error("请输入研究问题。");
  const accessedAt = new Date().toISOString();
  const nextReviewAt = new Date(Date.now() + 14 * 86_400_000).toISOString();
  const result = {
    query,
    answer: "这是不依赖 API 的模拟研究结果，用于验证“研究记录 -> 变更提案 -> 人工确认”流程。",
    accessedAt,
    nextReviewAt,
    records: [{
      title: "模拟来源",
      url: "https://example.invalid/simulated-research",
      content: "模拟来源内容。真实搜索不会使用此地址。",
      accessedAt,
      nextReviewAt
    }]
  };
  pendingResearch = {
    taskId: elements.researchTask.value,
    goalId: elements.researchGoal.value,
    result,
    simulated: true
  };
  renderResearchResults(result);
  elements.saveResearch.disabled = false;
  toast("已生成模拟研究结果，不会消耗额度。");
}

function safeFileName(name) {
  // 仅保留字母、数字、点和少量符号，防止路径穿越。
  return String(name).replace(/[^\p{L}\p{N}._-]+/gu, "_");
}

function renderInbox() {
  // 最新资料排在最前，提供原文预览和处理入口。
  const sources = [...state.sources].reverse();
  elements.inboxList.innerHTML = sources.length
    ? sources.map((source) => `
      <article class="inbox-item">
        <h3>${escapeHtml(source.title)}</h3>
        <p>${escapeHtml(source.type)} · ${escapeHtml(source.capturedAt ?? "未记录时间")} · ${escapeHtml(source.status ?? "")}</p>
        ${source.path ? `<button type="button" class="secondary" data-open-source="${escapeHtml(source.path)}">打开原件</button>` : ""}
        <button type="button" class="secondary" data-process-source="${escapeHtml(source.id)}">处理</button>
      </article>
    `).join("")
    : '<p class="task-meta">收件箱为空。只能添加你主动选择的文件。</p>';
}

async function openInbox() {
  // 收件箱是资料处理入口，不自动调用 AI。
  renderInbox();
  elements.inboxDialog.showModal();
}

async function ingestInboxFiles(fileList) {
  // 文件先落到附件仓库，再登记 source；文本文件额外生成可检索文档。
  const files = [...fileList];
  if (!files.length) return;
  const newAttachments = [];
  const newDocuments = [];
  const newSources = [];

  for (const file of files) {
    if (file.size > 25 * 1024 * 1024) {
      throw new Error(`文件超过 25 MB：${file.name}`);
    }
    const id = `SRC-INBOX-${crypto.randomUUID().slice(0, 8)}`;
    const safeName = safeFileName(file.name);
    const path = `files/${id}-${safeName}`;
    const extension = safeName.split(".").pop()?.toLowerCase() ?? "";
    const textType = ["md", "txt", "json"].includes(extension);
    const capturedAt = new Date().toISOString();
    let summary = "";

    newAttachments.push({
      path,
      name: file.name,
      type: file.type,
      size: file.size,
      blob: file
    });

    if (textType) {
      const content = await file.text();
      summary = content.slice(0, 240);
      newDocuments.push({
        path: `inbox/${id}-${safeName}.md`,
        content: `# ${file.name}\n\n- 原始文件：${path}\n- 导入时间：${capturedAt}\n\n${content}`
      });
    }

    newSources.push({
      id,
      title: file.name,
      type: extension || file.type || "file",
      path,
      copiedPath: path,
      hash: null,
      size: file.size,
      capturedAt,
      status: "inbox",
      note: "",
      summary,
      taskIds: [],
      schemaVersion: 1
    });
  }

  await saveAttachments(db, newAttachments);
  if (newDocuments.length) {
    const byPath = new Map(documents.map((document) => [document.path, document]));
    for (const document of newDocuments) byPath.set(document.path, document);
    documents = [...byPath.values()];
    await saveDocuments(db, newDocuments);
  }
  attachments = [...attachments, ...newAttachments];
  state = normalizeState({ ...state, sources: [...state.sources, ...newSources] });
  await replaceState(db, state);
  render();
  renderInbox();
  toast(`已加入收件箱：${files.length} 个文件。`);
}

async function ingestInboxText() {
  // 粘贴文本不创建附件，直接作为内存文档和 source 保存。
  const content = elements.inboxPasteText.value.trim();
  if (!content) throw new Error("请先粘贴课表或文字。");
  const id = `SRC-TEXT-${crypto.randomUUID().slice(0, 8)}`;
  const path = `inbox/${id}-pasted.md`;
  const capturedAt = new Date().toISOString();
  const document = {
    path,
    content: `# 粘贴文本\n\n- 导入时间：${capturedAt}\n\n${content}`
  };
  const source = {
    id,
    title: "粘贴文本",
    type: "text",
    path: "",
    copiedPath: path,
    hash: null,
    size: content.length,
    capturedAt,
    status: "inbox",
    note: "",
    summary: content.slice(0, 240),
    taskIds: [],
    schemaVersion: 1
  };
  documents = [...documents, document];
  state = normalizeState({ ...state, sources: [...state.sources, source] });
  await replaceState(db, state);
  await saveDocuments(db, [document]);
  elements.inboxPasteText.value = "";
  renderInbox();
  render();
  toast("文本已加入收件箱。");
}

function openSourceAttachment(path) {
  // 附件只在用户点击时创建临时 URL，并在一分钟后释放。
  const attachment = attachments.find((item) => item.path === path);
  if (!attachment) throw new Error("附件不存在或尚未恢复。");
  const url = URL.createObjectURL(attachment.blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function openLiftCalendar() {
  // 抬升日历按“开始处理时间”排序，空缺时退化为截止时间。
  const active = activeTasks()
    .filter((task) => task.type !== "habit")
    .map((task) => ({ ...task, raiseAt: calculateRaiseAt(task) }))
    .sort((a, b) => {
      const aTime = new Date(a.raiseAt ?? a.dueAt ?? "9999-12-31").getTime();
      const bTime = new Date(b.raiseAt ?? b.dueAt ?? "9999-12-31").getTime();
      return aTime - bTime;
    });
  elements.liftList.innerHTML = active.length
    ? active.map((task) => `
      <article class="proposal-item">
        ${taskButton(task, `抬升 ${task.raiseAt ?? "未设"} · 截止 ${task.dueAt ?? "未设"}`)}
      </article>
    `).join("")
    : '<p class="task-meta">暂无抬升事项。</p>';
  elements.liftDialog.showModal();
}

function openAuditReport() {
  // 体检完全使用本地规则，不依赖 AI 配置或网络。
  const report = buildAuditReport(state, scheduleCourses);
  elements.auditSummary.textContent = `已检查 ${report.checkedCourses} 门课程：课表硬冲突 ${report.counts.scheduleConflict}。`;
  elements.auditList.innerHTML = report.issues.length
    ? report.issues.map((issue) => `
      <article class="proposal-item ${issue.severity === "red" ? "invalid" : ""}">
        <header>
          <h3>${escapeHtml(issue.title)}</h3>
          <strong>${issue.severity === "red" ? "红灯" : "黄灯"}</strong>
        </header>
        <p>${escapeHtml(issue.message)}</p>
      </article>
    `).join("")
    : '<p class="task-meta">未发现规则问题。</p>';
  elements.auditDialog.showModal();
}

function openTaskDialog(taskId) {
  // 详情弹窗回填可编辑字段，任务 ID 保持在隐藏字段中。
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) throw new Error("任务不存在。");
  elements.taskDialogId.value = task.id;
  elements.taskDialogTitle.value = task.title ?? "";
  elements.taskDialogStatus.value = task.status ?? "todo";
  elements.taskDialogPriority.value = String(task.priority ?? 2);
  elements.taskDialogDue.value = task.dueAt ?? "";
  elements.taskDialogReview.value = task.reviewAt ?? "";
  elements.taskDialogPreparation.value = task.preparationDays ?? "";
  elements.taskDialogAcceptance.value = task.acceptance ?? "";
  elements.taskDialogUnblock.value = task.unblockCondition ?? "";
  elements.taskDialog.showModal();
}

async function saveTaskDetail() {
  // 更新前重新规范化状态，非法日期或状态会在写库前被拦截。
  const id = elements.taskDialogId.value;
  const tasks = state.tasks.map((task) => {
    if (task.id !== id) return task;
    return {
      ...task,
      title: elements.taskDialogTitle.value.trim(),
      status: elements.taskDialogStatus.value,
      priority: Number(elements.taskDialogPriority.value || 2),
      dueAt: elements.taskDialogDue.value.trim() || null,
      reviewAt: elements.taskDialogReview.value.trim() || null,
      preparationDays: elements.taskDialogPreparation.value.trim()
        ? Number(elements.taskDialogPreparation.value)
        : null,
      acceptance: elements.taskDialogAcceptance.value.trim(),
      unblockCondition: elements.taskDialogUnblock.value.trim(),
      updatedAt: new Date().toISOString()
    };
  });
  state = normalizeState({ ...state, tasks });
  await replaceState(db, state);
  elements.taskDialog.close();
  render();
  toast("任务已更新。");
}

async function generateProposalFromChatbox() {
  // 发送给模型的是截断后的提取预览，完整原始会话不会离开浏览器。
  const activeCredentials = requireCredentials();
  if (!pendingChatbox?.extraction) throw new Error("请先提取 Chatbox 内容。");
  const requirements = elements.chatboxRequirements.value.slice(0, 14_000);
  const architecture = elements.chatboxArchitecture.value.slice(0, 14_000);
  elements.generateChatboxProposal.disabled = true;
  try {
    const proposal = await generateChangeProposal({
      credentials: activeCredentials,
      state,
      prompt: [
        "根据以下 Chatbox 临时提取内容，生成最小必要的任务或数据变更提案。",
        "不要创建依赖原文归档的任务；只保留可执行的诉求和架构调整。",
        `所有新任务必须挂到以下已有主线之一：${state.goals.map((goal) => goal.id).join("、")}。`,
        "",
        "【需求提取】",
        requirements,
        "",
        "【架构提取】",
        architecture
      ].join("\n")
    });
    elements.chatboxDialog.close();
    renderProposalPreview(proposal);
    elements.proposalDialog.showModal();
  } finally {
    elements.generateChatboxProposal.disabled = false;
  }
}

function simulateChatboxProposal() {
  // 模拟提案不调用 AI，只验证预览和人工确认流程。
  if (!pendingChatbox?.extraction) throw new Error("请先提取 Chatbox 内容。");
  const goalId = state.goals[0]?.id;
  if (!goalId) throw new Error("请先新建至少一条主线。");
  const proposal = {
    summary: "这是不依赖 API 的模拟 Chatbox 变更提案。",
    operations: [{
      op: "create_task",
      payload: {
        parentId: goalId,
        title: "整理 Chatbox 临时提取结果",
        type: "action",
        status: "todo",
        priority: 2,
        impact: 3,
        acceptance: "人工确认提取结果并补充下一步"
      },
      reason: "模拟 Chatbox 处理流程"
    }]
  };
  elements.chatboxDialog.close();
  renderProposalPreview(proposal);
  elements.proposalDialog.showModal();
}

function simulateAIProposal() {
  // 模拟 AI 提案固定挂到首条主线，用于离线演示和回归测试。
  const goalId = state.goals[0]?.id;
  if (!goalId) throw new Error("请先新建至少一条主线。");
  const proposal = {
    summary: "这是不依赖 API 的模拟 AI 变更提案。",
    operations: [{
      op: "create_task",
      payload: {
        parentId: goalId,
        title: "检查本周计划并补充一个最小行动",
        type: "action",
        status: "todo",
        priority: 2,
        impact: 3,
        acceptance: "形成一条可执行行动并完成"
      },
      reason: "模拟 AI 提案流程"
    }]
  };
  renderProposalPreview(proposal);
}

function simulateScheduleRecognition() {
  // 模拟课表识别生成一条临时课程提案，不直接写入课表。
  const proposal = {
    summary: "这是不依赖视觉 API 的模拟课表识别结果。",
    operations: [{
      op: "create_schedule_item",
      payload: {
        dayOfWeek: plannerWeekdayNumber(),
        periodStart: 1,
        periodEnd: 2,
        title: "模拟识别课程",
        location: "模拟教室",
        source: "image"
      },
      reason: "模拟图片课表识别"
    }]
  };
  elements.scheduleDialog.close();
  renderProposalPreview(proposal);
  elements.proposalDialog.showModal();
}

function resetCourseForm() {
  // 新建课程默认落在当前时区星期和第一节。
  elements.scheduleCourseId.value = "";
  elements.scheduleDay.value = String(plannerWeekdayNumber());
  elements.scheduleTitle.value = "";
  elements.schedulePeriodStart.value = "1";
  elements.schedulePeriodEnd.value = "1";
  elements.scheduleLocation.value = "";
  elements.scheduleTeacher.value = "";
  elements.scheduleStartTime.value = "";
  elements.scheduleEndTime.value = "";
  elements.scheduleWeekRange.value = "";
}

function fillCourseForm(course) {
  // 编辑课程时回填全部字段，保留原始 ID 以便覆盖同一条记录。
  elements.scheduleCourseId.value = course.id;
  elements.scheduleDay.value = String(course.dayOfWeek);
  elements.scheduleTitle.value = course.title ?? "";
  elements.schedulePeriodStart.value = String(course.periodStart ?? 1);
  elements.schedulePeriodEnd.value = String(course.periodEnd ?? course.periodStart ?? 1);
  elements.scheduleLocation.value = course.location ?? "";
  elements.scheduleTeacher.value = course.teacher ?? "";
  elements.scheduleStartTime.value = course.startTime ?? "";
  elements.scheduleEndTime.value = course.endTime ?? "";
  elements.scheduleWeekRange.value = course.weekRange ?? "";
}

function renderScheduleList() {
  // 按周一至周日、开始节次排序，便于人工检查冲突。
  const dayNames = { 1: "周一", 2: "周二", 3: "周三", 4: "周四", 5: "周五", 6: "周六", 7: "周日" };
  const groups = [];
  for (let day = 1; day <= 7; day += 1) {
    const courses = scheduleCourses
      .filter((course) => course.dayOfWeek === day)
      .sort((a, b) => a.periodStart - b.periodStart);
    for (const course of courses) {
      groups.push(`
        <article class="proposal-item">
          <button class="task-open" type="button" data-course-id="${escapeHtml(course.id)}">
            <strong>${escapeHtml(dayNames[day])} · ${escapeHtml(course.title)}</strong>
            <span class="task-meta">${escapeHtml(courseTimeLabel(course))} · ${escapeHtml(course.location || "地点未设置")}</span>
          </button>
        </article>
      `);
    }
  }
  elements.scheduleList.innerHTML = groups.length
    ? groups.join("")
    : '<p class="task-meta">尚无课程，请手工填写或从图片、文本识别。</p>';
}

function openScheduleDialog() {
  // 打开课表管理时重置表单并刷新当前课程列表。
  resetCourseForm();
  renderScheduleList();
  elements.scheduleDialog.showModal();
}

async function saveCourseRecord() {
  // 先规范化和校验课程，再通过独立 schedule 仓库保存。
  const id = elements.scheduleCourseId.value || crypto.randomUUID();
  const periodStart = Number(elements.schedulePeriodStart.value || 1);
  const periodEnd = Number(elements.schedulePeriodEnd.value || periodStart);
  const existing = scheduleCourses.find((course) => course.id === id);
  const course = normalizeCourse({
    id,
    dayOfWeek: Number(elements.scheduleDay.value),
    periodStart,
    periodEnd,
    title: elements.scheduleTitle.value.trim(),
    location: elements.scheduleLocation.value.trim(),
    teacher: elements.scheduleTeacher.value.trim(),
    startTime: elements.scheduleStartTime.value.trim() || null,
    endTime: elements.scheduleEndTime.value.trim() || null,
    weekRange: elements.scheduleWeekRange.value.trim(),
    source: existing?.source ?? "manual",
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  const next = [...scheduleCourses.filter((item) => item.id !== id), course];
  scheduleCourses = await saveSchedule(db, next);
  resetCourseForm();
  renderScheduleList();
  render();
  toast("课程已保存。");
}

function editCourse(courseId) {
  // 点击课表项时进入编辑模式，不存在则明确报错。
  const course = scheduleCourses.find((item) => item.id === courseId);
  if (!course) throw new Error("课程不存在。");
  fillCourseForm(course);
  elements.scheduleDialog.showModal();
}

async function sourceTextContent(source) {
  // 优先读取已提取文档，其次读取非图片附件，图片交给视觉模型处理。
  const document = documents.find((item) => item.path.startsWith(`inbox/${source.id}-`));
  if (document) return document.content;
  const attachment = attachments.find((item) => item.path === source.path);
  if (attachment && !attachment.type.startsWith("image/")) {
    return attachment.blob.text();
  }
  return "";
}

function suggestSourceType(source, text) {
  // 这是低成本启发式分类，最终仍允许用户在弹窗中修改。
  if (source.type === "png" || source.type === "jpg" || source.type === "jpeg") return "schedule";
  if (/课表|课程|星期|周[一二三四五六日天]|第\s*\d+\s*节/.test(text)) return "schedule";
  if (/研究|查询|搜索|了解|调研|网址|资料/.test(text)) return "research";
  if (/是否|选择|决定|方案|比较/.test(text)) return "decision";
  return "task";
}

async function openProcessSource(sourceId) {
  // 处理资料时保存当前 source ID 和文本，防止弹窗关闭后上下文丢失。
  const source = state.sources.find((item) => item.id === sourceId);
  if (!source) throw new Error("收件箱资料不存在。");
  const text = await sourceTextContent(source);
  pendingSourceProcess = { sourceId, text };
  elements.processSourceTitle.textContent = `资料：${source.title}`;
  elements.processSourceType.value = suggestSourceType(source, text);
  elements.processSourceGoal.innerHTML = state.goals
    .map((goal) => `<option value="${escapeHtml(goal.id)}">${escapeHtml(goal.title)}</option>`)
    .join("");
  elements.processSourceDialog.showModal();
}

function parseSimpleScheduleText(text) {
  // 只处理“周一 1-2 课程名 地点”这类简单文本，复杂课表交给 AI。
  const dayMap = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
  const courses = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /周([一二三四五六日天])\s*(\d+)(?:\s*[-~至]\s*(\d+))?\s+(.+)/.exec(line.trim());
    if (!match) continue;
    const rest = match[4].trim();
    const parts = rest.split(/\s{2,}|\t+/).filter(Boolean);
    courses.push({
      dayOfWeek: dayMap[match[1]],
      periodStart: Number(match[2]),
      periodEnd: Number(match[3] ?? match[2]),
      title: parts[0] || `课程 ${courses.length + 1}`,
      location: parts[1] ?? "",
      source: "text"
    });
  }
  return courses;
}

function simulatedProposalForSource(type, source, text, goalId) {
  // 模拟处理只生成提案，不消耗 API，也不改变持久化数据。
  if (type === "schedule") {
    const parsed = parseSimpleScheduleText(text);
    const courses = parsed.length ? parsed : [{
      dayOfWeek: plannerWeekdayNumber(),
      periodStart: 1,
      periodEnd: 2,
      title: `模拟课程：${source.title}`,
      location: "模拟地点",
      source: "text"
    }];
    return {
      summary: "模拟课表处理结果，等待人工确认。",
      operations: courses.map((course) => ({
        op: "create_schedule_item",
        payload: course,
        reason: "收件箱模拟处理"
      }))
    };
  }
  if (type === "decision") {
    return {
      summary: "模拟决策处理结果，等待人工确认。",
      operations: [{
        op: "create_decision",
        payload: {
          parentId: goalId,
          title: `决策：${source.title}`,
          evidenceNeeded: ["人工补充判断依据"]
        },
        reason: "收件箱模拟处理"
      }]
    };
  }
  return {
    summary: "模拟任务处理结果，等待人工确认。",
    operations: [{
      op: "create_task",
      payload: {
        parentId: goalId,
        title: `处理：${source.title}`,
        type: "action",
        status: "todo",
        priority: 2,
        impact: 3,
        acceptance: "人工确认并补充完成标准"
      },
      reason: "收件箱模拟处理"
    }]
  };
}

async function processSource(simulate = false) {
  // 处理方式由用户选择；研究类型转入 Tavily 流程，其余生成变更提案。
  if (!pendingSourceProcess) return;
  const source = state.sources.find((item) => item.id === pendingSourceProcess.sourceId);
  if (!source) throw new Error("收件箱资料不存在。");
  const type = elements.processSourceType.value;
  const goalId = elements.processSourceGoal.value;
  const text = pendingSourceProcess.text;
  elements.processSourceDialog.close();

  if (type === "research") {
    await openResearchDialog();
    elements.researchQuery.value = source.title === "粘贴文本"
      ? text
      : `研究：${source.title}`;
    return;
  }

  if (simulate) {
    renderProposalPreview(simulatedProposalForSource(type, source, text, goalId));
    elements.proposalDialog.showModal();
    return;
  }

  const activeCredentials = requireCredentials();
  let proposal;
  if (type === "schedule") {
    const attachment = attachments.find((item) => item.path === source.path);
    if (attachment?.type?.startsWith("image/")) {
      proposal = await extractScheduleFromImage({
        credentials: activeCredentials,
        file: attachment.blob
      });
    } else {
      proposal = await extractScheduleFromText({
        credentials: activeCredentials,
        text
      });
    }
  } else {
    proposal = await generateChangeProposal({
      credentials: activeCredentials,
      state,
      prompt: [
        `请把以下收件箱资料处理为${type === "decision" ? "决策" : "任务"}。`,
        `关联主线 ID：${goalId}`,
        "只生成提案，等待人工确认。",
        text
      ].join("\n")
    });
  }
  renderProposalPreview(proposal);
  elements.proposalDialog.showModal();
}

async function scheduleProposalFromImageFile(file) {
  // 图片识别结果先关闭课表弹窗，再进入统一的提案确认界面。
  const activeCredentials = requireCredentials();
  const proposal = await extractScheduleFromImage({
    credentials: activeCredentials,
    file
  });
  elements.scheduleDialog.close();
  renderProposalPreview(proposal);
  elements.proposalDialog.showModal();
}

async function checkDataHealth() {
  // 健康检查读取原始数据，避免默认值掩盖真实结构问题。
  const raw = await loadRawDatasets(db);
  const reports = inspectStateHealth(raw, raw.schedule);
  dataHealthIssues = reports.filter((report) => !report.ok);
  elements.dataHealthReport.innerHTML = reports.map((report) => `
    <div class="${report.ok ? "healthy" : "unhealthy"}">
      ${escapeHtml(report.dataset)}：${escapeHtml(report.message)}
    </div>
  `).join("");
  toast(dataHealthIssues.length ? `发现 ${dataHealthIssues.length} 项数据异常。` : "数据健康度检查通过。");
}

async function runValidationSimulation() {
  // 模拟非法日期和倒置节次，验证写入层确实会拒绝。
  const invalidTask = {
    id: `INVALID-${crypto.randomUUID().slice(0, 6)}`,
    parentId: state.goals[0]?.id ?? "Q0",
    title: "Zod 模拟错误记录",
    type: "action",
    status: "todo",
    priority: 2,
    impact: 3,
    dueAt: "明天",
    acceptance: "不应写入",
    tags: [],
    sourceIds: []
  };
  let taskBlocked = false;
  let scheduleBlocked = false;
  let taskMessage = "";
  let scheduleMessage = "";
  try {
    await replaceState(db, normalizeState({
      ...state,
      tasks: [...state.tasks, invalidTask],
      schedule: scheduleCourses
    }));
  } catch (error) {
    taskBlocked = true;
    taskMessage = error.message;
  }
  try {
    await saveSchedule(db, [{
      id: "INVALID-COURSE",
      dayOfWeek: 1,
      periodStart: 3,
      periodEnd: 1,
      title: "错误课表记录",
      source: "manual"
    }]);
  } catch (error) {
    scheduleBlocked = true;
    scheduleMessage = error.message;
  }
  elements.dataHealthReport.innerHTML = `
    <div class="${taskBlocked ? "healthy" : "unhealthy"}">
      task 日期“明天”拦截：${taskBlocked ? "通过" : "失败"}。${escapeHtml(taskMessage)}
    </div>
    <div class="${scheduleBlocked ? "healthy" : "unhealthy"}">
      schedule 节次倒置拦截：${scheduleBlocked ? "通过" : "失败"}。${escapeHtml(scheduleMessage)}
    </div>
  `;
  toast(taskBlocked && scheduleBlocked ? "Zod 拦截模拟通过，错误数据未写入。" : "模拟失败，请检查控制台。");
}

function renderGoalsList() {
  // 主线列表支持改名、权重调整、排序和删除。
  elements.goalsList.innerHTML = state.goals.map((goal, index) => `
    <div class="goal-row">
      <input type="text" value="${escapeHtml(goal.title)}" data-goal-title="${escapeHtml(goal.id)}">
      <input type="text" value="${escapeHtml(goal.weight)}" data-goal-weight="${escapeHtml(goal.id)}">
      <div class="goal-row-actions">
        <button type="button" class="secondary" data-save-goal="${escapeHtml(goal.id)}">保存</button>
        <button type="button" class="secondary" data-move-goal="${escapeHtml(goal.id)}" data-direction="-1" ${index === 0 ? "disabled" : ""}>上移</button>
        <button type="button" class="secondary" data-move-goal="${escapeHtml(goal.id)}" data-direction="1" ${index === state.goals.length - 1 ? "disabled" : ""}>下移</button>
        <button type="button" class="danger" data-delete-goal="${escapeHtml(goal.id)}">删除</button>
      </div>
    </div>
  `).join("");
}

function openGoalsDialog() {
  // 新建主线默认使用 Q 前缀和权重 5，用户可覆盖。
  elements.goalNewTitle.value = "";
  elements.goalNewWeight.value = "5";
  elements.goalNewPrefix.value = "Q";
  renderGoalsList();
  elements.goalsDialog.showModal();
}

async function persistGoals(nextGoals, nextTasks = state.tasks, nextDecisions = state.decisions) {
  // 三条主线相关数据集一起规范化并原子替换，避免删除后留下悬空引用。
  state = normalizeState({
    ...state,
    goals: nextGoals,
    tasks: nextTasks,
    decisions: nextDecisions,
    schedule: scheduleCourses
  });
  await replaceState(db, state);
  render();
  renderGoalsList();
}

async function addGoal() {
  // 前缀由用户输入，完整 ID 自动取同前缀最大编号加一。
  const title = elements.goalNewTitle.value.trim();
  const weight = Number(elements.goalNewWeight.value);
  const prefix = elements.goalNewPrefix.value.trim() || "Q";
  if (!title) throw new Error("请输入主线名称。");
  if (!/^[A-Za-z0-9_-]{1,16}$/.test(prefix)) {
    throw new Error("主线 ID 前缀只能包含字母、数字、下划线和连字符，最多 16 位。");
  }
  if (!Number.isInteger(weight) || weight < 1 || weight > 10) {
    throw new Error("战略权重必须是 1-10 的整数。");
  }
  const id = resolveGoalId(state.goals, prefix);
  const nextGoals = [...state.goals, {
    id,
    title,
    description: "",
    weight,
    status: "active",
    schemaVersion: 1
  }];
  await persistGoals(nextGoals);
  elements.goalNewTitle.value = "";
  toast("主线已新建。");
}

async function saveGoal(goalId) {
  // 修改名称和权重时按 ID 定位对应输入框。
  const titleInput = elements.goalsList.querySelector(`[data-goal-title="${CSS.escape(goalId)}"]`);
  const weightInput = elements.goalsList.querySelector(`[data-goal-weight="${CSS.escape(goalId)}"]`);
  const weight = Number(weightInput?.value);
  if (!titleInput?.value.trim()) throw new Error("主线名称不能为空。");
  if (!Number.isInteger(weight) || weight < 1 || weight > 10) {
    throw new Error("战略权重必须是 1-10 的整数。");
  }
  const nextGoals = state.goals.map((goal) => goal.id === goalId
    ? { ...goal, title: titleInput.value.trim(), weight }
    : goal);
  await persistGoals(nextGoals);
  toast("主线已保存。");
}

async function moveGoal(goalId, direction) {
  // 通过交换数组位置调整主线顺序，越界时静默忽略。
  const index = state.goals.findIndex((goal) => goal.id === goalId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= state.goals.length) return;
  const nextGoals = [...state.goals];
  [nextGoals[index], nextGoals[target]] = [nextGoals[target], nextGoals[index]];
  await persistGoals(nextGoals);
}

function requestDeleteGoal(goalId) {
  // 删除主线前必须处理其下任务和决策，不能让活动记录失去归属。
  const goal = state.goals.find((item) => item.id === goalId);
  if (!goal) throw new Error("主线不存在。");
  const tasks = state.tasks.filter((task) => task.parentId === goalId);
  const decisions = state.decisions.filter((decision) => decision.parentId === goalId);
  if (!tasks.length && !decisions.length) {
    if (!window.confirm(`确定删除主线“${goal.title}”吗？`)) return;
    persistGoals(state.goals.filter((item) => item.id !== goalId)).catch(handleError);
    return;
  }
  pendingGoalDelete = goalId;
  const alternatives = state.goals.filter((item) => item.id !== goalId);
  elements.deleteGoalMessage.textContent = `主线“${goal.title}”下有 ${tasks.length} 个任务、${decisions.length} 个决策。请选择转移或一并删除。`;
  elements.deleteGoalTransferTarget.innerHTML = alternatives
    .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title)}</option>`)
    .join("");
  elements.deleteGoalTransfer.disabled = alternatives.length === 0;
  elements.deleteGoalDialog.showModal();
}

async function confirmDeleteGoal(mode) {
  // transfer 将任务和决策转到另一条主线；cascade 一并删除。
  if (!pendingGoalDelete) return;
  const goalId = pendingGoalDelete;
  const targetId = elements.deleteGoalTransferTarget.value;
  const nextGoals = state.goals.filter((goal) => goal.id !== goalId);
  let nextTasks = state.tasks;
  let nextDecisions = state.decisions;
  if (mode === "transfer") {
    if (!targetId) throw new Error("请先新建或保留另一条主线用于转移。");
    nextTasks = state.tasks.map((task) => task.parentId === goalId ? { ...task, parentId: targetId } : task);
    nextDecisions = state.decisions.map((decision) => decision.parentId === goalId ? { ...decision, parentId: targetId } : decision);
  } else {
    nextTasks = state.tasks.filter((task) => task.parentId !== goalId);
    nextDecisions = state.decisions.filter((decision) => decision.parentId !== goalId);
  }
  await persistGoals(nextGoals, nextTasks, nextDecisions);
  pendingGoalDelete = null;
  elements.deleteGoalDialog.close();
  toast(mode === "transfer" ? "任务已转移，主线已删除。" : "主线及所属任务已删除。");
}

function bind() {
  // 事件绑定只负责把事件路由到业务函数，业务错误统一交给 handleError。
  elements.briefButton.addEventListener("click", () => showBrief().catch(handleError));
  elements.generateBrief.addEventListener("click", () => generateSelectedBrief());
  elements.backupButton.addEventListener("click", () => backup().catch(handleError));
  elements.restoreButton.addEventListener("click", () => elements.backupFile.click());
  elements.chatboxButton.addEventListener("click", () => elements.chatboxFile.click());
  elements.inboxButton.addEventListener("click", () => openInbox().catch(handleError));
  elements.goalsButton.addEventListener("click", () => openGoalsDialog());
  elements.scheduleButton.addEventListener("click", () => openScheduleDialog());
  elements.radarButton.addEventListener("click", () => {
    elements.radarList.closest(".panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  elements.liftButton.addEventListener("click", () => openLiftCalendar());
  elements.aiSettingsButton.addEventListener("click", () => openAISettings().catch(handleError));
  elements.aiProposalButton.addEventListener("click", () => openProposalDialog().catch(handleError));
  elements.researchButton.addEventListener("click", () => openResearchDialog().catch(handleError));
  elements.auditButton.addEventListener("click", () => openAuditReport());
  elements.clearButton.addEventListener("click", () => clearAll().catch(handleError));
  elements.copyBrief.addEventListener("click", async () => {
    await navigator.clipboard.writeText(elements.briefText.value);
    toast("简报已复制。");
  });
  elements.confirmImport.addEventListener("click", () => confirmImport().catch(handleError));
  elements.extractSession.addEventListener("click", () => extractSelectedChatbox().catch(handleError));
  elements.saveExtraction.addEventListener("click", () => saveChatboxExtraction().catch(handleError));
  elements.generateChatboxProposal.addEventListener("click", () => generateProposalFromChatbox().catch(handleError));
  elements.simulateChatboxProposal.addEventListener("click", () => simulateChatboxProposal());
  elements.chooseInboxFile.addEventListener("click", () => elements.inboxFile.click());
  elements.addInboxText.addEventListener("click", () => ingestInboxText().catch(handleError));
  elements.processSourceButton.addEventListener("click", () => processSource(false).catch(handleError));
  elements.simulateSourceButton.addEventListener("click", () => processSource(true).catch(handleError));
  elements.saveTaskDetail.addEventListener("click", () => saveTaskDetail().catch(handleError));
  elements.saveCourse.addEventListener("click", () => saveCourseRecord().catch(handleError));
  elements.resetCourseForm.addEventListener("click", () => resetCourseForm());
  elements.chooseScheduleImage.addEventListener("click", () => elements.scheduleImageFile.click());
  elements.simulateScheduleRecognition.addEventListener("click", () => simulateScheduleRecognition());
  elements.saveAiSettings.addEventListener("click", () => saveAISettings().catch(handleError));
  elements.unlockAiSettings.addEventListener("click", () => unlockAISettings().catch(handleError));
  elements.lockAiSettings.addEventListener("click", () => lockAISettings().catch(handleError));
  elements.dataHealthButton.addEventListener("click", () => checkDataHealth().catch(handleError));
  elements.validationSimulationButton.addEventListener("click", () => runValidationSimulation().catch(handleError));
  elements.addGoalButton.addEventListener("click", () => addGoal().catch(handleError));
  elements.deleteGoalTransfer.addEventListener("click", () => confirmDeleteGoal("transfer").catch(handleError));
  elements.deleteGoalCascade.addEventListener("click", () => confirmDeleteGoal("cascade").catch(handleError));
  elements.generateProposal.addEventListener("click", () => generateProposal().catch(handleError));
  elements.simulateAiProposal.addEventListener("click", () => simulateAIProposal());
  elements.applyProposal.addEventListener("click", () => applyProposalSelection().catch(handleError));
  elements.runResearch.addEventListener("click", () => runResearch().catch(handleError));
  elements.simulateResearch.addEventListener("click", () => simulateResearch());
  elements.saveResearch.addEventListener("click", () => saveResearchRecord().catch(handleError));
  elements.backupFile.addEventListener("change", async () => {
    const file = elements.backupFile.files?.[0];
    elements.backupFile.value = "";
    if (file) await prepareImport(file).catch(handleError);
  });
  elements.chatboxFile.addEventListener("change", async () => {
    const file = elements.chatboxFile.files?.[0];
    if (!file) return;
    await prepareChatbox(file).catch(handleError);
  });
  elements.inboxFile.addEventListener("change", async () => {
    const files = elements.inboxFile.files;
    elements.inboxFile.value = "";
    if (files?.length) await ingestInboxFiles(files).catch(handleError);
  });
  elements.scheduleImageFile.addEventListener("change", async () => {
    const file = elements.scheduleImageFile.files?.[0];
    elements.scheduleImageFile.value = "";
    if (file) await scheduleProposalFromImageFile(file).catch(handleError);
  });
  document.addEventListener("click", (event) => {
    const taskTarget = event.target.closest("[data-task-id]");
    if (taskTarget) {
      try {
        openTaskDialog(taskTarget.dataset.taskId);
      } catch (error) {
        handleError(error);
      }
      return;
    }
    const sourceTarget = event.target.closest("[data-open-source]");
    if (sourceTarget) {
      try {
        openSourceAttachment(sourceTarget.dataset.openSource);
      } catch (error) {
        handleError(error);
      }
      return;
    }
    const processSourceTarget = event.target.closest("[data-process-source]");
    if (processSourceTarget) {
      openProcessSource(processSourceTarget.dataset.processSource).catch(handleError);
      return;
    }
    const courseTarget = event.target.closest("[data-course-id]");
    if (courseTarget) {
      try {
        editCourse(courseTarget.dataset.courseId);
      } catch (error) {
        handleError(error);
      }
      return;
    }
    const saveGoalTarget = event.target.closest("[data-save-goal]");
    if (saveGoalTarget) {
      saveGoal(saveGoalTarget.dataset.saveGoal).catch(handleError);
      return;
    }
    const moveGoalTarget = event.target.closest("[data-move-goal]");
    if (moveGoalTarget) {
      moveGoal(moveGoalTarget.dataset.moveGoal, Number(moveGoalTarget.dataset.direction)).catch(handleError);
      return;
    }
    const deleteGoalTarget = event.target.closest("[data-delete-goal]");
    if (deleteGoalTarget) {
      try {
        requestDeleteGoal(deleteGoalTarget.dataset.deleteGoal);
      } catch (error) {
        handleError(error);
      }
    }
  });
}

function handleError(error) {
  // 错误提示进入界面前统一屏蔽常见密钥形态，防止日志和屏幕泄露。
  const message = String(error?.message || error || "发生未知错误")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[已隐藏]")
    .replace(/tvly-[A-Za-z0-9_-]+/g, "[已隐藏]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [已隐藏]");
  elements.globalErrorMessage.textContent = message;
  elements.globalErrorBanner.hidden = false;
  toast(message);
}

async function init() {
  // 初始化顺序：绑定 UI -> 打开数据库 -> 读取/校验数据 -> 刷新 AI 状态 -> 渲染。
  bind();
  db = await openDatabase();
  state = await loadState(db);
  documents = await loadDocuments(db);
  attachments = await loadAttachments(db);
  const raw = await loadRawDatasets(db);
  const validation = validateState(raw);
  state = normalizeState(validation.data);
  scheduleCourses = validation.data.schedule ?? [];
  dataHealthIssues = inspectStateHealth(raw, raw.schedule).filter((report) => !report.ok);
  await updateAIStatus();
  await renderSnapshotStatus();
  render();
}

elements.dismissGlobalError.addEventListener("click", () => {
  // 关闭错误横幅只隐藏提示，不改变当前数据状态。
  elements.globalErrorBanner.hidden = true;
});
window.addEventListener("error", (event) => handleError(event.error || event.message));
window.addEventListener("unhandledrejection", (event) => handleError(event.reason));
if ("serviceWorker" in navigator) {
  // Service Worker 注册失败只影响离线能力，不阻塞应用使用。
  navigator.serviceWorker.register("./sw.js").catch(() => {
    toast("离线缓存未启用，不影响在线使用。");
  });
}

init().catch(handleError);
