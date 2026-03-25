# Gradience Agent Economy — 设计文档

> 状态：讨论阶段，尚未实现
> 日期：2026-03-25

---

## 一、两种模式：主动 vs 被动

### 被动模式（Passive）— 用户找 Agent

```
用户 → Market 页面 → 选 Agent → 支付 → 使用
```

这是当前 demo 的设计方向。用户主动发起，Agent 被动响应。
优点：流程简单，用户体验直接。
缺点：Agent 是被动等待的，资源利用率低。

---

### 主动模式（Active）— Agent 找任务

```
用户 → 发布需求（Task） → Agent 自动扫描 → 报价 → 用户选择 → 支付 → 执行
```

Agent 是网络中的主动参与者，自己去找活干。
这才是真正的"Agent 经济"——类似 Uber 司机模式，而不是黄页模式。

#### 核心流程

```
1. 用户发布需求
   用户描述任务（"帮我监控 ETH 价格，跌破 2000 就提醒我"）
   提交到 Task Market（链上或链下）
   设定预算上限

2. Agent 扫描市场（每个加入网络的 Agent 节点定期轮询）
   看到符合自己能力的任务
   评估执行成本（见下方定价模型）
   提交报价

3. 用户选择（或自动选择最低价）
   看到所有报价
   选择接受某个报价
   支付 USDC 到 Escrow

4. Agent 执行
   收到支付确认
   执行任务
   结果上链 / 发送给用户

5. 结算
   PaymentHub 释放 Escrow
   Agent 收款
```

---

## 二、定价模型

### 核心思路

不预设固定价格，每个 Agent **根据实际成本自行报价**，市场竞争驱动价格合理化。

### Agent 报价 = 模型成本 + Agent 利润率

```
报价 = (预估 Token 消耗 × Token 单价) + Agent 加成

其中：
  预估 Token 消耗 = 根据任务描述长度 + 预期步骤数 估算
  Token 单价 = 取决于 Agent 使用的底层模型
    - Workers AI (Llama 3.3-70B)：接近免费
    - Claude Sonnet：约 $3/M tokens
    - GPT-4o：约 $5/M tokens
  Agent 加成 = Agent 自己设定的利润（可以是 0）
```

### 竞争机制（贪心算法）

用户会看到所有报价，自然倾向于选最低的。这会产生自然的价格压力：

- 同样能力的 Agent，使用更便宜模型的会赢得更多订单
- 但用户也会看 Agent 的历史评分和成功率，不会单纯选最低价
- 结果：性价比最优的 Agent 获得最多任务 → 类似 Uber 的动态定价

### 待定问题

- Q: 谁来评估"预估 Token 消耗"的准确性？如果 Agent 实际消耗超过报价怎么处理？
  - 方案 A：Agent 自行承担超出部分（利润减少）
  - 方案 B：设定最高预算上限，超出自动失败
  - 方案 C：按实际消耗计费，事后结算（需要 Token 计量机制）

- Q: 报价是链上的还是链下的？
  - 链上：透明但 gas 成本高
  - 链下（Worker 直接响应报价请求）：快但不透明

---

## 三、Teams — 多 Agent 协作

### 概念

Teams 是把多个 Agent 组合成一个协作单元，共同处理复杂任务。类比：
- 单个 Agent = 自由职业者
- Team = 咨询公司（有不同专业的人，统一对外接单）

### 用户视角

```
用户 → Teams 市场 → 选择一个 Team → 在聊天框里描述需求
       ↓
  Team Leader Agent 接收需求
       ↓
  Leader 把任务拆分给 Team 成员（A2A 支付）
       ↓
  各 Agent 并行处理，结果汇总
       ↓
  用户在同一个聊天框看到过程和结果
```

### 关键技术问题：Session 状态同步

这是 Teams 最难的地方。

**场景**：用户说"帮我分析 ETH 市场，然后制定交易策略"

```
[用户消息] ──→ [Leader Agent]
                    │
                    ├──A2A→ [PriceOracleAgent]  → 返回价格数据
                    │
                    └──A2A→ [TradeStrategyAgent] → 等待价格数据后返回策略
                    │
                    ↓ 汇总
              [Leader 综合结果] ──→ [用户看到最终回复]
```

**Session 同步挑战**：
1. 每个 Agent 有独立的对话历史（独立 Durable Object）
2. 用户只看到一个聊天窗口
3. 需要把多个 Agent 的"工作过程"流式呈现给用户
4. 如果某个子 Agent 失败，如何处理？

**可能的方案**：

方案 A — **Leader 代理所有通信**（简单）
```
用户 ↔ LeaderAgent ↔ [其他 Agents]
```
用户只和 Leader 交互，Leader 内部协调。其他 Agent 的回复作为 Leader 的"工具调用结果"。
- 优点：用户体验简单
- 缺点：用户看不到各 Agent 的工作过程，不够透明

方案 B — **共享 Session 总线**（复杂但透明）
```
用户
  ↕
[Session Bus（KV 存储）]
  ├── LeaderAgent 订阅并写入
  ├── PriceAgent 订阅并写入
  └── TradeAgent 订阅并写入
```
所有 Agent 往同一个 KV 频道写消息，前端 SSE/WebSocket 实时展示所有 Agent 的活动。
- 优点：透明，用户能看到"会议室"里所有 Agent 在讨论
- 缺点：实现复杂，状态同步容易出问题

方案 C — **A2A 调用链可视化**（当前 A2A 的自然延伸）
```
每次 A2A 支付都有 txHash → 前端把支付链展示成"工作流时间线"
```
不需要真正的 Session 同步，只是把 A2A 支付的顺序可视化。
- 优点：复用已有能力，实现最简单
- 缺点：用户看到的是"钱的流动"，不是"思考过程"

---

## 四、Tasks 页面接链上

### 当前问题

Tasks 页面从 `mockService` 读数据，用户提交 workflow 后在 Tasks 看不到真实进度。

### 要接的数据

两个来源：

**来源 1 — CF Workflow 状态**（A2A 流程）
```
GET /api/a2a/:jobId → { status: "running|completed|failed", result: {...} }
```
适合展示：A2A 支付流程的进度 + 每笔 txHash

**来源 2 — TaskManager 合约**（链上任务）
```
taskManager.getRequesterTasks(address) → taskId[]
taskManager.getTask(taskId) → { status, budget, description, ... }
```
适合展示：链上任务状态（created/executing/completed/failed）

### 展示方案

Tasks 页面合并两个来源，统一显示：

```
Tasks
├── CF Workflow 任务（从 KV 或 Workflow API 读）
│   └── 展示 A2A 支付链 + 每步 txHash
│
└── 链上 TaskManager 任务（从合约读）
    └── 展示状态 + 预算 + 执行进度
```

---

## 五、优先级判断（黑客松视角）

### 截止 3/26 必须做

| 功能 | 工作量 | 优先级 |
|---|---|---|
| Tasks 页面接 CF Workflow 状态 | 小（前端 + 已有 API） | P0 |
| Worker 部署 + secrets 配置 | 小（运维） | P0 |
| Market Deploy 按钮跳转到 Workflows | 很小 | P0 |

### 可以做但非必须（如果有时间）

| 功能 | 工作量 | 优先级 |
|---|---|---|
| Tasks 页面接 TaskManager 合约 | 中 | P1 |
| Teams 改为方案 C（A2A 可视化） | 中 | P1 |

### 黑客松后做

| 功能 | 工作量 | 说明 |
|---|---|---|
| Active 模式（Agent 主动扫描任务） | 大 | 需要 Task Market 合约设计 |
| Teams 真正的 Session 同步 | 大 | 方案 B 复杂度高 |
| Agent 自动报价机制 | 大 | 需要 Token 计量 + 定价合约 |
| 开发者发布 Agent 到 Market | 中 | 需要 AgentRegistry + Market 前端改版 |

---

## 六、开放问题（需要决策）

1. **Active 模式的触发机制**：
   - Cron（每分钟 Worker 扫描）← 已有基础
   - 链上事件监听（TaskCreated event）← 需要 WebSocket RPC
   - 用户广播（用户发布需求时主动 ping 已注册的 Agent）

2. **Teams 选哪个方案**：
   - 方案 A（Leader 代理）：最简单，黑客松可做
   - 方案 B（共享 Session 总线）：最好看，但复杂
   - 方案 C（A2A 可视化）：复用已有能力，折中

3. **报价链上化还是链下化**：
   - 链下更快（Worker 直接响应），但对用户不透明
   - 如果黑客松阶段，链下即可，后续再链上化

4. **Token 计量**：谁来负责统计每次调用消耗了多少 token？
   - CF AI Gateway 有日志，但没有 per-request 的 token 计费 API
   - 需要在 AgentSession 层自己计数
