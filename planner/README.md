# Student Planner OS v0.1

一个脱离 Chatbox 对话记录的本地任务系统。数据存放在 JSON 文件中，命令行负责归档、排序、研究包生成和短上下文输出。

## 核心能力

- 资料入口：聊天记录、文本、JSON 和图片先进入 `sources.json`。
- 任务分级：目标 Q0-Q5 -> 项目/里程碑 -> 行动/决策/习惯。
- 动态排序：按战略权重、优先级、截止时间、影响力和阻塞状态计算。
- 数据兼容：旧 JSON 可直接读取，新增字段均为可选并有版本化默认值。
- 清单联动：上级目标或项目的状态变化会暴露受影响的下级任务。
- 联网研究：抓取网页并生成带来源、访问时间和后续问题的研究包。
- 压缩上下文：只输出当前状态、前三项任务、风险和待补信息。
- 独立存储：不依赖 Chatbox 会话历史，任何支持读取文件或执行命令的客户端都能接入。

## 快速开始

如果不想使用命令行，直接双击：

`planner/start-planner.bat`

浏览器验证页会打开在：

`http://localhost:4173/web/`

`http://localhost:4173/` 会自动跳转到 `/web/`。

AI 与 Tavily 配置入口在页面中的“AI 与搜索设置”。API Key 必须由用户在页面中手动填写，并使用本地口令加密保存。项目代码、日志和备份包均不包含 Key。

模块 4 已增加收件箱、抬升日历、任务详情编辑、带系统指令前缀的纯文本简报，以及 Chatbox ZIP/JSON 到 ChangeProposal 的人工确认流程。

模块 4.5 增加 Chatbox 系统指令前缀、Zod 写入校验、数据健康度检查、本地自动快照字段，以及独立 `schedule` 课表模块。

模块 4.7 增加可自定义主线 ID、A/B/C/D 简报、规则体检报告、收件箱处理窗口、独立研究流程、Tavily 额度提醒和无 API 模拟入口。

浏览器数据保存在 IndexedDB，不会自动写入 `planner/data/*.json`。

```powershell
cd D:\studentwork\planner
node bin/planner.mjs render
node bin/planner.mjs today
node bin/planner.mjs radar
node bin/planner.mjs brief --mode chat
npm test
```

## 常用命令

```powershell
# 添加任务
node bin/planner.mjs add-task --title "完成高数第一章" --parent Q1 --priority 1 --due 2026-10-03 --estimate 120 --impact 5 --acceptance "作业可提交且错题已整理"

# 自定义抬升前置期
node bin/planner.mjs update T-001 --preparation 10

# 更新状态
node bin/planner.mjs update T-001 --status in_progress
node bin/planner.mjs done T-001

# 注册一份聊天记录或图片
node bin/planner.mjs ingest "D:\path\chat.json" --type chat --title "学习与未来"
node bin/planner.mjs ingest "D:\path\schedule.jpg" --type image --title "新课表"

# 导入由 Codex/视觉模型整理出的结构化结果
node bin/planner.mjs import-extraction "D:\path\extraction.json"

# 联网抓取研究材料
node bin/planner.mjs research --task T-005 --url "https://example.com" --question "报名流程是什么？"

# 问题检查
node bin/planner.mjs issues

# 查看任务树，并标记整棵子树待重规划
node bin/planner.mjs tree
node bin/planner.mjs replan T-003 --reason "上级截止时间提前"
```

## 目录

```text
planner/
├─ bin/planner.mjs
├─ data/
│  ├─ config.json
│  ├─ goals.json
│  ├─ tasks.json
│  ├─ sources.json
│  └─ decisions.json
├─ generated/
│  ├─ CURRENT_STATE.md
│  ├─ TODAY.md
│  ├─ RADAR.md
│  └─ CHATBOX_BRIEF.md
└─ src/
```

## 接入方式

- **Codex**：工作区根目录的 `AGENTS.md` 已约定自动读取和更新本系统。
- **Chatbox**：把 `generated/CHATBOX_BRIEF.md` 粘贴到新会话开头即可恢复核心上下文。
- **其他客户端**：直接读写 JSON，或执行 CLI 命令。
- **定时任务**：后续可交给 Windows Task Scheduler 每天运行 `render` 和 `radar`。

## 设计边界

- CLI 负责确定性任务管理，不假装完成语义理解。
- 聊天、图片和网页的语义提取由具备视觉/语言能力的模型完成，再导入结构化的 `extraction.json`。
- 所有联网结论必须带 URL、访问时间和下一次复核日期。
- 默认不接入任何模型 API，也不保存 API Key。

## 数据版本

- 当前 schema 版本：`v1`。
- 旧字段不改名、不删除、不改变类型。
- 新字段必须为可选字段，并在 `schema/data-v1.md` 记录默认值。
- 读取旧文件时仅在内存中补默认值，不自动改写文件。

## 资料处理约定

1. 先执行 `ingest`，得到来源 ID。
2. 阅读资料，图片使用视觉能力，聊天和文档使用文本解析能力。
3. 按 `examples/extraction.example.json` 生成结构化结果。
4. 执行 `import-extraction`，系统会自动创建任务和决策记录。
5. 执行 `render`，更新今日、雷达和 Chatbox 简报。

来源原件路径、内容哈希和处理状态都会保留，因此同一资料重复导入时不会再次创建。
