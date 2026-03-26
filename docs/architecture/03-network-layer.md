# AgentX 网络层协议设计

> 去中心化的 Agent 发现与通信协议

---

## 1. 设计目标

### 1.1 核心问题

当前 dAgent 架构依赖中心化服务器进行 Agent 发现和任务调度：

```
中心化模式的问题:
├─ 单点故障 - 服务器宕机则整个网络瘫痪
├─ 审查风险 - 平台可以阻止特定 Agent 或用户
├─ 数据控制 - 平台掌握所有元数据
├─ 扩展瓶颈 - 随着规模增长，服务器成本激增
└─ 信任假设 - 用户必须信任平台不会作恶
```

### 1.2 目标架构

```
去中心化 P2P 网络:

┌─────────┐         ┌─────────┐         ┌─────────┐
│  User A │◄───────►│  User B │◄───────►│  User C │
│  (Node) │         │  (Node) │         │  (Node) │
└────┬────┘         └────┬────┘         └────┬────┘
     │                   │                   │
     │    ┌─────────┐    │                   │
     └───►│ Agent X │◄───┘                   │
          │ (Node)  │◄───────────────────────┘
          └─────────┘

特点:
├─ 每个参与者都是网络节点
├─ 直接 P2P 通信，无需中介
├─ 抗审查，无法被单点阻止
├─ 自扩展，节点越多网络越强
└─ 数据由用户自己控制
```

---

## 2. 网络拓扑

### 2.1 混合网络架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     AgentX P2P Network                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Bootstrap Layer (启动层)                    │   │
│  │                                                         │   │
│  │  • 种子节点 (Seed Nodes)                                │   │
│  │    - 已知公网地址的引导节点                              │   │
│  │    - 帮助新节点发现网络                                  │   │
│  │    - 可由社区运行，非单一控制                            │   │
│  │                                                         │   │
│  │  • DHT Bootstrap                                        │   │
│  │    - 使用公共 DHT 网络 (如 IPFS 的 DHT)                 │   │
│  │    - 去中心化的节点发现                                  │   │
│  │                                                         │   │
│  │  • 链上注册表                                           │   │
│  │    - 区块链存储节点地址                                  │   │
│  │    - 抗审查，永久可用                                    │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Discovery Layer (发现层)                    │   │
│  │                                                         │   │
│  │  • Kademlia DHT                                         │   │
│  │    - 分布式哈希表存储节点信息                            │   │
│  │    - O(log n) 查找复杂度                                 │   │
│  │    - 自组织，自动平衡                                    │   │
│  │                                                         │   │
│  │  • Gossip Protocol                                        │   │
│  │    -  epidemic 广播传播信息                              │   │
│  │    - 快速传播 Agent 更新                                 │   │
│  │    - 最终一致性                                          │   │
│  │                                                         │   │
│  │  • Topic-based Pub/Sub                                   │   │
│  │    - 按主题订阅 (如 "defi", "coding")                   │   │
│  │    - 实时任务广播                                        │   │
│  │    - 兴趣匹配                                            │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Communication Layer (通信层)                │   │
│  │                                                         │   │
│  │  • libp2p                                               │   │
│  │    - 模块化 P2P 协议栈                                   │   │
│  │    - 支持多种传输 (TCP, QUIC, WebSocket)                │   │
│  │    - NAT 穿透 (通过 relay 和 hole punching)             │   │
│  │                                                         │   │
│  │  • Noise Protocol                                       │   │
│  │    - 加密通信                                            │   │
│  │    - 前向安全                                            │   │
│  │                                                         │   │
│  │  • Circuit Relay                                        │   │
│  │    - 帮助 NAT 后节点通信                                 │   │
│  │    - 中继连接                                            │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 节点类型

```
┌─────────────────────────────────────────────────────────────────┐
│                        节点类型                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 轻节点 (Light Node)                                         │
│     ├─ 普通用户运行                                             │
│     ├─ 只存储自己关心的数据                                     │
│     ├─ 通过其他节点查询网络                                     │
│     └─ 资源需求: 低 (普通电脑/手机)                             │
│                                                                 │
│  2. 全节点 (Full Node)                                          │
│     ├─ Agent 提供者运行                                         │
│     ├─ 存储完整的 DHT 路由表                                    │
│     ├─ 参与消息路由                                             │
│     └─ 资源需求: 中 (VPS 级别)                                  │
│                                                                 │
│  3. 中继节点 (Relay Node)                                       │
│     ├─ 有公网 IP 的节点                                         │
│     ├─ 帮助 NAT 后节点建立连接                                  │
│     ├─ 转发消息                                                 │
│     └─ 资源需求: 中高 (稳定网络连接)                            │
│                                                                 │
│  4. 存储节点 (Storage Node)                                     │
│     ├─ 存储历史数据和元数据                                     │
│     ├─ 提供数据查询服务                                         │
│     ├─ 可集成 IPFS/Filecoin                                     │
│     └─ 资源需求: 高 (大存储空间)                                │
│                                                                 │
│  5. 验证节点 (Validator Node)                                   │
│     ├─ 参与共识验证                                             │
│     ├─ 质押代币                                                 │
│     ├─ 获得验证奖励                                             │
│     └─ 资源需求: 高 (高可用性要求)                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Agent 发现协议

### 3.1 基于 DHT 的发现

```typescript
// DHT 键值设计
interface DHTRecord {
  // 键: /agentx/agent/{agentId}
  // 值: AgentInfo
}

interface AgentInfo {
  did: string;                    // 去中心化身份
  agentId: string;                // Agent 唯一标识
  metadataCID: string;            // IPFS 元数据地址
  capabilities: Capability[];     // 能力列表
  supportedChains: number[];      // 支持的链
  endpoint: Multiaddr;            // P2P 地址
  reputation: ReputationScore;    // 声誉分数
  lastSeen: number;               // 最后在线时间
  signature: bytes;               // 签名验证
}

// DHT 操作
class AgentDiscovery {
  private dht: KademliaDHT;
  
  // 注册 Agent 到 DHT
  async registerAgent(agentInfo: AgentInfo): Promise<void> {
    const key = `/agentx/agent/${agentInfo.agentId}`;
    const value = encode(agentInfo);
    
    // 存储到 DHT，设置 TTL
    await this.dht.put(key, value, { ttl: 24 * 60 * 60 * 1000 }); // 24小时
    
    // 同时发布到相关主题
    for (const cap of agentInfo.capabilities) {
      await this.publishToTopic(`capability:${cap.type}`, agentInfo.agentId);
    }
  }
  
  // 发现 Agent
  async findAgents(query: AgentQuery): Promise<AgentInfo[]> {
    // 方法 1: 直接查询 (如果知道 agentId)
    if (query.agentId) {
      const info = await this.dht.get(`/agentx/agent/${query.agentId}`);
      return info ? [decode(info)] : [];
    }
    
    // 方法 2: 按能力查询
    if (query.capabilities) {
      // 查询多个能力主题的交集
      const agentIds = await this.queryByCapabilities(query.capabilities);
      
      // 获取详细信息
      const agents = await Promise.all(
        agentIds.map(id => this.dht.get(`/agentx/agent/${id}`))
      );
      
      // 过滤和排序
      return agents
        .map(a => decode(a))
        .filter(a => this.matchesQuery(a, query))
        .sort((a, b) => b.reputation.overall - a.reputation.overall);
    }
    
    // 方法 3: 全文搜索 (通过索引节点)
    if (query.keywords) {
      return this.searchByKeywords(query.keywords);
    }
    
    return [];
  }
  
  // 订阅特定类型的 Agent 更新
  async subscribeToCapability(capabilityType: string): Promise<AsyncIterable<AgentInfo>> {
    const topic = `capability:${capabilityType}`;
    
    return this.dht.subscribe(topic, (message) => {
      const agentId = message.data.toString();
      return this.dht.get(`/agentx/agent/${agentId}`).then(decode);
    });
  }
}
```

### 3.2 Gossip 传播

```typescript
// Gossip 协议用于快速传播更新
class GossipProtocol {
  private gossip: GossipSub;
  
  constructor(libp2p: Libp2p) {
    this.gossip = new GossipSub(libp2p, {
      emitSelf: false,
      gossipIncoming: true,
      fallbackToFloodsub: true,
      floodPublish: true,
      doPX: true,  // Peer exchange
      directPeers: [],
      D: 6,        // D-low
      Dlo: 4,      // D-low
      Dhi: 12,     // D-high
      Dscore: 4,   // D-score
      Dout: 2,     // D-out
      Dlazy: 6,    // D-lazy
    });
  }
  
  // 发布 Agent 更新
  async publishAgentUpdate(update: AgentUpdate): Promise<void> {
    const message = {
      type: 'AGENT_UPDATE',
      timestamp: Date.now(),
      data: update,
      signature: await this.sign(update),
    };
    
    // 发布到多个相关主题
    const topics = [
      'agentx:agents:all',
      `agentx:agents:capability:${update.capability}`,
      `agentx:agents:chain:${update.chainId}`,
    ];
    
    for (const topic of topics) {
      await this.gossip.publish(topic, encode(message));
    }
  }
  
  // 发布任务广播
  async publishTask(task: TaskBroadcast): Promise<void> {
    const message = {
      type: 'TASK_BROADCAST',
      timestamp: Date.now(),
      taskId: task.id,
      requirements: task.requirements,
      budget: task.budget,
      deadline: task.deadline,
      signature: await this.sign(task),
    };
    
    // 根据任务类型发布到不同主题
    const topics = this.getTopicsForTask(task);
    
    for (const topic of topics) {
      await this.gossip.publish(topic, encode(message));
    }
  }
  
  // 监听任务
  async subscribeToTasks(
    capabilities: string[],
    handler: (task: TaskBroadcast) => void
  ): Promise<void> {
    const topics = capabilities.map(c => `agentx:tasks:${c}`);
    
    for (const topic of topics) {
      await this.gossip.subscribe(topic);
    }
    
    this.gossip.on('message', (message) => {
      const decoded = decode(message.data);
      
      // 验证签名
      if (!this.verifySignature(decoded)) {
        return;
      }
      
      // 验证时间戳 (防止重放)
      if (Date.now() - decoded.timestamp > 5 * 60 * 1000) {
        return; // 超过 5 分钟的消息忽略
      }
      
      handler(decoded);
    });
  }
}
```

### 3.3 链上索引 (可选增强)

```solidity
// 链上索引合约 - 用于增强发现
contract AgentIndex {
    // 按能力索引
    mapping(bytes32 => uint256[]) public agentsByCapability;
    
    // 按链索引
    mapping(uint256 => uint256[]) public agentsByChain;
    
    // 按声誉排序 (简化版)
    uint256[] public topAgents;
    
    // 更新索引 (由 AgentRegistry 调用)
    function updateIndex(
        uint256 agentId,
        bytes32[] memory capabilities,
        uint256[] memory chains,
        uint256 reputationScore
    ) external onlyRegistry {
        // 更新能力索引
        for (uint i = 0; i < capabilities.length; i++) {
            _addToCapabilityIndex(capabilities[i], agentId);
        }
        
        // 更新链索引
        for (uint i = 0; i < chains.length; i++) {
            _addToChainIndex(chains[i], agentId);
        }
        
        // 更新声誉排序
        _updateReputationRanking(agentId, reputationScore);
    }
    
    // 查询函数
    function findAgentsByCapability(
        bytes32 capability,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory) {
        uint256[] storage agents = agentsByCapability[capability];
        
        uint256 start = offset;
        uint256 end = Math.min(offset + limit, agents.length);
        
        uint256[] memory result = new uint256[](end - start);
        for (uint i = start; i < end; i++) {
            result[i - start] = agents[i];
        }
        
        return result;
    }
}
```

---

## 4. 通信协议

### 4.1 协议栈

```
┌─────────────────────────────────────────────────────────────────┐
│                    Application Layer                            │
│         (Agent Messaging, Task Negotiation)                     │
├─────────────────────────────────────────────────────────────────┤
│                    Serialization                                │
│              (Protobuf / JSON / CBOR)                           │
├─────────────────────────────────────────────────────────────────┤
│                    Encryption                                   │
│              (Noise Protocol / TLS 1.3)                         │
├─────────────────────────────────────────────────────────────────┤
│                    libp2p                                       │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │Identify │ │  Ping   │ │  DHT    │ │ Gossip  │ │  Relay  │   │
│  │Protocol │ │Protocol │ │Protocol │ │   Sub   │ │Protocol │   │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                    Transport                                    │
│         (TCP / QUIC / WebSocket / WebRTC)                       │
├─────────────────────────────────────────────────────────────────┤
│                    Network                                      │
│              (IPv4 / IPv6 / Tor / I2P)                          │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 消息格式

```protobuf
// agentx.proto
syntax = "proto3";

package agentx;

// 基础消息包装
message Message {
  string message_id = 1;        // UUID
  string message_type = 2;      // 消息类型
  int64 timestamp = 3;          // Unix 时间戳 (毫秒)
  bytes sender_pubkey = 4;      // 发送者公钥
  bytes signature = 5;          // 签名
  bytes payload = 6;            // 序列化的具体消息
  bytes encryption_nonce = 7;   // 加密随机数 (如适用)
}

// Agent 到 Agent 的直接消息
message DirectMessage {
  string recipient_did = 1;     // 接收者 DID
  string content_type = 2;      // 内容类型
  bytes content = 3;            // 加密内容
  int64 ttl = 4;                // 生存时间 (毫秒)
}

// 任务协商消息
message TaskNegotiation {
  string task_id = 1;
  string negotiation_type = 2;  // PROPOSE, COUNTER, ACCEPT, REJECT
  
  message TaskTerms {
    string description_hash = 1;    // 任务描述哈希
    uint64 budget = 2;              // 预算 (最小单位)
    string token_address = 3;       // 支付代币
    int64 deadline = 4;             // 截止时间
    bytes32 escrow_contract = 5;    // 托管合约地址
    uint256 deposit_amount = 6;     // 保证金
  }
  
  TaskTerms terms = 3;
  string reason = 4;            // 拒绝原因 (如适用)
  bytes proof = 5;              // 零知识证明 (可选)
}

// 任务进度更新
message TaskProgress {
  string task_id = 1;
  string status = 2;            // STARTED, IN_PROGRESS, MILESTONE, COMPLETED
  int32 progress_percent = 3;   // 进度百分比
  string milestone_description = 4;
  bytes deliverable_cid = 5;    // IPFS 内容标识
  bytes proof_of_work = 6;      // 工作证明
}

// 心跳消息
message Heartbeat {
  string node_id = 1;
  repeated string capabilities = 2;
  repeated string supported_chains = 3;
  NodeStatus status = 4;
  int64 uptime = 5;             // 运行时间 (秒)
  ResourceUsage resources = 6;  // 资源使用情况
}

enum NodeStatus {
  AVAILABLE = 0;
  BUSY = 1;
  AWAY = 2;
  OFFLINE = 3;
}

message ResourceUsage {
  int32 cpu_percent = 1;
  int64 memory_used = 2;
  int64 memory_total = 3;
  int32 active_tasks = 4;
}
```

### 4.3 连接管理

```typescript
// P2P 连接管理
class ConnectionManager {
  private libp2p: Libp2p;
  private connections: Map<string, Connection> = new Map();
  private dialQueue: Queue<DialRequest> = new Queue();
  
  constructor(config: NodeConfig) {
    this.libp2p = createLibp2p({
      transports: [
        new TCP(),
        new WebSocket(),
        new WebRTCStar({ ... }),
      ],
      connectionEncryption: [
        new Noise(),
      ],
      streamMuxers: [
        new Yamux(),
        new Mplex(),
      ],
      peerDiscovery: [
        new Bootstrap({
          list: config.bootstrapNodes,
        }),
        new MDNS(), // 本地网络发现
      ],
      relay: {
        enabled: true,
        hop: {
          enabled: true,  // 允许作为中继
          active: false,
        },
      },
      nat: {
        enabled: true,
      },
    });
  }
  
  // 建立到特定节点的连接
  async connectToPeer(peerId: PeerId | Multiaddr): Promise<Connection> {
    const peerIdStr = peerId.toString();
    
    // 检查现有连接
    if (this.connections.has(peerIdStr)) {
      const conn = this.connections.get(peerIdStr)!;
      if (conn.status === 'open') {
        return conn;
      }
    }
    
    // 尝试直接连接
    try {
      const conn = await this.libp2p.dial(peerId);
      this.connections.set(peerIdStr, conn);
      return conn;
    } catch (err) {
      // 直接连接失败，尝试通过中继
      return this.connectViaRelay(peerId);
    }
  }
  
  // 通过中继连接 (NAT 穿透)
  private async connectViaRelay(peerId: PeerId): Promise<Connection> {
    // 查找可用的中继节点
    const relays = await this.findRelayNodes();
    
    for (const relay of relays) {
      try {
        // 建立中继连接
        const relayedAddr = multiaddr(`/p2p/${relay}/p2p-circuit/p2p/${peerId}`);
        const conn = await this.libp2p.dial(relayedAddr);
        
        // 尝试 hole punching 建立直接连接
        this.attemptHolePunching(peerId, relay);
        
        this.connections.set(peerId.toString(), conn);
        return conn;
      } catch (err) {
        continue; // 尝试下一个中继
      }
    }
    
    throw new Error('Failed to connect via any relay');
  }
  
  // 维护连接池
  private startConnectionMaintenance(): void {
    setInterval(async () => {
      // 清理死连接
      for (const [peerId, conn] of this.connections) {
        if (conn.status !== 'open') {
          this.connections.delete(peerId);
        }
      }
      
      // 确保最小连接数
      const currentPeers = this.libp2p.getPeers().length;
      if (currentPeers < MIN_PEERS) {
        await this.discoverAndConnect(MIN_PEERS - currentPeers);
      }
      
      // 发送心跳
      await this.broadcastHeartbeat();
    }, 60000); // 每分钟
  }
}
```

---

## 5. 任务协商协议

### 5.1 协商流程

```
┌──────────┐                              ┌──────────┐
│  User    │                              │  Agent   │
│ (Client) │                              │ (Worker) │
└────┬─────┘                              └────┬─────┘
     │                                         │
     │  1. TASK_PROPOSAL                       │
     │ ───────────────────────────────────────►│
     │     • 任务描述哈希                       │
     │     • 预算                              │
     │     • 截止时间                           │
     │     • 支付条款                           │
     │                                         │
     │         2. TASK_COUNTER (可选)          │
     │ ◄───────────────────────────────────────│
     │     • 修改预算/时间                      │
     │     • 添加条款                           │
     │                                         │
     │  3. TASK_ACCEPT / TASK_REJECT           │
     │ ───────────────────────────────────────►│
     │                                         │
     │     [链上操作: 创建托管合约]              │
     │                                         │
     │         4. TASK_CONFIRMED               │
     │ ◄───────────────────────────────────────│
     │     • 链上交易哈希                       │
     │     • 开始执行                           │
     │                                         │
     │         5. PROGRESS_UPDATE (多次)       │
     │ ◄═══════════════════════════════════════│
     │     • 进度百分比                         │
     │     • 里程碑                             │
     │     • 交付物                             │
     │                                         │
     │         6. TASK_COMPLETED               │
     │ ◄───────────────────────────────────────│
     │     • 最终结果                           │
     │     • 工作证明                           │
     │                                         │
     │  7. CONFIRM_COMPLETION / DISPUTE        │
     │ ───────────────────────────────────────►│
     │                                         │
     │     [链上操作: 释放支付 / 发起争议]        │
     │                                         │
```

### 5.2 代码实现

```typescript
class TaskNegotiationProtocol {
  private messageHandler: MessageHandler;
  private activeNegotiations: Map<string, NegotiationState> = new Map();
  
  // 发起任务协商
  async proposeTask(
    agentId: string,
    taskSpec: TaskSpecification
  ): Promise<NegotiationResult> {
    const negotiationId = generateUUID();
    
    // 查找 Agent
    const agentInfo = await this.discovery.findAgent(agentId);
    if (!agentInfo) {
      throw new Error('Agent not found');
    }
    
    // 建立连接
    const connection = await this.connectionManager.connectToPeer(agentInfo.endpoint);
    
    // 创建提案
    const proposal: TaskNegotiation = {
      task_id: negotiationId,
      negotiation_type: 'PROPOSE',
      terms: {
        description_hash: hashTaskDescription(taskSpec.description),
        budget: taskSpec.budget,
        token_address: taskSpec.paymentToken,
        deadline: Date.now() + taskSpec.duration,
        escrow_contract: this.getEscrowContractAddress(taskSpec.chainId),
        deposit_amount: taskSpec.budget * 0.1, // 10% 保证金
      },
    };
    
    // 发送提案
    const response = await this.sendAndWait(connection, proposal, {
      timeout: 30000, // 30 秒超时
    });
    
    // 处理响应
    switch (response.negotiation_type) {
      case 'ACCEPT':
        return this.handleAcceptance(negotiationId, agentInfo, response);
      case 'COUNTER':
        return this.handleCounter(negotiationId, agentInfo, response);
      case 'REJECT':
        throw new Error(`Proposal rejected: ${response.reason}`);
      default:
        throw new Error('Invalid response type');
    }
  }
  
  // 监听传入的任务请求 (Agent 端)
  async listenForTasks(
    capabilities: string[],
    handler: (proposal: TaskNegotiation) => Promise<NegotiationResponse>
  ): Promise<void> {
    // 订阅相关主题
    for (const cap of capabilities) {
      await this.gossip.subscribe(`agentx:tasks:${cap}`);
    }
    
    // 处理传入消息
    this.messageHandler.on('TASK_PROPOSAL', async (message, connection) => {
      const proposal = decode(message.payload) as TaskNegotiation;
      
      // 验证提案
      if (!this.validateProposal(proposal)) {
        return;
      }
      
      // 调用业务逻辑处理
      const response = await handler(proposal);
      
      // 发送响应
      await this.sendResponse(connection, response);
    });
  }
  
  // 处理进度更新
  async subscribeToProgress(
    taskId: string,
    callback: (update: TaskProgress) => void
  ): Promise<() => void> {
    const unsubscribe = this.messageHandler.on('PROGRESS_UPDATE', (message) => {
      const update = decode(message.payload) as TaskProgress;
      if (update.task_id === taskId) {
        callback(update);
      }
    });
    
    return unsubscribe;
  }
}
```

---

## 6. 网络治理

### 6.1 节点声誉

```typescript
// 基于行为的节点声誉
interface NodeReputation {
  nodeId: string;
  
  // 连接质量
  connectionReliability: number;  // 连接稳定性
  responseTime: number;           // 平均响应时间
  bandwidthContribution: number;  // 带宽贡献
  
  // 消息传播
  messageForwarding: number;      // 消息转发率
  gossipParticipation: number;    // Gossip 参与度
  
  // 任务执行 (如果是 Worker)
  taskCompletion: number;         // 任务完成率
  taskQuality: number;            // 任务质量评分
  disputeRate: number;            // 争议率
  
  // 总体分数
  overall: number;
  lastUpdated: number;
}

class NodeReputationTracker {
  private reputations: Map<string, NodeReputation> = new Map();
  
  // 记录连接事件
  recordConnectionEvent(nodeId: string, success: boolean, latency: number): void {
    const rep = this.getOrCreateReputation(nodeId);
    
    // 使用指数移动平均更新
    const alpha = 0.1;
    if (success) {
      rep.connectionReliability = (1 - alpha) * rep.connectionReliability + alpha * 1;
      rep.responseTime = (1 - alpha) * rep.responseTime + alpha * latency;
    } else {
      rep.connectionReliability = (1 - alpha) * rep.connectionReliability + alpha * 0;
    }
    
    this.updateOverallScore(rep);
  }
  
  // 获取高声誉节点 (用于优先连接)
  getHighReputationNodes(minScore: number = 0.7, limit: number = 10): string[] {
    return Array.from(this.reputations.entries())
      .filter(([_, rep]) => rep.overall >= minScore)
      .sort((a, b) => b[1].overall - a[1].overall)
      .slice(0, limit)
      .map(([nodeId, _]) => nodeId);
  }
}
```

### 6.2 垃圾信息防护

```typescript
// 反垃圾机制
class AntiSpam {
  private rateLimiter: Map<string, TokenBucket> = new Map();
  private messageCache: LRUCache<string, boolean> = new LRUCache({ max: 10000 });
  
  // 速率限制
  checkRateLimit(nodeId: string, messageType: string): boolean {
    const key = `${nodeId}:${messageType}`;
    
    if (!this.rateLimiter.has(key)) {
      // 不同消息类型不同限制
      const limits = {
        'TASK_BROADCAST': { rate: 10, burst: 20 },      // 每分钟 10 个
        'AGENT_UPDATE': { rate: 5, burst: 10 },         // 每分钟 5 个
        'DIRECT_MESSAGE': { rate: 60, burst: 100 },     // 每分钟 60 个
        'PROGRESS_UPDATE': { rate: 30, burst: 50 },     // 每分钟 30 个
      };
      
      const limit = limits[messageType] || { rate: 10, burst: 20 };
      this.rateLimiter.set(key, new TokenBucket(limit.rate, limit.burst));
    }
    
    const bucket = this.rateLimiter.get(key)!;
    return bucket.consume(1);
  }
  
  // 消息去重 (防止重放)
  isDuplicate(messageId: string): boolean {
    if (this.messageCache.has(messageId)) {
      return true;
    }
    this.messageCache.set(messageId, true);
    return false;
  }
  
  // 内容过滤
  validateContent(content: any): boolean {
    // 检查消息大小
    const size = JSON.stringify(content).length;
    if (size > MAX_MESSAGE_SIZE) {
      return false;
    }
    
    // 检查必要字段
    if (!content.message_id || !content.timestamp || !content.signature) {
      return false;
    }
    
    // 检查时间戳 (不能太旧，也不能是未来)
    const now = Date.now();
    const age = now - content.timestamp;
    if (age > 5 * 60 * 1000 || age < -60000) { // 5 分钟过期，1 分钟未来容忍
      return false;
    }
    
    return true;
  }
}
```

---

## 7. 实现路线图

### 阶段 1: 基础 P2P (Month 1-2)

```
目标: 实现基本的 P2P 通信

任务:
├─ 集成 libp2p
├─ 实现 DHT 发现
├─ 实现 Gossip 传播
├─ 基础消息协议
└─ NAT 穿透支持

里程碑:
├─ 节点可以互相发现
├─ 消息可以在网络传播
└─ 基础 Agent 注册
```

### 阶段 2: 任务协商 (Month 2-3)

```
目标: 实现 P2P 任务协商

任务:
├─ 任务广播协议
├─ 协商消息格式
├─ 进度更新机制
├─ 链上托管集成
└─ 争议处理流程

里程碑:
├─ 用户可以直接雇佣 Agent
├─ 无需中心化服务器
└─ 支付通过链上完成
```

### 阶段 3: 生产优化 (Month 3-4)

```
目标: 生产级稳定性

任务:
├─ 连接池优化
├─ 消息可靠性保证
├─ 垃圾信息防护
├─ 性能监控
└─ 安全审计

里程碑:
├─ 支持 1000+ 节点
├─ 消息延迟 < 1s
└─ 99.9% 可用性
```

### 阶段 4: 高级功能 (Month 4-6)

```
目标: 高级网络功能

任务:
├─ 分片 (Sharding)
├─ 隐私路由
├─ 去中心化存储集成
├─ 跨链消息桥接
└─ 治理机制

里程碑:
├─ 支持大规模网络
├─ 完全去中心化
└─ 社区自治
```

---

## 8. 参考实现

### 8.1 技术栈

```
核心库:
├─ libp2p (P2P 网络)
├─ libp2p-kad-dht (DHT 实现)
├─ libp2p-gossipsub (Gossip 协议)
├─ @noble/curves (加密)
└─ protobufjs (序列化)

参考项目:
├─ IPFS (DHT 和文件传输)
├─ Filecoin (存储市场)
├─ Livepeer (视频转码网络)
└─ Golem (计算市场)
```

### 8.2 相关标准

- [libp2p 规范](https://github.com/libp2p/specs)
- [Kademlia 论文](https://pdos.csail.mit.edu/~petar/papers/maymounkov-kademlia-lncs.pdf)
- [GossipSub 论文](https://arxiv.org/abs/2007.02754)
- [Noise Protocol](http://www.noiseprotocol.org/)

---

*本文档持续更新中*
