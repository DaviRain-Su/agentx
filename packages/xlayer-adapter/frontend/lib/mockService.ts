/**
 * Mock Service - 模拟合约和 Worker 交互
 * 
 * 用于 Demo 演示，实际使用时替换为真实合约调用
 */

import { ethers } from "ethers";

// Mock 工作流定义
export interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  executionMode: "sequential" | "parallel" | "conditional";
  createdAt: Date;
}

export interface WorkflowStep {
  id: string;
  agentId: string;
  name: string;
  description?: string;
  config: Record<string, unknown>;
  dependsOn: string[];
  humanApproval?: boolean;
  timeout?: number;
}

// Mock 任务
export interface Task {
  id: string;
  workflowId: string;
  workflowName: string;
  status: "created" | "pending_confirmation" | "executing" | "completed" | "failed" | "cancelled";
  currentStepIndex: number;
  stepResults: StepResult[];
  totalSteps: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface StepResult {
  stepId: string;
  stepName: string;
  status: "pending" | "success" | "failed" | "skipped";
  output?: Record<string, unknown> | string | number | boolean | null;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

// Mock 确认请求（人在回路）
export interface ConfirmationRequest {
  id: string;
  taskId: string;
  stepId: string;
  stepName: string;
  title: string;
  description: string;
  details: Record<string, unknown>;
  timeoutAt: Date;
  status: "pending" | "confirmed" | "rejected" | "timeout";
}

// 模拟工作流模板
export const MOCK_WORKFLOWS: Workflow[] = [
  {
    id: "wf-1",
    name: "ETH Price Alert & Buy",
    description: "Monitor ETH price and execute buy when condition is met",
    executionMode: "sequential",
    createdAt: new Date("2024-03-23"),
    steps: [
      {
        id: "step-1",
        agentId: "price-monitor",
        name: "Monitor ETH Price",
        description: "Get current ETH price from CoinGecko",
        config: { token: "ethereum", source: "coingecko" },
        dependsOn: [],
        humanApproval: false,
        timeout: 60,
      },
      {
        id: "step-2",
        agentId: "condition-eval",
        name: "Evaluate Condition",
        description: "Check if price < $1800",
        config: { condition: "price < 1800", operator: "<", threshold: 1800 },
        dependsOn: ["step-1"],
        humanApproval: true,
        timeout: 300,
      },
      {
        id: "step-3",
        agentId: "trade-executor",
        name: "Execute Trade",
        description: "Buy 0.1 ETH",
        config: { action: "buy", token: "ETH", amount: "0.1" },
        dependsOn: ["step-2"],
        humanApproval: true,
        timeout: 300,
      },
    ],
  },
  {
    id: "wf-2",
    name: "BTC Trend Analysis",
    description: "Analyze BTC trend and send notification",
    executionMode: "sequential",
    createdAt: new Date("2024-03-23"),
    steps: [
      {
        id: "step-1",
        agentId: "price-monitor",
        name: "Get BTC Price",
        description: "Fetch BTC price from Binance",
        config: { token: "bitcoin", source: "binance" },
        dependsOn: [],
        humanApproval: false,
        timeout: 60,
      },
      {
        id: "step-2",
        agentId: "condition-eval",
        name: "Trend Analysis",
        description: "Check 24h change > 5%",
        config: { condition: "change > 5%", operator: ">", threshold: 5 },
        dependsOn: ["step-1"],
        humanApproval: false,
        timeout: 60,
      },
    ],
  },
];

// Mock 状态存储（内存中）
class MockService {
  private tasks: Task[] = [];
  private confirmations: ConfirmationRequest[] = [];
  private listeners: Map<string, Function[]> = new Map();

  // 获取所有工作流模板
  getWorkflows(): Workflow[] {
    return MOCK_WORKFLOWS;
  }

  getWorkflowById(id: string): Workflow | undefined {
    return MOCK_WORKFLOWS.find((w) => w.id === id);
  }

  // 创建任务
  async createTask(workflowId: string): Promise<Task> {
    const workflow = this.getWorkflowById(workflowId);
    if (!workflow) throw new Error("Workflow not found");

    const task: Task = {
      id: `task-${Date.now()}`,
      workflowId: workflow.id,
      workflowName: workflow.name,
      status: "created",
      currentStepIndex: 0,
      stepResults: [],
      totalSteps: workflow.steps.length,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.tasks.push(task);
    
    // 模拟启动执行
    setTimeout(() => this.executeTask(task.id), 1000);

    return task;
  }

  // 获取任务
  getTask(taskId: string): Task | undefined {
    return this.tasks.find((t) => t.id === taskId);
  }

  getAllTasks(): Task[] {
    return this.tasks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // 执行任务（模拟 Worker 执行）
  private async executeTask(taskId: string): Promise<void> {
    const task = this.getTask(taskId);
    if (!task) return;

    const workflow = this.getWorkflowById(task.workflowId);
    if (!workflow) return;

    task.status = "executing";
    task.updatedAt = new Date();
    this.notify("taskUpdated", task);

    // 按顺序执行步骤
    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      
      // 检查是否需要人工确认
      if (step.humanApproval) {
        task.status = "pending_confirmation";
        task.currentStepIndex = i;
        task.updatedAt = new Date();
        this.notify("taskUpdated", task);

        // 创建确认请求
        const confirmation = await this.createConfirmation(task, step);
        
        // 等待确认（模拟）
        const confirmed = await this.waitForConfirmation(confirmation.id);
        
        if (!confirmed) {
          task.status = "cancelled";
          task.error = "User rejected or timeout";
          task.updatedAt = new Date();
          this.notify("taskUpdated", task);
          return;
        }
      }

      // 执行步骤
      task.currentStepIndex = i;
      const result = await this.executeStep(step);
      task.stepResults.push(result);
      task.updatedAt = new Date();
      this.notify("taskUpdated", task);

      // 步骤失败
      if (result.status === "failed") {
        task.status = "failed";
        task.error = result.error;
        task.updatedAt = new Date();
        this.notify("taskUpdated", task);
        return;
      }
    }

    // 完成
    task.status = "completed";
    task.completedAt = new Date();
    task.updatedAt = new Date();
    this.notify("taskUpdated", task);
  }

  // 执行单个步骤（模拟 Agent 执行）
  private async executeStep(step: WorkflowStep): Promise<StepResult> {
    const startedAt = new Date();
    
    // 模拟执行时间
    await this.delay(2000 + Math.random() * 3000);

    // 模拟 Agent 执行结果
    let output: Record<string, unknown> | null = null;
    let status: "success" | "failed" = "success";
    let error: string | undefined;

    try {
      switch (step.agentId) {
        case "price-monitor":
          output = await this.mockPriceMonitor(step.config);
          break;
        case "condition-eval":
          output = await this.mockConditionEval(step.config);
          break;
        case "trade-executor":
          output = await this.mockTradeExecutor(step.config);
          break;
        default:
          throw new Error(`Unknown agent: ${step.agentId}`);
      }
    } catch (e) {
      status = "failed";
      error = e instanceof Error ? e.message : "Unknown error";
    }

    return {
      stepId: step.id,
      stepName: step.name,
      status,
      output,
      error,
      startedAt,
      completedAt: new Date(),
    };
  }

  // 模拟价格监控 Agent
  private async mockPriceMonitor(config: Record<string, unknown>): Promise<Record<string, unknown>> {
    const token = config.token as string;
    const source = config.source as string;
    
    // 模拟价格数据
    const prices: Record<string, number> = {
      ethereum: 1750 + Math.random() * 200,
      bitcoin: 42000 + Math.random() * 5000,
    };

    return {
      token: token.toUpperCase(),
      price: prices[token] || 100,
      source,
      timestamp: Date.now(),
      currency: "USD",
    };
  }

  // 模拟条件评估 Agent
  private async mockConditionEval(config: Record<string, unknown>): Promise<Record<string, unknown>> {
    const condition = config.condition as string;
    const operator = config.operator as string;
    const threshold = config.threshold as number;
    
    // 模拟价格（应该从上一步获取，这里简化）
    const price = 1750;
    
    let result = false;
    switch (operator) {
      case "<":
        result = price < threshold;
        break;
      case ">":
        result = price > threshold;
        break;
      case "<=":
        result = price <= threshold;
        break;
      case ">=":
        result = price >= threshold;
        break;
    }

    return {
      condition,
      price,
      threshold,
      operator,
      result,
      shouldExecute: result,
    };
  }

  // 模拟交易执行 Agent
  private async mockTradeExecutor(config: Record<string, unknown>): Promise<Record<string, unknown>> {
    const action = config.action as string;
    const token = config.token as string;
    const amount = config.amount as string;

    // 模拟交易数据
    return {
      executed: true,
      action,
      token,
      amount,
      price: 1750,
      estimatedValue: parseFloat(amount) * 1750,
      tradeData: {
        requiresSignature: true,
        calldata: "0x...",
        to: "0x...",
        value: action === "buy" ? "1000000000000000" : "0",
      },
    };
  }

  // 创建确认请求（人在回路）
  private async createConfirmation(task: Task, step: WorkflowStep): Promise<ConfirmationRequest> {
    const confirmation: ConfirmationRequest = {
      id: `conf-${Date.now()}`,
      taskId: task.id,
      stepId: step.id,
      stepName: step.name,
      title: `Approve ${step.name}`,
      description: step.description || `Step ${step.id} requires your approval`,
      details: {
        workflowName: task.workflowName,
        stepIndex: task.currentStepIndex + 1,
        totalSteps: task.totalSteps,
      },
      timeoutAt: new Date(Date.now() + (step.timeout || 300) * 1000),
      status: "pending",
    };

    this.confirmations.push(confirmation);
    this.notify("confirmationCreated", confirmation);
    
    return confirmation;
  }

  // 等待确认（模拟）
  private async waitForConfirmation(confirmationId: string): Promise<boolean> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const confirmation = this.confirmations.find((c) => c.id === confirmationId);
        if (confirmation) {
          if (confirmation.status === "confirmed") {
            clearInterval(checkInterval);
            resolve(true);
          } else if (confirmation.status === "rejected" || confirmation.status === "timeout") {
            clearInterval(checkInterval);
            resolve(false);
          }
        }
      }, 500);

      // 5分钟超时
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve(false);
      }, 5 * 60 * 1000);
    });
  }

  // 响应确认（用户操作）
  respondToConfirmation(confirmationId: string, approved: boolean): void {
    const confirmation = this.confirmations.find((c) => c.id === confirmationId);
    if (confirmation && confirmation.status === "pending") {
      confirmation.status = approved ? "confirmed" : "rejected";
      this.notify("confirmationUpdated", confirmation);
    }
  }

  // 获取待处理的确认
  getPendingConfirmations(): ConfirmationRequest[] {
    return this.confirmations.filter((c) => c.status === "pending");
  }

  // 事件监听
  subscribe(event: string, callback: Function): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);

    return () => {
      const callbacks = this.listeners.get(event);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) callbacks.splice(index, 1);
      }
    };
  }

  private notify(event: string, data: unknown): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((cb) => cb(data));
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// 单例导出
export const mockService = new MockService();
