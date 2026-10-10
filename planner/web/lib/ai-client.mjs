// OpenAI 兼容客户端：负责解析模型返回的 JSON，并把状态压缩成上下文。
function stripCodeFence(text) {
  // 兼容部分网关在 JSON 外包一层 Markdown 代码围栏。
  return String(text)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
}

function parseProposal(content) {
  // 只接受包含 operations 数组的提案，后续仍由本地预演层二次校验。
  const text = stripCodeFence(content);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI 未返回有效 JSON 提案。");
  let parsed;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("AI 返回的提案 JSON 无法解析。");
  }
  if (!Array.isArray(parsed.operations)) throw new Error("AI 提案缺少 operations 数组。");
  return {
    summary: String(parsed.summary ?? ""),
    operations: parsed.operations
  };
}

function parseJsonObject(content, label) {
  const text = stripCodeFence(content);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`${label} 未返回有效 JSON。`);
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error(`${label} 返回的 JSON 无法解析。`);
  }
}

async function requestChatCompletion(options) {
  // 所有 AI 请求共用 30 秒超时和统一错误信息，避免各页面重复处理。
  const {
    credentials,
    messages,
    fetchImpl = fetch
  } = options;
  const baseURL = credentials.baseURL.replace(/\/+$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let response;
  try {
    response = await fetchImpl(`${baseURL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${credentials.apiKey}`
      },
      body: JSON.stringify({
        model: credentials.model,
        temperature: 0.1,
        messages
      })
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("AI 请求超时，请检查网络或更换兼容网关。");
    }
    throw new Error("AI 网络连接失败，请检查 baseURL、网络和 API 配置。");
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`AI 请求失败：HTTP ${response.status}`);
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("AI 响应缺少 message.content。");
  return content;
}

export function buildCompactContext(state, prompt = "") {
  // 先保留 P0/P1，再补 90 天内任务，最多发送 100 条，控制上下文体积。
  const now = Date.now();
  const horizon = now + 90 * 86_400_000;
  const tasks = state.tasks
    .filter((task) => !["done", "cancelled"].includes(task.status))
    .filter((task) => {
      if (task.priority === 0 || task.priority === 1) return true;
      const date = new Date(task.raiseAt || task.dueAt || "9999-12-31").getTime();
      return Number.isFinite(date) && date <= horizon;
    })
    .slice(0, 100)
    .map((task) => ({
      id: task.id,
      parentId: task.parentId,
      parentTaskId: task.parentTaskId,
      title: task.title,
      type: task.type,
      status: task.status,
      priority: task.priority,
      impact: task.impact,
      dueAt: task.dueAt,
      reviewAt: task.reviewAt,
      raiseAt: task.raiseAt,
      estimateMin: task.estimateMin,
      acceptance: task.acceptance,
      unblockCondition: task.unblockCondition
    }));

  return {
    prompt,
    goals: state.goals,
    tasks,
    decisions: state.decisions.filter((decision) => decision.status === "open"),
    filteredBy: "Q + type + time",
    horizonDays: 90
  };
}

export async function generateChangeProposal(options) {
  // 系统提示明确限制模型只能提出变更，不能声称已经修改数据。
  const {
    credentials,
    state,
    prompt,
    fetchImpl = fetch
  } = options;
  const context = buildCompactContext(state, prompt);
  const content = await requestChatCompletion({
    credentials,
    fetchImpl,
    messages: [
        {
          role: "system",
          content: [
            "你是 Student Planner OS 的规划分析器。",
            "只输出 JSON，不直接声称已经修改数据。",
            "operations 只能使用 create_task、update_task、set_task_status、archive_task、create_decision。",
            "每个 operation 必须给出 reason。",
            "新任务必须挂到 context.goals 中已有的主线 ID，并带 title、type、priority、impact、acceptance。"
          ].join("\n")
        },
        {
          role: "user",
          content: JSON.stringify({
            instruction: prompt || "检查当前任务结构，提出最小必要的改进提案。",
            outputSchema: {
              summary: "string",
              operations: [
                {
                  op: "create_task",
                  payload: {},
                  reason: "string"
                }
              ]
            },
            context
          })
        }
      ]
  });
  return parseProposal(content);
}

function schedulePrompt() {
  // 课表提取使用固定 JSON 结构，无法确认的时间填 null，禁止编造。
  return [
    "请从输入中提取大学课表，只输出 JSON。",
    "结构：{\"courses\":[{\"dayOfWeek\":1,\"periodStart\":1,\"periodEnd\":2,\"title\":\"课程名\",\"location\":\"地点\",\"startTime\":null,\"endTime\":null,\"teacher\":\"\",\"weekRange\":\"\"}]}。",
    "dayOfWeek：周一=1，周日=7。",
    "无法确定的开始或结束时间使用 null。不要编造未出现的信息。"
  ].join("\n");
}

function scheduleProposalFromCourses(courses, reason, source) {
  // 将课表解析结果转换为统一变更提案，交由人工确认后写入。
  if (!Array.isArray(courses) || !courses.length) throw new Error("未识别到课程结构。");
  return {
    summary: `识别到 ${courses.length} 门课程，等待人工确认。`,
    operations: courses.map((course) => ({
      op: "create_schedule_item",
      payload: { ...course, source },
      reason
    }))
  };
}

export async function extractScheduleFromText(options) {
  // 文本识别与图片识别共用结构校验和提案生成逻辑。
  const {
    credentials,
    text,
    fetchImpl = fetch
  } = options;
  const content = await requestChatCompletion({
    credentials,
    fetchImpl,
    messages: [
      { role: "system", content: schedulePrompt() },
      { role: "user", content: String(text) }
    ]
  });
  const parsed = parseJsonObject(content, "课表文本提取");
  return scheduleProposalFromCourses(parsed.courses, "由文本课表提取", "text");
}

export async function extractScheduleFromImage(options) {
  // 图片先转 Data URL，再作为 OpenAI 兼容的 image_url 内容发送。
  const {
    credentials,
    file,
    fetchImpl = fetch
  } = options;
  const dataURL = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("无法读取课表图片。"));
    reader.readAsDataURL(file);
  });
  const content = await requestChatCompletion({
    credentials,
    fetchImpl,
    messages: [
      { role: "system", content: schedulePrompt() },
      {
        role: "user",
        content: [
          { type: "text", text: "识别这张课表图片。" },
          { type: "image_url", image_url: { url: dataURL } }
        ]
      }
    ]
  });
  const parsed = parseJsonObject(content, "课表图片识别");
  return scheduleProposalFromCourses(parsed.courses, "由图片课表识别", "image");
}
