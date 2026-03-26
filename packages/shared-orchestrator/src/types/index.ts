/**
 * AgentX Shared Orchestrator - Core Types
 * 
 * Provides workflow orchestration, human-in-the-loop, and state management
 */

// ============================================================================
// Agent Types
// ============================================================================

export type AgentId = string;
export type AgentLevel = 'basic' | 'standard' | 'premium';

export interface Agent {
  id: AgentId;
  name: string;
  description: string;
  level: AgentLevel;
  capabilities: string[];
  config: Record<string, unknown>;
  pricing: {
    perExecution: number; // USD
    currency: string;
  };
}

export interface AgentRegistry {
  getAgent(id: AgentId): Promise<Agent | null>;
  listAgents(): Promise<Agent[]>;
  registerAgent(agent: Agent): Promise<void>;
}

// ============================================================================
// Workflow Types
// ============================================================================

export type WorkflowId = string;
export type TaskId = string;
export type StepId = string;

export type ExecutionMode = 'sequential' | 'parallel' | 'conditional';

export interface WorkflowStep {
  id: StepId;
  agentId: AgentId;
  name: string;
  description?: string;
  config: Record<string, unknown>;
  dependsOn: StepId[];
  humanApproval?: boolean; // 人在回路检查点
  timeout?: number; // 秒，默认300（5分钟）
}

export interface Workflow {
  id: WorkflowId;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  executionMode: ExecutionMode;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowDefinition {
  name: string;
  description?: string;
  steps: Omit<WorkflowStep, 'id'>[];
  executionMode: ExecutionMode;
}

// ============================================================================
// Task Execution Types
// ============================================================================

export type TaskStatus = 
  | 'created'
  | 'pending_confirmation' // 人在回路等待
  | 'executing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout';

export interface Task {
  id: TaskId;
  workflowId: WorkflowId;
  status: TaskStatus;
  currentStepIndex: number;
  stepResults: StepResult[];
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface StepResult {
  stepId: StepId;
  status: 'pending' | 'success' | 'failed' | 'skipped';
  output?: unknown;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface ExecutionContext {
  task: Task;
  workflow: Workflow;
  variables: Record<string, unknown>; // 步骤间传递的变量
}

// ============================================================================
// Human-in-the-Loop Types
// ============================================================================

export type ConfirmationStatus = 'pending' | 'confirmed' | 'rejected' | 'timeout';

export interface ConfirmationRequest {
  id: string;
  taskId: TaskId;
  stepId: StepId;
  title: string;
  description: string;
  details: Record<string, unknown>; // 步骤相关信息（如条件评估结果）
  timeoutAt: Date;
  status: ConfirmationStatus;
  createdAt: Date;
  respondedAt?: Date;
}

export interface HumanInLoopConfig {
  defaultTimeout: number; // 秒，默认300（5分钟）
  maxTimeout: number; // 秒，默认600（10分钟）
}

// ============================================================================
// Payment Types
// ============================================================================

export type PaymentStatus = 'pending' | 'escrowed' | 'released' | 'refunded' | 'failed';

export interface Payment {
  id: string;
  taskId: TaskId;
  amount: number; // USD
  currency: string;
  status: PaymentStatus;
  breakdown: PaymentBreakdown[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentBreakdown {
  agentId: AgentId;
  amount: number;
  description: string;
}

export interface PaymentAdapter {
  escrow(taskId: TaskId, amount: number, breakdown: PaymentBreakdown[]): Promise<string>; // 返回 escrow ID
  release(escrowId: string): Promise<void>;
  refund(escrowId: string): Promise<void>;
}

// ============================================================================
// State Management Types
// ============================================================================

export interface StateManager {
  // Task 状态
  getTask(taskId: TaskId): Promise<Task | null>;
  saveTask(task: Task): Promise<void>;
  
  // 执行上下文
  getContext(taskId: TaskId): Promise<ExecutionContext | null>;
  saveContext(context: ExecutionContext): Promise<void>;
  
  // 人在回路状态
  getConfirmation(confirmationId: string): Promise<ConfirmationRequest | null>;
  saveConfirmation(confirmation: ConfirmationRequest): Promise<void>;
}

// ============================================================================
// Orchestrator Result Types
// ============================================================================

export interface WorkflowResult {
  success: boolean;
  task: Task;
  totalCost: number;
  executedSteps: number;
  failedSteps: number;
  error?: string;
}

export interface OrchestratorError {
  code: string;
  message: string;
  stepId?: StepId;
  cause?: unknown;
}

// ============================================================================
// Sandbank Integration Types
// ============================================================================

export interface SandbankConfig {
  apiKey: string;
  endpoint: string;
  timeout: number;
}

export interface SandbankExecutionResult {
  success: boolean;
  output?: unknown;
  error?: string;
  executionTime: number;
}

export interface AgentExecutor {
  execute(agent: Agent, input: unknown, config: Record<string, unknown>): Promise<SandbankExecutionResult>;
}
