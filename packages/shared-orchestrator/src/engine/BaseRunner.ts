/**
 * BaseRunner - 执行器基类
 * 
 * 提供共享的执行逻辑：
 * - 步骤执行
 * - 人在回路处理
 * - Agent 调用
 */

import { WorkflowStep, ExecutionContext, StepResult, Agent, ConfirmationRequest } from '../types';
import { WorkflowEngineConfig } from './WorkflowEngine';

export abstract class BaseRunner {
  protected stateManager: WorkflowEngineConfig['stateManager'];
  protected humanInLoop: WorkflowEngineConfig['humanInLoop'];
  protected agentExecutor: WorkflowEngineConfig['agentExecutor'];
  protected agentRegistry: WorkflowEngineConfig['agentRegistry'];

  constructor(config: WorkflowEngineConfig) {
    this.stateManager = config.stateManager;
    this.humanInLoop = config.humanInLoop;
    this.agentExecutor = config.agentExecutor;
    this.agentRegistry = config.agentRegistry;
  }

  /**
   * 抽象方法：执行模式特定的逻辑
   */
  abstract run(dag: any, context: ExecutionContext): Promise<{ success: boolean; error?: string }>;

  /**
   * 执行单个步骤
   */
  protected async executeStep(step: WorkflowStep, context: ExecutionContext): Promise<StepResult> {
    const startTime = Date.now();
    
    try {
      // 1. 获取 Agent
      const agent = await this.agentRegistry.getAgent(step.agentId);
      if (!agent) {
        return this.createStepResult(step.id, 'failed', undefined, `Agent ${step.agentId} not found`);
      }

      // 2. 人在回路检查点
      if (step.humanApproval) {
        const confirmed = await this.waitForHumanConfirmation(step, context, agent);
        if (!confirmed) {
          return this.createStepResult(step.id, 'failed', undefined, 'Human confirmation rejected or timeout');
        }
      }

      // 3. 准备输入（从上下文变量中获取依赖步骤的输出）
      const input = this.prepareInput(step, context);

      // 4. 执行 Agent（在 Sandbank 沙盒中）
      const executionResult = await this.agentExecutor.execute(agent, input, step.config);

      if (!executionResult.success) {
        return this.createStepResult(
          step.id, 
          'failed', 
          undefined, 
          executionResult.error || 'Agent execution failed'
        );
      }

      // 5. 成功返回
      return this.createStepResult(
        step.id,
        'success',
        executionResult.output,
        undefined,
        startTime
      );

    } catch (error) {
      return this.createStepResult(
        step.id,
        'failed',
        undefined,
        error instanceof Error ? error.message : 'Unknown error',
        startTime
      );
    }
  }

  /**
   * 等待人在回路确认
   */
  private async waitForHumanConfirmation(
    step: WorkflowStep, 
    context: ExecutionContext,
    agent: Agent
  ): Promise<boolean> {
    const confirmation: ConfirmationRequest = {
      id: `confirm_${context.task.id}_${step.id}`,
      taskId: context.task.id,
      stepId: step.id,
      title: `确认执行: ${step.name}`,
      description: `Agent "${agent.name}" 请求执行 "${step.name}"`,
      details: {
        agentId: agent.id,
        agentName: agent.name,
        stepConfig: step.config,
        input: this.prepareInput(step, context),
        estimatedCost: agent.pricing.perExecution
      },
      timeoutAt: new Date(Date.now() + (step.timeout || 300) * 1000),
      status: 'pending',
      createdAt: new Date()
    };

    // 保存确认请求
    await this.stateManager.saveConfirmation(confirmation);

    // 更新任务状态为等待确认
    context.task.status = 'pending_confirmation';
    context.task.updatedAt = new Date();
    await this.stateManager.saveTask(context.task);

    // 等待用户响应
    return this.humanInLoop.waitForConfirmation(confirmation.id, step.timeout || 300);
  }

  /**
   * 准备步骤输入
   * 从上下文变量中收集依赖步骤的输出
   */
  private prepareInput(step: WorkflowStep, context: ExecutionContext): unknown {
    const input: Record<string, unknown> = {};
    
    // 收集依赖步骤的输出
    for (const depId of step.dependsOn) {
      if (context.variables[depId] !== undefined) {
        input[depId] = context.variables[depId];
      }
    }

    // 如果有单个依赖，直接返回其输出（简化常见情况）
    if (step.dependsOn.length === 1 && Object.keys(input).length === 1) {
      return input[step.dependsOn[0]];
    }

    return input;
  }

  /**
   * 创建步骤结果
   */
  protected createStepResult(
    stepId: string,
    status: StepResult['status'],
    output?: unknown,
    error?: string,
    startTime?: number
  ): StepResult {
    return {
      stepId,
      status,
      output,
      error,
      startedAt: startTime ? new Date(startTime) : undefined,
      completedAt: new Date()
    };
  }
}
