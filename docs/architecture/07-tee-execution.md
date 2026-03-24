# TEE (Trusted Execution Environment) Agent Execution

## 概述

TEE 提供硬件级别的隔离和验证，确保 Agent 代码在受保护的环境中执行，即使节点运营者也无法篡改执行过程或窃取敏感数据。

## 支持的 TEE 平台

### 1. Phala Network
- **类型**: 去中心化 TEE 云计算网络
- **硬件**: Intel SGX
- **特点**: 
  - 链上验证执行证明
  - 去中心化节点网络
  - 与 Polkadot 生态集成
- **适用**: 高价值任务、隐私敏感计算

### 2. EG Network (Edgeless)
- **类型**: 企业级 TEE 云
- **硬件**: Intel SGX
- **特点**:
  - Kubernetes 集成
  - 按需 TEE 实例
  - 与以太坊兼容
- **适用**: 企业部署、合规要求

### 3. Marlin (原定为 Oyster)
- **类型**: TEE 验证的链下计算
- **硬件**: AWS Nitro Enclaves
- **特点**:
  - 自动验证执行证明
  - 按秒计费
  - 与 EVM 链集成
- **适用**: DeFi 策略、MEV 保护

## 架构设计

### TEE Runtime 抽象

```typescript
interface TEERuntimeConfig extends RuntimeConfig {
  tee: {
    provider: 'phala' | 'eg' | 'marlin' | 'custom';
    enclaveKey?: string;      // TEE 内公钥
    remoteAttestation?: string; // 远程证明
    maxCost?: string;         // 最大执行成本
  };
}

abstract class TEERuntime extends AgentRuntime {
  // TEE 特有功能
  abstract generateAttestation(): Promise<AttestationReport>;
  abstract verifyAttestation(report: AttestationReport): Promise<boolean>;
  abstract getQuote(): Promise<TEEQuote>;
  
  // 密封存储（仅 TEE 内可解密）
  abstract sealData(data: Uint8Array): Promise<SealedData>;
  abstract unsealData(sealed: SealedData): Promise<Uint8Array>;
}
```

### Phala Runtime 实现

```typescript
class PhalaRuntime extends TEERuntime {
  private pruntime: PinkPruntime;
  private contractId: string;
  
  async initialize(): Promise<void> {
    // 连接到 Phala 网络
    this.pruntime = await PinkPruntime.create({
      clusterId: process.env.PHALA_CLUSTER_ID,
      pruntimeEndpoint: process.env.PHALA_PRUNTIME_URL,
    });
    
    // 部署或连接到现有合约
    this.contractId = await this.deployAgentContract();
  }
  
  async executeAgent<T>(
    agent: AgentDefinition,
    input: any,
    context: ExecutionContext
  ): Promise<ExecutionResult<T>> {
    // 1. 将 Agent 代码上传到 Phala 存储
    const codeHash = await this.uploadToPhalaStorage(agent.entryPoint);
    
    // 2. 在 TEE 中执行
    const result = await this.pruntime.call({
      contract: this.contractId,
      method: 'executeAgent',
      args: [codeHash, input, context],
    });
    
    // 3. 获取执行证明
    const proof = await this.getExecutionProof(context.taskId);
    
    return {
      status: 'success',
      output: result.output,
      logs: result.logs,
      executionTime: result.executionTime,
      memoryUsed: result.memoryUsed,
      proof: {
        tee: 'phala',
        attestation: proof.attestation,
        blockNumber: proof.blockNumber,
        txHash: proof.txHash,
      },
    };
  }
  
  async generateAttestation(): Promise<AttestationReport> {
    // 获取 SGX 远程证明
    return this.pruntime.getAttestation();
  }
  
  // 密封存储用于保存私钥等敏感数据
  async sealData(data: Uint8Array): Promise<SealedData> {
    return this.pruntime.seal(data);
  }
}
```

### 使用场景

#### 场景 1: 隐私保护交易
```typescript
// 在 TEE 中执行，节点运营者看不到策略
const privateStrategy = {
  code: `
    const wallet = await unsealWallet(); // TEE 内解封
    const signal = await analyzeMarket();
    if (signal.confidence > 0.8) {
      return executeTrade(wallet, signal);
    }
  `,
  tee: {
    provider: 'phala',
    sealedWallet: '0x...', // 加密存储的私钥
  },
};
```

#### 场景 2: 可验证随机数
```typescript
// TEE 生成可验证的链下随机数
const randomGenerator = {
  code: `
    const random = crypto.getRandomValues(32);
    const proof = await generateProof(random);
    return { random, proof };
  `,
  tee: {
    provider: 'marlin',
    verifyOnChain: true,
  },
};
```

#### 场景 3: 多方计算 (MPC)
```typescript
// 多个 TEE 节点共同计算，无单点泄漏
const mpcAggregator = {
  code: `
    const share = await unsealMyShare();
    const result = await aggregateShares([share, fromOtherTEE1, fromOtherTEE2]);
    return result;
  `,
  tee: {
    provider: 'phala',
    mode: 'mpc',
    parties: 3,
  },
};
```

## 证明验证

### 链上验证合约

```solidity
contract TEEProofVerifier {
    mapping(bytes32 => bool) public validAttestations;
    
    // Phala 证明验证
    function verifyPhalaProof(
        bytes32 taskId,
        bytes memory attestation,
        bytes memory output
    ) public returns (bool) {
        // 验证 SGX 证明
        require(verifySGXQuote(attestation), "Invalid SGX quote");
        
        // 验证执行结果哈希
        bytes32 outputHash = keccak256(output);
        require(
            verifyPhalaSignature(taskId, outputHash, attestation),
            "Invalid Phala signature"
        );
        
        validAttestations[taskId] = true;
        return true;
    }
    
    // Marlin 证明验证
    function verifyMarlinProof(
        bytes32 taskId,
        bytes memory oysterProof
    ) public returns (bool) {
        // 调用 Marlin 验证合约
        return IMarlinVerifier(MARLIN_VERIFIER).verify(oysterProof);
    }
}
```

## 运行时工厂更新

```typescript
class RuntimeFactory {
  static create(type: RuntimeType | 'tee', config: RuntimeConfig): AgentRuntime {
    if (type === 'tee') {
      const teeConfig = config as TEERuntimeConfig;
      switch (teeConfig.tee.provider) {
        case 'phala':
          return new PhalaRuntime(teeConfig);
        case 'eg':
          return new EGRuntime(teeConfig);
        case 'marlin':
          return new MarlinRuntime(teeConfig);
        default:
          throw new Error(`Unknown TEE provider: ${teeConfig.tee.provider}`);
      }
    }
    // ... existing code
  }
}
```

## 性能对比

| 特性 | 普通 Worker | TEE (Phala) | TEE (Marlin) |
|------|-------------|-------------|--------------|
| **启动延迟** | <1ms | 2-5s | 1-3s |
| **执行开销** | 1x | 1.1-1.3x | 1.05-1.1x |
| **内存限制** | 128MB | 4GB | 根据实例 |
| **验证成本** | 无 | ~50k gas | ~30k gas |
| **隐私保证** | 信任运营者 | 硬件保证 | 硬件保证 |
| **去中心化** | 中等 | 高 | 低 |

## 实现路线图

### Phase 1: 基础 TEE 支持
- [ ] Phala Runtime 实现
- [ ] 基础密封存储
- [ ] 链上证明验证

### Phase 2: 多平台支持
- [ ] EG Network 集成
- [ ] Marlin 集成
- [ ] 统一证明格式

### Phase 3: 高级功能
- [ ] TEE 间安全通信
- [ ] MPC 支持
- [ ] 密钥托管服务

## 代码实现

### Phala Runtime (简化版)

```typescript
// packages/shared-orchestrator/src/runtime/PhalaRuntime.ts
export class PhalaRuntime extends TEERuntime {
  async executeAgent(agent, input, context) {
    // 上传代码到 Phala
    const contract = await this.deployToPhala(agent);
    
    // 执行并获取证明
    const { output, proof } = await contract.execute(input);
    
    return {
      status: 'success',
      output,
      proof: {
        type: 'phala',
        attestation: proof.attestation,
        blockHash: proof.blockHash,
      },
    };
  }
  
  async sealData(data: Uint8Array): Promise<SealedData> {
    // 使用 Phala 的 seal 功能
    return this.pruntime.seal(data);
  }
  
  async unsealData(sealed: SealedData): Promise<Uint8Array> {
    // 仅在 TEE 内可解密
    return this.pruntime.unseal(sealed);
  }
}
```

---

*Design Date: 2025-03-24*
*Status: Draft - TEE integration for high-security tasks*
