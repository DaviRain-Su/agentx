/**
 * WorkflowEngine - 工作流编排引擎
 * 
 * 功能:
 * - 解析和执行工作流
 * - 支持顺序、并行、条件三种执行模式
 * - 集成人在回路检查点
 * - 状态持久化
 */

import {
  Workflow,
  Task,
  TaskId,
  TaskStatus,
  ExecutionContext,
  WorkflowResult,
  StepResult,
  Agent,
  OrchestratorError,
  ConfirmationRequest
} from '../types';
import { DAGBuilder, DAG } from './DAGBuilder';
import { SequentialRunner } from './SequentialRunner';
import { ParallelRunner } from './ParallelRunner';
import { ConditionalRunner } from './ConditionalRunner';
import { HumanInLoopManager } from '../human-in-loop/ConfirmationManager';
import { StateManager } from '../state/StateManager';
import { AgentExecutor } from '../types';

export interface WorkflowEngineConfig {
  stateManager: StateManager;
  humanInLoop: HumanInLoopManager;
  agentExecutor: AgentExecutor;
  agentRegistry: {
    getAgent(id: string): Promise<Agent | null>;
  };
}

export class WorkflowEngine {
  private dagBuilder = new DAGBuilder();
  private sequentialRunner: SequentialRunner;
  private parallelRunner: ParallelRunner;
  private conditionalRunner: ConditionalRunner;

  constructor(private config: WorkflowEngineConfig) {
    this.sequentialRunner = new SequentialRunner(config);
    this.parallelRunner = new ParallelRunner(config);
    this.conditionalRunner = new ConditionalRunner(config);
  }

  /**
   * 创建并启动工作流任务
   */
  async createTask(workflow: Workflow, initialVariables: Record<string, unknown> = {}): Promise<Task> {
    // 验证工作流
    const dag = this.dagBuilder.build(workflow);
    
    const task: Task = {
      id: this.generateTaskId(),
      workflowId: workflow.id,
      status: 'created',
      currentStepIndex: 0,
      stepResults: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // 初始化执行上下文
    const context: ExecutionContext = {
      task,
      workflow,
      variables: initialVariables
    };

    // 保存初始状态
    await this.config.stateManager.saveTask(task);
    await this.config.stateManager.saveContext(context);

    return task;
  }

  /**
   * 执行任务
   */
  async executeTask(taskId: TaskId): Promise<WorkflowResult> {
    const context = await this.config.stateManager.getContext(taskId);
    if (!context) {
      throw this.createError('TASK_NOT_FOUND', `Task ${taskId} not found`);
    }

    const { task, workflow } = context;
    
    // 更新状态为执行中
    task.status = 'executing';
    task.updatedAt = new Date();
    await this.config.stateManager.saveTask(task);

    try {
      // 根据执行模式选择 runner
      const result = await this.executeByMode(workflow, context);
      
      // 更新最终状态
      task.status = result.success ? 'completed' : 'failed';
      task.completedAt = new Date();
      task.updatedAt = new Date();
      await this.config.stateManager.saveTask(task);

      return {
        success: result.success,
        task,
        totalCost: this.calculateTotalCost(task),
        executedSteps: task.stepResults.filter(r => r.status === 'success').length,
        failedSteps: task.stepResults.filter(r => r.status === 'failed').length,
        error: result.error
      };
    } catch (error) {
      // 执行异常
      task.status = 'failed';
      task.updatedAt = new Date();
      await this.config.stateManager.saveTask(task);

      return {
        success: false,
        task,
        totalCost: this.calculateTotalCost(task),
        executedSteps: task.stepResults.filter(r => r.status === 'success').length,
        failedSteps: task.stepResults.filter(r => r.status === 'failed').length + 1,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 根据执行模式选择 runner
   */
  private async executeByMode(
    workflow: Workflow,
    context: ExecutionContext
  ): Promise<{ success: boolean; error?: string }> {
    const dag = this.dagBuilder.build(workflow);

    switch (workflow.executionMode) {
      case 'sequential':
        return this.sequentialRunner.run(dag, context);
      
      case 'parallel':
        return this.parallelRunner.run(dag, context);
      
      case 'conditional':
        return this.conditionalRunner.run(dag, context);
      
      default:
        throw this.createError('INVALID_MODE', `Unknown execution mode: ${workflow.executionMode}`);
    }
  }

  /**
   * 处理人在回路确认响应
   */
  async handleConfirmation(
    confirmationId: string,
    decision: 'confirm' | 'reject'
  ): Promise<void> {
    const confirmation = await this.config.stateManager.getConfirmation(confirmationId);
    if (!confirmation) {
      throw this.createError('CONFIRMATION_NOT_FOUND', `Confirmation ${confirmationId} not found`);
    }

    if (confirmation.status !== 'pending') {
      throw this.createError('CONFIRMATION_ALREADY_RESPONDED', `Confirmation already ${confirmation.status}`);
    }

    // 更新确认状态
    confirmation.status = decision === 'confirm' ? 'confirmed' : 'rejected';
    confirmation.respondedAt = new Date();
    await this.config.stateManager.saveConfirmation(confirmation);

    // 通知 HumanInLoopManager
    this.config.humanInLoop.resolveConfirmation(confirmationId, decision);
  }

  /**
   * 取消任务
   */
  async cancelTask(taskId: TaskId): Promise<void> {
    const task = await this.config.stateManager.getTask(taskId);
    if (!task) {
      throw this.createError('TASK_NOT_FOUND', `Task ${taskId} not found`);
    }

    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      throw this.createError('TASK_ALREADY_FINISHED', `Task already ${task.status}`);
    }

    task.status = 'cancelled';
    task.updatedAt = new Date();
    await this.config.stateManager.saveTask(task);
  }

  /**
   * 生成唯一任务 ID
   */
  private generateTaskId(): TaskId {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 计算任务总成本
   */
  private calculateTotalCost(task: Task): number {
    // TODO: 根据实际执行的 Agent 和定价计算
    return task.stepResults
      .filter(r => r.status === 'success')
      .length * 0.5; // 临时计算
  }

  /**
   * 创建错误对象
   */
  private createError(code: string, message: string, cause?: unknown): OrchestratorError {
    return { code, message, cause };
  }
}
