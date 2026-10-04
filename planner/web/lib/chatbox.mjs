import { decodeText, encodeText, readZip, writeZip } from "./zip.mjs";

const REQUIREMENT_KEYWORDS = /需要|要求|希望|必须|不要|不能|应该|可以|记得|以后|建立|实现|接入|升级|数据|记忆|上下文|token|清单|日程|档案|提醒|调出|任务|架构|联网|搜索|自动|chatbox|codex|app|api/i;
const ARCHITECTURE_TERMS = [
  "整体架构",
  "逻辑架构",
  "六步流水线",
  "五条逻辑链",
  "任务树",
  "抬升日",
  "抬升链",
  "巡检链",
  "误差层",
  "宪法",
  "协作层",
  "档案主导",
  "外部记忆",
  "调出词",
  "P1",
  "L2",
  "L3",
  "L4"
];

function parseJson(data, label) {
  try {
    return JSON.parse(decodeText(data));
  } catch {
    throw new Error(`${label} 不是有效 JSON。`);
  }
}

function visibleText(message) {
  return (message.contentParts ?? [])
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

function isArchitectureMessage(text) {
  const headingMatch = /^#{1,4}.*(整体架构|逻辑架构|系统架构|架构全景|六步流水线|五条逻辑链|抬升引擎|误差层|宪法|协作层|调出词)/m.test(text);
  const score = ARCHITECTURE_TERMS.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0);
  return headingMatch || score >= 2;
}

export async function inspectChatboxZip(source) {
  const entries = await readZip(source, {
    include: (name) => name === "manifest.json"
  });
  const manifestData = entries.get("manifest.json");
  if (!manifestData) throw new Error("ZIP 中缺少 manifest.json。");
  const manifest = parseJson(manifestData, "manifest.json");
  if (manifest.format !== "chatbox-backup") {
    throw new Error("这不是 Chatbox 备份包。");
  }
  return {
    format: manifest.format,
    formatVersion: manifest.formatVersion,
    exportedAt: manifest.exportedAt,
    sessions: (manifest.sessions ?? []).map((session) => ({
      id: session.id,
      path: session.path,
      name: session.meta?.name ?? session.id,
      createdAt: session.meta?.createdAt ?? null
    }))
  };
}

export async function extractChatboxSession(source, sessionPath) {
  const entries = await readZip(source, {
    include: (name) => name === sessionPath
  });
  const sessionData = entries.get(sessionPath);
  if (!sessionData) throw new Error(`未找到会话文件：${sessionPath}`);
  const session = parseJson(sessionData, sessionPath);
  return buildExtraction(session, session.name ?? sessionPath);
}

function buildExtraction(session, fallbackName) {
  const messages = Array.isArray(session.messages) ? session.messages : [];
  const requirements = [];
  const architecture = [];

  messages.forEach((message, index) => {
    const text = visibleText(message);
    if (!text) return;
    if (message.role === "user" && REQUIREMENT_KEYWORDS.test(text)) {
      requirements.push({
        messageNumber: index + 1,
        text
      });
    }
    if (message.role === "assistant" && isArchitectureMessage(text)) {
      architecture.push({
        messageNumber: index + 1,
        text
      });
    }
  });

  const header = `# Chatbox 临时提取\n\n- 会话：${session.name ?? sessionPath}\n- 提取时间：${new Date().toISOString()}\n- 原文状态：未保存\n`;
  const requirementsMarkdown = [
    header,
    "## 历史诉求",
    ...requirements.flatMap((item) => [
      `### 消息 ${item.messageNumber}`,
      item.text,
      ""
    ])
  ].join("\n");
  const architectureMarkdown = [
    header,
    "## 架构与思维框架",
    ...architecture.flatMap((item) => [
      `### 消息 ${item.messageNumber}`,
      item.text,
      ""
    ])
  ].join("\n");

  return {
    session: {
      id: session.id,
      name: session.name ?? fallbackName,
      messageCount: messages.length
    },
    documents: [
      { path: "memory/requirements.md", content: requirementsMarkdown },
      { path: "memory/architecture.md", content: architectureMarkdown }
    ],
    counts: {
      requirements: requirements.length,
      architecture: architecture.length
    }
  };
}

export async function inspectChatboxJson(file) {
  const parsed = JSON.parse(await file.text());
  const session = Array.isArray(parsed) ? parsed[0] : (parsed.session ?? parsed);
  if (!session || !Array.isArray(session.messages)) {
    throw new Error("JSON 中未找到 messages 数组。");
  }
  return {
    format: "chatbox-json",
    formatVersion: 1,
    exportedAt: null,
    sessions: [{
      id: session.id ?? "json-session",
      path: "json-session",
      name: session.name ?? file.name,
      createdAt: null
    }]
  };
}

export async function extractChatboxJson(file) {
  const parsed = JSON.parse(await file.text());
  const session = Array.isArray(parsed) ? parsed[0] : (parsed.session ?? parsed);
  if (!session || !Array.isArray(session.messages)) {
    throw new Error("JSON 中未找到 messages 数组。");
  }
  return buildExtraction(session, file.name);
}

export async function createChatboxFixtureZip() {
  return writeZip([
    {
      name: "manifest.json",
      data: encodeText(JSON.stringify({
        format: "chatbox-backup",
        formatVersion: 2,
        sessions: [
          { id: "selected", path: "sessions/selected/session.json", meta: { name: "目标会话" } },
          { id: "ignored", path: "sessions/ignored/session.json", meta: { name: "其他会话" } }
        ]
      }))
    },
    {
      name: "sessions/selected/session.json",
      data: encodeText(JSON.stringify({
        id: "selected",
        name: "目标会话",
        messages: [
          { role: "user", contentParts: [{ type: "text", text: "需要建立外部记忆库并精简上下文。" }] },
          { role: "assistant", contentParts: [{ type: "reasoning", text: "private" }, { type: "text", text: "整体架构包含任务树、抬升链和巡检链。" }] }
        ]
      }))
    },
    {
      name: "sessions/ignored/session.json",
      data: encodeText("not valid json and must remain unread")
    }
  ], { compress: true });
}
