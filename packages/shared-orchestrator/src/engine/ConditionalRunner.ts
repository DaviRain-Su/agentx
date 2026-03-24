/**
 * ConditionalRunner - 条件执行器
 * 
 * 支持条件分支的工作流执行
 * 根据步骤输出决定后续执行路径
 */

import { DAG } from './DAGBuilder';
import { ExecutionContext, WorkflowStep } from '../types';
import { BaseRunner } from './BaseRunner';

export interface Condition {
  type: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'exists';
  field: string; // 变量路径，如 "step1.output.price"
  value?: unknown;
}

export interface ConditionalBranch {
  condition: Condition;
  targetStepId: string;
}

export class ConditionalRunner extends BaseRunner {
  /**
   * 条件执行
   * 根据条件动态决定执行路径
   */
  async run(dag: DAG, context: ExecutionContext): Promise<{ success: boolean; error?: string }> {
    const { task, workflow } = context;
    const executedSteps = new Set<string>();
    
    // 从入口步骤开始（无依赖的步骤）
    const entrySteps = dag.sorted.filter(stepId => {
      const node = dag.nodes.get(stepId)!;
      return node.dependencies.length === 0;
    });

    // 使用队列管理待执行步骤
    const queue: string[] = [...entrySteps];

    while (queue.length > 0) {
      // 检查任务是否已取消
      const currentTask = await this.stateManager.getTask(task.id);
      if (currentTask?.status === 'cancelled') {
        return { success: false, error: 'Task cancelled' };
      }

      const stepId = queue.shift()!;
      
      // 跳过已执行的步骤
      if (executedSteps.has(stepId)) {
        continue;
      }

      const step = workflow.steps.find(s => s.id === stepId);
      if (!step) {
        return { success: false, error: `Step ${stepId} not found` };
      }

      // 执行步骤
      const result = await this.executeStep(step, context);
      
      // 保存结果
      task.stepResults.push(result);
      task.updatedAt = new Date();
      await this.stateManager.saveTask(task);

      executedSteps.add(stepId);

      // 步骤失败
      if (result.status === 'failed') {
        return { 
          success: false, 
          error: `Step ${stepId} failed: ${result.error}` 
        };
      }

      // 更新变量
      if (result.output !== undefined) {
        context.variables[stepId] = result.output;
      }

      // 确定下一步
      const nextSteps = this.determineNextSteps(step, result, dag, context);
      queue.push(...nextSteps);
    }

    return { success: true };
  }

  /**
   * 确定下一步执行哪些步骤
   * 根据条件判断和依赖关系
   */
  private determineNextSteps(
    currentStep: WorkflowStep,
    result: { output?: unknown },
    dag: DAG,
    context: ExecutionContext
  ): string[] {
    const node = dag.nodes.get(currentStep.id)!;
    const nextSteps: string[] = [];

    for (const dependentId of node.dependents) {
      const dependentNode = dag.nodes.get(dependentId)!;
      
      // 检查依赖是否都已完成
      const allDepsCompleted = dependentNode.dependencies.every(depId => {
        return context.task.stepResults.some(r => r.stepId === depId && r.status === 'success');
      });

      if (allDepsCompleted) {
        // 检查条件（如果步骤有配置条件）
        const dependentStep = context.workflow.steps.find(s => s.id === dependentId)!;
        if (this.evaluateCondition(dependentStep, context)) {
          nextSteps.push(dependentId);
        }
      }
    }

    return nextSteps;
  }

  /**
   * 评估步骤的执行条件
   */
  private evaluateCondition(step: WorkflowStep, context: ExecutionContext): boolean {
    // 从步骤配置中获取条件
    const condition = step.config.condition as Condition | undefined;
    if (!condition) {
      return true; // 无条件，直接执行
    }

    // 获取条件字段的值
    const value = this.getValueFromContext(condition.field, context);

    switch (condition.type) {
      case 'eq':
        return value === condition.value;
      case 'neq':
        return value !== condition.value;
      case 'gt':
        return typeof value === 'number' && typeof condition.value === 'number' && value > condition.value;
      case 'gte':
        return typeof value === 'number' && typeof condition.value === 'number' && value >= condition.value;
      case 'lt':
        return typeof value === 'number' && typeof condition.value === 'number' && value < condition.value;
      case 'lte':
        return typeof value === 'number' && typeof condition.value === 'number' && value <= condition.value;
      case 'contains':
        return typeof value === 'string' && typeof condition.value === 'string' && value.includes(condition.value);
      case 'exists':
        return value !== undefined && value !== null;
      default:
        return true;
    }
  }

  /**
   * 从上下文中获取值
   * 支持路径如 "step1.output.price"
   */
  private getValueFromContext(path: string, context: ExecutionContext): unknown {
    const parts = path.split('.');
    let value: unknown = context.variables;

    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = (value as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return value;
  }
}
