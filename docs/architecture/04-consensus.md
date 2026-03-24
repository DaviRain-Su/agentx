# Gradience 共识机制设计

> 去中心化 Agent 任务验证与争议仲裁

---

## 1. 设计目标

### 1.1 需要解决的问题

```
在去中心化 Agent 网络中，核心挑战是：

1. 任务完成验证
   ├─ 如何证明 Agent 确实完成了任务？
   ├─ 如何验证结果质量？
   └─ 如何防止虚假完成声明？

2. 争议仲裁
   ├─ 用户不满意结果怎么办？
   ├─ Agent 声称已完成但用户不确认？
   └─ 如何公正地裁决争议？

3. 经济安全
   ├─ 如何激励诚实行为？
   ├─ 如何惩罚恶意行为？
   └─ 如何保证系统长期稳定？
```

### 1.2 设计原则

```
原则 1: 分层验证
├─ 简单任务: 自动验证
├─ 复杂任务: 抽样验证
└─ 高价值任务: 全人工审核

原则 2: 经济激励
├─ 诚实行为获得奖励
├─ 恶意行为受到惩罚
└─ 参与仲裁获得收益

原则 3: 渐进式去中心化
├─ 初期: 基金会仲裁
├─ 中期: 选举仲裁员
└─ 长期: 完全社区治理

原则 4: 效率与安全的平衡
├─ 大多数任务快速完成
├─ 争议处理公正但不过慢
└─ 成本与价值相匹配
```

---

## 2. 任务验证机制

### 2.1 验证等级

```
┌─────────────────────────────────────────────────────────────────┐
│                      任务验证等级体系                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Level 1: 自动验证 (Automatic Verification)                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 适用: 简单、可编程验证的任务                              │   │
│  │                                                         │   │
│  │ 示例:                                                   │   │
│  │ • 代码编译是否通过                                       │   │
│  │ • 合约部署是否成功                                       │   │
│  │ • 测试是否全部通过                                       │   │
│  │ • 数学计算结果是否正确                                    │   │
│  │                                                         │   │
│  │ 验证方式:                                               │   │
│  │ • 确定性检查 (Deterministic Check)                      │   │
│  │ • 沙箱执行 (Sandbox Execution)                          │   │
│  │ • 零知识证明 (ZK Proof) - 可选                          │   │
│  │                                                         │   │
│  │ 成本: 极低 (~$0.001)                                    │   │
│  │ 时间: 即时 (< 1秒)                                      │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  Level 2: 抽样验证 (Sampling Verification)                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 适用: 中等复杂度、难以完全自动验证的任务                  │   │
│  │                                                         │   │
│  │ 示例:                                                   │   │
│  │ • 代码质量评估                                           │   │
│  │ • 文档撰写质量                                           │   │
│  │ • 设计作品评估                                           │   │
│  │ • 策略回测结果                                           │   │
│  │                                                         │   │
│  │ 验证方式:                                               │   │
│  │ • 随机抽样检查 (Random Sampling)                        │   │
│  │ • 验证者委员会 (Validator Committee)                    │   │
│  │ • 多数投票 (Majority Voting)                            │   │
│  │                                                         │   │
│  │ 参数:                                                   │   │
│  │ • 抽样比例: 5-20%                                       │   │
│  │ • 委员会大小: 5-21 人                                   │   │
│  │ • 通过阈值: 2/3 多数                                    │   │
│  │                                                         │   │
│  │ 成本: 中等 (~$0.1-1)                                    │   │
│  │ 时间: 快速 (1-10 分钟)                                  │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  Level 3: 全人工审核 (Full Manual Review)                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 适用: 高价值、复杂、需要专业判断的任务                    │   │
│  │                                                         │   │
│  │ 示例:                                                   │   │
│  │ • 智能合约安全审计                                       │   │
│  │ • 复杂策略设计                                           │   │
│  │ • 重大项目规划                                           │   │
│  │ • 法律/合规审查                                          │   │
│  │                                                         │   │
│  │ 验证方式:                                               │   │
│  │ • 专业仲裁员 (Expert Arbitrators)                       │   │
│  │ • 多轮评审 (Multi-round Review)                         │   │
│  │ • 详细报告 (Detailed Report)                            │   │
│  │                                                         │   │
│  │ 参数:                                                   │   │
│  │ • 仲裁员: 3-7 人                                        │   │
│  │ • 质押要求: 高                                          │   │
│  │ • 评审周期: 1-7 天                                      │   │
│  │                                                         │   │
│  │ 成本: 较高 (~$10-100+)                                  │   │
│  │ 时间: 较慢 (1-7 天)                                     │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 自动验证实现

```typescript
// 自动验证引擎
interface VerificationEngine {
  verify(task: Task, result: TaskResult): Promise<VerificationResult>;
}

// Level 1: 确定性验证
class DeterministicVerifier implements VerificationEngine {
  async verify(task: Task, result: TaskResult): Promise<VerificationResult> {
    switch (task.type) {
      case 'code_compilation':
        return this.verifyCompilation(result);
      case 'contract_deployment':
        return this.verifyDeployment(result);
      case 'test_execution':
        return this.verifyTests(result);
      case 'mathematical_proof':
        return this.verifyMathProof(result);
      default:
        return { valid: false, reason: 'Unknown task type for deterministic verification' };
    }
  }
  
  private async verifyCompilation(result: TaskResult): Promise<VerificationResult> {
    // 在隔离沙箱中编译代码
    const sandbox = new SecureSandbox();
    
    try {
      const compileResult = await sandbox.compile({
        code: result.deliverables.code,
        language: result.metadata.language,
        version: result.metadata.compilerVersion,
      });
      
      return {
        valid: compileResult.success,
        details: {
          compilationTime: compileResult.time,
          outputSize: compileResult.outputSize,
          warnings: compileResult.warnings,
          errors: compileResult.errors,
        },
        proof: compileResult.artifactHash, // 编译产物哈希
      };
    } catch (error) {
      return {
        valid: false,
        reason: `Compilation failed: ${error.message}`,
      };
    }
  }
  
  private async verifyDeployment(result: TaskResult): Promise<VerificationResult> {
    // 验证合约确实部署在链上
    const provider = getProvider(result.metadata.chainId);
    
    const code = await provider.getCode(result.deliverables.contractAddress);
    
    if (code === '0x') {
      return {
        valid: false,
        reason: 'No contract found at specified address',
      };
    }
    
    // 验证字节码哈希
    const bytecodeHash = keccak256(code);
    const expectedHash = result.metadata.bytecodeHash;
    
    if (bytecodeHash !== expectedHash) {
      return {
        valid: false,
        reason: 'Deployed bytecode does not match expected',
      };
    }
    
    return {
      valid: true,
      details: {
        contractAddress: result.deliverables.contractAddress,
        deployer: result.metadata.deployer,
        blockNumber: result.metadata.blockNumber,
        bytecodeHash,
      },
      proof: result.metadata.transactionHash,
    };
  }
  
  private async verifyTests(result: TaskResult): Promise<VerificationResult> {
    // 在沙箱中运行测试
    const sandbox = new SecureSandbox();
    
    const testResult = await sandbox.runTests({
      code: result.deliverables.code,
      tests: result.deliverables.tests,
      testFramework: result.metadata.testFramework,
      timeout: 300000, // 5 分钟
    });
    
    return {
      valid: testResult.passed === testResult.total,
      details: {
        passed: testResult.passed,
        failed: testResult.failed,
        total: testResult.total,
        coverage: testResult.coverage,
        duration: testResult.duration,
      },
      proof: testResult.reportHash,
    };
  }
}

// 安全沙箱实现
class SecureSandbox {
  private vm: VM;
  
  constructor() {
    // 使用 Firecracker 或 gVisor 创建隔离环境
    this.vm = new VM({
      timeout: 30000, // 30 秒超时
      sandbox: {
        // 限制系统调用
        syscalls: ['read', 'write', 'exit'],
        // 限制网络访问
        network: false,
        // 限制文件系统
        filesystem: 'readonly',
        // 限制内存
        memory: 512 * 1024 * 1024, // 512 MB
        // 限制 CPU
        cpuQuota: 100000, // 100ms per second
      },
    });
  }
  
  async compile(params: CompileParams): Promise<CompileResult> {
    return this.vm.run(async (ctx) => {
      // 在隔离环境中编译
      const compiler = loadCompiler(params.language, params.version);
      return compiler.compile(params.code);
    });
  }
  
  async runTests(params: TestParams): Promise<TestResult> {
    return this.vm.run(async (ctx) => {
      const runner = loadTestRunner(params.testFramework);
      return runner.run(params.code, params.tests, { timeout: params.timeout });
    });
  }
}
```

### 2.3 抽样验证实现

```solidity
// 抽样验证合约
contract SamplingVerification {
    struct VerificationRequest {
        uint256 taskId;
        bytes32 resultHash;
        uint256 sampleSize;      // 抽样数量
        uint256 committeeSize;   // 委员会大小
        uint256 rewardPerVerifier; // 每个验证者奖励
        uint256 deadline;
        mapping(address => VerificationVote) votes;
        address[] verifiers;
        VerificationStatus status;
    }
    
    struct VerificationVote {
        bool approve;
        bytes32 reasonHash;      // IPFS 哈希指向详细理由
        uint256 stake;
        uint256 timestamp;
    }
    
    enum VerificationStatus { Pending, InProgress, Approved, Rejected, Tied }
    
    mapping(uint256 => VerificationRequest) public verifications;
    
    // 发起抽样验证
    function initiateSampling(
        uint256 taskId,
        bytes32 resultHash,
        uint256 confidenceLevel  // 95 = 95% 置信度
    ) external payable returns (uint256 verificationId) {
        // 根据置信度计算抽样大小
        uint256 sampleSize = calculateSampleSize(confidenceLevel);
        uint256 committeeSize = calculateCommitteeSize(sampleSize);
        
        // 计算所需质押
        uint256 totalStake = calculateRequiredStake(committeeSize);
        require(msg.value >= totalStake, "Insufficient stake");
        
        verificationId = uint256(keccak256(abi.encodePacked(taskId, block.timestamp)));
        
        VerificationRequest storage req = verifications[verificationId];
        req.taskId = taskId;
        req.resultHash = resultHash;
        req.sampleSize = sampleSize;
        req.committeeSize = committeeSize;
        req.rewardPerVerifier = msg.value / committeeSize;
        req.deadline = block.timestamp + 1 hours;
        req.status = VerificationStatus.Pending;
        
        // 随机选择验证者委员会
        selectCommittee(verificationId, committeeSize);
        
        emit SamplingInitiated(verificationId, taskId, committeeSize);
    }
    
    // 验证者投票
    function submitVote(
        uint256 verificationId,
        bool approve,
        bytes32 reasonHash
    ) external {
        VerificationRequest storage req = verifications[verificationId];
        
        require(req.status == VerificationStatus.InProgress, "Not in progress");
        require(block.timestamp < req.deadline, "Deadline passed");
        require(isCommitteeMember(verificationId, msg.sender), "Not a committee member");
        require(req.votes[msg.sender].timestamp == 0, "Already voted");
        
        // 记录投票
        req.votes[msg.sender] = VerificationVote({
            approve: approve,
            reasonHash: reasonHash,
            stake: req.rewardPerVerifier,
            timestamp: block.timestamp
        });
        
        emit VoteSubmitted(verificationId, msg.sender, approve);
        
        // 检查是否达到决议条件
        checkResolution(verificationId);
    }
    
    // 检查决议
    function checkResolution(uint256 verificationId) internal {
        VerificationRequest storage req = verifications[verificationId];
        
        uint256 approveCount = 0;
        uint256 rejectCount = 0;
        
        for (uint i = 0; i < req.verifiers.length; i++) {
            VerificationVote storage vote = req.votes[req.verifiers[i]];
            if (vote.timestamp > 0) {
                if (vote.approve) {
                    approveCount++;
                } else {
                    rejectCount++;
                }
            }
        }
        
        uint256 totalVotes = approveCount + rejectCount;
        
        // 2/3 多数决
        if (approveCount * 3 >= totalVotes * 2) {
            req.status = VerificationStatus.Approved;
            distributeRewards(verificationId, true);
        } else if (rejectCount * 3 >= totalVotes * 2) {
            req.status = VerificationStatus.Rejected;
            distributeRewards(verificationId, false);
        } else if (totalVotes == req.committeeSize) {
            req.status = VerificationStatus.Tied;
            // 进入扩展验证
            extendVerification(verificationId);
        }
    }
    
    // 计算抽样大小 (基于置信度)
    function calculateSampleSize(uint256 confidenceLevel) 
        internal 
        pure 
        returns (uint256) 
    {
        // 使用统计公式计算
        // n = (Z^2 * p * (1-p)) / E^2
        // Z: 置信区间对应的 Z 值
        // p: 预期比例 (0.5 为保守估计)
        // E: 误差范围
        
        if (confidenceLevel >= 99) return 20;
        if (confidenceLevel >= 95) return 10;
        if (confidenceLevel >= 90) return 7;
        return 5;
    }
    
    // 随机选择委员会 (使用链上随机数)
    function selectCommittee(uint256 verificationId, uint256 size) internal {
        VerificationRequest storage req = verifications[verificationId];
        
        // 获取可用验证者池
        address[] memory pool = getEligibleVerifiers();
        require(pool.length >= size, "Not enough verifiers");
        
        // 使用 VRF 随机选择
        bytes32 randomness = getVRFRandomness();
        
        for (uint i = 0; i < size; i++) {
            uint256 index = uint256(keccak256(abi.encodePacked(randomness, i))) % pool.length;
            req.verifiers.push(pool[index]);
            
            // 从池中移除已选
            pool[index] = pool[pool.length - 1];
            assembly { mstore(pool, sub(mload(pool), 1)) }
        }
        
        req.status = VerificationStatus.InProgress;
    }
}
```

---

## 3. 争议仲裁机制

### 3.1 争议流程

```
┌─────────────────────────────────────────────────────────────────┐
│                      争议仲裁流程                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Step 1: 争议发起                                               │
│  ┌─────────┐                                                    │
│  │ 用户或  │──► 提交争议理由 + 证据                              │
│  │ Agent   │    + 支付争议费用 (防止滥用)                        │
│  └─────────┘                                                    │
│       │                                                         │
│       ▼                                                         │
│  Step 2: 争议受理                                               │
│  ┌─────────┐                                                    │
│  │ 智能合约 │──► 冻结托管资金                                    │
│  │         │    选择仲裁员委员会                                 │
│  └─────────┘    通知双方                                         │
│       │                                                         │
│       ▼                                                         │
│  Step 3: 证据提交期 (3-7 天)                                     │
│  ┌─────────┐     ┌─────────┐                                    │
│  │  用户   │◄──►│  Agent  │                                    │
│  │ 提交证据 │     │ 提交证据 │                                    │
│  └─────────┘     └─────────┘                                    │
│       │              │                                          │
│       └──────────────┘                                          │
│              │                                                  │
│              ▼                                                  │
│  Step 4: 仲裁员评审 (7-14 天)                                    │
│  ┌─────────┐     ┌─────────┐     ┌─────────┐                    │
│  │仲裁员 1 │     │仲裁员 2 │     │仲裁员 N │                    │
│  │独立评审 │     │独立评审 │     │独立评审 │                    │
│  │提交裁决 │     │提交裁决 │     │提交裁决 │                    │
│  └─────────┘     └─────────┘     └─────────┘                    │
│       │              │              │                           │
│       └──────────────┼──────────────┘                           │
│                      ▼                                          │
│  Step 5: 裁决汇总                                               │
│  ┌─────────┐                                                    │
│  │ 智能合约 │──► 统计裁决结果                                    │
│  │         │    多数决 (2/3 或 简单多数)                         │
│  └─────────┘                                                    │
│       │                                                         │
│       ▼                                                         │
│  Step 6: 执行                                                   │
│  ┌─────────┐                                                    │
│  │ 资金分配 │──► 胜方获得托管资金                                │
│  │ 声誉更新 │    败方受到惩罚 (质押罚没)                         │
│  │ 仲裁员奖励│    仲裁员获得奖励                                  │
│  └─────────┘                                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 仲裁员系统

```solidity
// 仲裁员注册与管理
contract ArbitratorRegistry {
    struct Arbitrator {
        address addr;
        uint256 stake;              // 质押金额
        uint256 reputation;         // 声誉分数
        uint256 casesHandled;       // 处理案件数
        uint256 casesWon;           // 胜诉案件数 (与最终判决一致)
        string expertise;           // 专业领域 (JSON)
        bool isActive;
        uint256 joinedAt;
    }
    
    mapping(address => Arbitrator) public arbitrators;
    mapping(string => address[]) public arbitratorsByExpertise;
    
    uint256 public constant MIN_STAKE = 10000 * 1e6; // 10000 USDC
    uint256 public constant MIN_REPUTATION = 1000;
    
    // 注册成为仲裁员
    function registerArbitrator(
        string memory expertise,
        uint256 stake
    ) external {
        require(stake >= MIN_STAKE, "Insufficient stake");
        require(!arbitrators[msg.sender].isActive, "Already registered");
        
        // 转移质押
        usdc.transferFrom(msg.sender, address(this), stake);
        
        arbitrators[msg.sender] = Arbitrator({
            addr: msg.sender,
            stake: stake,
            reputation: 1000, // 初始声誉
            casesHandled: 0,
            casesWon: 0,
            expertise: expertise,
            isActive: true,
            joinedAt: block.timestamp
        });
        
        // 添加到专业领域索引
        string[] memory areas = parseExpertise(expertise);
        for (uint i = 0; i < areas.length; i++) {
            arbitratorsByExpertise[areas[i]].push(msg.sender);
        }
        
        emit ArbitratorRegistered(msg.sender, expertise, stake);
    }
    
    // 选择仲裁员委员会
    function selectArbitratorCommittee(
        string memory requiredExpertise,
        uint256 size,
        bytes32 randomSeed
    ) external view returns (address[] memory) {
        address[] memory pool = arbitratorsByExpertise[requiredExpertise];
        require(pool.length >= size, "Not enough arbitrators");
        
        // 按声誉加权选择
        address[] memory selected = new address[](size);
        uint256 selectedCount = 0;
        
        for (uint i = 0; i < pool.length && selectedCount < size; i++) {
            Arbitrator storage arb = arbitrators[pool[i]];
            
            // 检查资格
            if (!arb.isActive) continue;
            if (arb.stake < MIN_STAKE) continue;
            if (arb.reputation < MIN_REPUTATION) continue;
            
            // 声誉加权随机选择
            uint256 weight = arb.reputation;
            uint256 random = uint256(keccak256(abi.encodePacked(randomSeed, i)));
            
            if (random % 10000 < weight) {
                selected[selectedCount] = pool[i];
                selectedCount++;
            }
        }
        
        require(selectedCount == size, "Could not select enough arbitrators");
        return selected;
    }
    
    // 更新仲裁员表现
    function updateArbitratorPerformance(
        address arbitrator,
        bool alignedWithFinal  // 是否与最终判决一致
    ) external onlyDisputeContract {
        Arbitrator storage arb = arbitrators[arbitrator];
        arb.casesHandled++;
        if (alignedWithFinal) {
            arb.casesWon++;
            arb.reputation = min(arb.reputation + 10, 10000);
        } else {
            arb.reputation = max(arb.reputation - 50, 0);
        }
        
        // 如果声誉过低，暂停资格
        if (arb.reputation < 500) {
            arb.isActive = false;
        }
    }
    
    // 退出并取回质押
    function exitArbitrator() external {
        Arbitrator storage arb = arbitrators[msg.sender];
        require(arb.isActive, "Not active");
        require(block.timestamp > arb.joinedAt + 90 days, "Must wait 90 days");
        
        // 检查没有进行中的案件
        require(!hasActiveCases(msg.sender), "Has active cases");
        
        arb.isActive = false;
        usdc.transfer(msg.sender, arb.stake);
        
        emit ArbitratorExited(msg.sender, arb.stake);
    }
}
```

### 3.3 争议合约

```solidity
contract DisputeResolution {
    enum DisputeStatus { Open, EvidencePeriod, Deliberation, Resolved, Appealed }
    enum Resolution { None, FavorRequester, FavorAgent, Split }
    
    struct Dispute {
        uint256 id;
        uint256 taskId;
        address requester;
        address agent;
        string reason;
        bytes evidenceCID;          // IPFS 证据包
        uint256 escrowAmount;
        DisputeStatus status;
        address[] arbitrators;
        mapping(address => bytes32) rulings;  // 仲裁员 -> 裁决哈希
        Resolution finalResolution;
        uint256 openedAt;
        uint256 evidenceDeadline;
        uint256 deliberationDeadline;
        uint256 totalFees;
    }
    
    mapping(uint256 => Dispute) public disputes;
    ArbitratorRegistry public arbitratorRegistry;
    
    uint256 public constant EVIDENCE_PERIOD = 7 days;
    uint256 public constant DELIBERATION_PERIOD = 7 days;
    uint256 public constant DISPUTE_FEE_RATE = 500; // 5% of escrow
    
    // 发起争议
    function openDispute(
        uint256 taskId,
        string memory reason,
        bytes memory evidenceCID
    ) external payable returns (uint256 disputeId) {
        Task storage task = tasks[taskId];
        require(
            msg.sender == task.requester || msg.sender == task.agent,
            "Not a party"
        );
        require(task.status == TaskStatus.Completed, "Task not completed");
        require(task.disputeId == 0, "Dispute already exists");
        
        // 计算争议费用
        uint256 disputeFee = (task.escrowAmount * DISPUTE_FEE_RATE) / 10000;
        require(msg.value >= disputeFee, "Insufficient dispute fee");
        
        disputeId = nextDisputeId++;
        Dispute storage dispute = disputes[disputeId];
        dispute.id = disputeId;
        dispute.taskId = taskId;
        dispute.requester = task.requester;
        dispute.agent = task.agent;
        dispute.reason = reason;
        dispute.evidenceCID = evidenceCID;
        dispute.escrowAmount = task.escrowAmount;
        dispute.status = DisputeStatus.Open;
        dispute.openedAt = block.timestamp;
        dispute.totalFees = disputeFee;
        
        task.disputeId = disputeId;
        
        // 选择仲裁员
        string memory expertise = getRequiredExpertise(task.type);
        dispute.arbitrators = arbitratorRegistry.selectArbitratorCommittee(
            expertise,
            5,  // 5 人委员会
            keccak256(abi.encodePacked(block.timestamp))
        );
        
        // 开始证据期
        dispute.status = DisputeStatus.EvidencePeriod;
        dispute.evidenceDeadline = block.timestamp + EVIDENCE_PERIOD;
        
        emit DisputeOpened(disputeId, taskId, msg.sender, reason);
    }
    
    // 提交证据
    function submitEvidence(
        uint256 disputeId,
        bytes memory evidenceCID
    ) external {
        Dispute storage dispute = disputes[disputeId];
        require(dispute.status == DisputeStatus.EvidencePeriod, "Not in evidence period");
        require(
            msg.sender == dispute.requester || msg.sender == dispute.agent,
            "Not a party"
        );
        require(block.timestamp < dispute.evidenceDeadline, "Evidence period ended");
        
        // 存储证据引用
        // 实际证据存储在 IPFS
        emit EvidenceSubmitted(disputeId, msg.sender, evidenceCID);
    }
    
    // 开始审议期
    function startDeliberation(uint256 disputeId) external {
        Dispute storage dispute = disputes[disputeId];
        require(dispute.status == DisputeStatus.EvidencePeriod, "Not in evidence period");
        require(block.timestamp >= dispute.evidenceDeadline, "Evidence period not ended");
        
        dispute.status = DisputeStatus.Deliberation;
        dispute.deliberationDeadline = block.timestamp + DELIBERATION_PERIOD;
        
        emit DeliberationStarted(disputeId, dispute.arbitrators);
    }
    
    // 仲裁员提交裁决
    function submitRuling(
        uint256 disputeId,
        Resolution resolution,
        string memory reasoning,
        bytes32 evidenceHash
    ) external {
        Dispute storage dispute = disputes[disputeId];
        require(dispute.status == DisputeStatus.Deliberation, "Not in deliberation");
        require(block.timestamp < dispute.deliberationDeadline, "Deliberation period ended");
        require(isArbitrator(disputeId, msg.sender), "Not an arbitrator");
        require(dispute.rulings[msg.sender] == bytes32(0), "Already ruled");
        
        // 存储裁决哈希 (保护隐私直到全部提交)
        dispute.rulings[msg.sender] = keccak256(abi.encodePacked(
            resolution,
            reasoning,
            evidenceHash
        ));
        
        emit RulingSubmitted(disputeId, msg.sender);
        
        // 检查是否全部提交
        if (allArbitratorsRuled(disputeId)) {
            finalizeDispute(disputeId);
        }
    }
    
    // 最终化争议
    function finalizeDispute(uint256 disputeId) internal {
        Dispute storage dispute = disputes[disputeId];
        
        // 统计裁决
        uint256 favorRequester = 0;
        uint256 favorAgent = 0;
        uint256 split = 0;
        
        for (uint i = 0; i < dispute.arbitrators.length; i++) {
            // 解码裁决 (简化示例)
            Resolution r = decodeRuling(dispute.rulings[dispute.arbitrators[i]]);
            if (r == Resolution.FavorRequester) favorRequester++;
            else if (r == Resolution.FavorAgent) favorAgent++;
            else if (r == Resolution.Split) split++;
        }
        
        // 多数决
        if (favorRequester > favorAgent && favorRequester > split) {
            dispute.finalResolution = Resolution.FavorRequester;
        } else if (favorAgent > favorRequester && favorAgent > split) {
            dispute.finalResolution = Resolution.FavorAgent;
        } else {
            dispute.finalResolution = Resolution.Split;
        }
        
        dispute.status = DisputeStatus.Resolved;
        
        // 执行资金分配
        executeResolution(disputeId);
        
        // 更新仲裁员表现
        updateArbitratorPerformance(disputeId);
        
        emit DisputeResolved(disputeId, dispute.finalResolution);
    }
    
    // 执行裁决
    function executeResolution(uint256 disputeId) internal {
        Dispute storage dispute = disputes[disputeId];
        
        uint256 arbitratorFees = dispute.totalFees;
        uint256 remaining = dispute.escrowAmount - arbitratorFees;
        
        // 分配给仲裁员
        uint256 feePerArbitrator = arbitratorFees / dispute.arbitrators.length;
        for (uint i = 0; i < dispute.arbitrators.length; i++) {
            usdc.transfer(dispute.arbitrators[i], feePerArbitrator);
        }
        
        // 根据裁决分配剩余资金
        if (dispute.finalResolution == Resolution.FavorRequester) {
            usdc.transfer(dispute.requester, remaining);
        } else if (dispute.finalResolution == Resolution.FavorAgent) {
            usdc.transfer(dispute.agent, remaining);
        } else {
            // 平分
            usdc.transfer(dispute.requester, remaining / 2);
            usdc.transfer(dispute.agent, remaining / 2);
        }
    }
}
```

---

## 4. 经济模型

### 4.1 质押与惩罚

```
┌─────────────────────────────────────────────────────────────────┐
│                      质押要求表                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  角色          最低质押        质押用途                          │
│  ─────────────────────────────────────────                       │
│  Agent         1000 USDC      任务完成保证                       │
│  Worker        500 USDC       服务质量和可用性                   │
│  仲裁员        10000 USDC     公正裁决保证                       │
│  验证者        100 USDC       诚实验证                           │
│                                                                 │
│  惩罚机制:                                                      │
│  ├─ 任务失败:    扣除 10-100% 质押 (根据严重程度)               │
│  ├─ 恶意行为:    扣除 100% 质押 + 列入黑名单                    │
│  ├─ 离线过长:    每日扣除 1% 质押                               │
│  └─ 验证错误:    扣除与奖励相等的质押                           │
│                                                                 │
│  质押收益:                                                      │
│  ├─ 正常参与:    获得任务收入 + 网络奖励                        │
│  ├─ 质押利息:    年化 5-10% (来自网络通胀)                      │
│  └─ 治理权利:    参与协议治理投票                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 费用结构

```solidity
// 费用管理合约
contract FeeManager {
    struct FeeStructure {
        uint256 platformFeeRate;      // 平台手续费 (2%)
        uint256 insuranceFeeRate;     // 保险基金 (0.5%)
        uint256 stakingRewardRate;    // 质押奖励 (0.5%)
        uint256 disputeFeeRate;       // 争议费用 (5%)
        uint256 verificationFeeRate;  // 验证费用 (1%)
    }
    
    FeeStructure public fees;
    
    // 收入分配
    function distributeFees(uint256 amount) internal {
        uint256 platformFee = (amount * fees.platformFeeRate) / 10000;
        uint256 insuranceFee = (amount * fees.insuranceFeeRate) / 10000;
        uint256 stakingReward = (amount * fees.stakingRewardRate) / 10000;
        
        // 平台费用 -> 国库
        treasury.deposit(platformFee);
        
        // 保险费用 -> 保险基金
        insuranceFund.deposit(insuranceFee);
        
        // 质押奖励 -> 奖励池
        stakingRewards.distribute(stakingReward);
        
        // 剩余 -> Agent
        uint256 agentShare = amount - platformFee - insuranceFee - stakingReward;
        // ...
    }
}
```

---

## 5. 治理机制

### 5.1 渐进式去中心化

```
Phase 1: 基金会治理 (0-6 个月)
├─ 核心团队控制关键参数
├─ 社区可以提出建议和反馈
└─ 快速迭代，响应问题

Phase 2: 委员会治理 (6-12 个月)
├─ 选举技术委员会
├─ 重要决策委员会投票
├─ 日常参数社区投票
└─ 逐步放权

Phase 3: DAO 治理 (12 个月+)
├─ 代币持有者投票
├─ 完全去中心化决策
├─ 协议自我进化
└─ 社区完全自治
```

### 5.2 治理合约

```solidity
contract GradienceGovernance {
    struct Proposal {
        uint256 id;
        address proposer;
        string description;
        bytes callData;
        address targetContract;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 startTime;
        uint256 endTime;
        bool executed;
        mapping(address => bool) hasVoted;
    }
    
    mapping(uint256 => Proposal) public proposals;
    mapping(address => uint256) public votingPower; // 基于质押
    
    uint256 public constant VOTING_PERIOD = 7 days;
    uint256 public constant EXECUTION_DELAY = 2 days;
    uint256 public constant QUORUM = 100000 * 1e6; // 100k USDC 等值质押
    
    // 创建提案
    function propose(
        string memory description,
        address target,
        bytes memory callData
    ) external returns (uint256 proposalId) {
        require(votingPower[msg.sender] >= 10000 * 1e6, "Insufficient voting power");
        
        proposalId = nextProposalId++;
        Proposal storage p = proposals[proposalId];
        p.id = proposalId;
        p.proposer = msg.sender;
        p.description = description;
        p.targetContract = target;
        p.callData = callData;
        p.startTime = block.timestamp;
        p.endTime = block.timestamp + VOTING_PERIOD;
        
        emit ProposalCreated(proposalId, msg.sender, description);
    }
    
    // 投票
    function vote(uint256 proposalId, bool support) external {
        Proposal storage p = proposals[proposalId];
        require(block.timestamp < p.endTime, "Voting ended");
        require(!p.hasVoted[msg.sender], "Already voted");
        
        uint256 votes = votingPower[msg.sender];
        require(votes > 0, "No voting power");
        
        if (support) {
            p.forVotes += votes;
        } else {
            p.againstVotes += votes;
        }
        
        p.hasVoted[msg.sender] = true;
        
        emit VoteCast(proposalId, msg.sender, support, votes);
    }
    
    // 执行提案
    function execute(uint256 proposalId) external {
        Proposal storage p = proposals[proposalId];
        require(block.timestamp > p.endTime, "Voting ongoing");
        require(!p.executed, "Already executed");
        require(block.timestamp > p.endTime + EXECUTION_DELAY, "Execution delay");
        
        // 检查通过条件
        uint256 totalVotes = p.forVotes + p.againstVotes;
        require(totalVotes >= QUORUM, "Quorum not reached");
        require(p.forVotes > p.againstVotes, "Not passed");
        require(p.forVotes * 2 > totalVotes, "Not majority");
        
        // 执行
        (bool success, ) = p.targetContract.call(p.callData);
        require(success, "Execution failed");
        
        p.executed = true;
        
        emit ProposalExecuted(proposalId);
    }
}
```

---

## 6. 安全考虑

### 6.1 攻击向量与防御

| 攻击类型 | 描述 | 防御措施 |
|---------|------|---------|
| **女巫攻击** | 创建大量虚假身份 | 质押要求、身份验证 |
| **贿赂攻击** | 贿赂仲裁员/验证者 | 秘密投票、质押惩罚 |
| **审查攻击** | 阻止特定交易 | 去中心化网络、抗审查设计 |
| **长程攻击** | 历史重写 | 检查点机制、质押锁定 |
| ** front-running** | 抢先交易 | 提交-揭示机制、隐私保护 |
| **DDoS** | 网络拥堵 | 速率限制、费用市场 |

### 6.2 应急机制

```solidity
// 紧急暂停合约
contract EmergencyPause {
    address public guardian;
    bool public paused;
    mapping(bytes4 => bool) public pausedFunctions;
    
    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }
    
    // 紧急暂停
    function emergencyPause() external {
        require(
            msg.sender == guardian || isArbitrator(msg.sender),
            "Not authorized"
        );
        paused = true;
        emit EmergencyPaused(msg.sender);
    }
    
    // 选择性暂停功能
    function pauseFunction(bytes4 selector) external {
        require(msg.sender == guardian, "Not guardian");
        pausedFunctions[selector] = true;
    }
    
    // 恢复 (需要多签)
    function unpause(bytes[] memory signatures) external {
        require(verifyMultisig(signatures), "Invalid signatures");
        paused = false;
        emit Unpaused();
    }
}
```

---

## 7. 总结

### 核心机制

```
1. 分层验证
   ├─ 自动验证: 简单任务，即时完成
   ├─ 抽样验证: 中等任务，社区参与
   └─ 人工审核: 高价值任务，专业仲裁

2. 争议仲裁
   ├─ 质押机制: 经济激励诚实行为
   ├─ 委员会制: 多仲裁员避免偏见
   └─ 公开透明: 链上可验证

3. 渐进治理
   ├─ 从基金会到 DAO
   ├─ 社区逐步参与
   └─ 协议自我进化
```

### 关键参数

| 参数 | 值 | 说明 |
|-----|---|------|
| Agent 最低质押 | 1000 USDC | 任务完成保证 |
| 仲裁员最低质押 | 10000 USDC | 公正裁决保证 |
| 平台手续费 | 2% | 协议运营 |
| 争议费用 | 5% | 防止滥用 |
| 投票期 | 7 天 | 充分讨论 |
| 执行延迟 | 2 天 | 安全缓冲 |

---

*本文档持续更新中*
