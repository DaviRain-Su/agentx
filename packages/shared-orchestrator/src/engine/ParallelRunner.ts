/**
 * ParallelRunner - 并行执行器
 * 
 * 按依赖分组，无依赖的步骤并行执行
 * 使用 Promise.all 实现真正的并行
 */

import { DAG } from './DAGBuilder';
import { ExecutionContext, StepResult, WorkflowStep } from '../types';
import { BaseRunner } from './BaseRunner';

export class ParallelRunner extends BaseRunner {
  /**
   * 并行执行步骤
   * 按依赖分组，每组内部并行
   */
  async run(dag: DAG, context: ExecutionContext): Promise<{ success: boolean; error?: string }> {
    const { task, workflow } = context;
    
    // 获取并行执行组
    const groups = this.getParallelGroups(dag);
    
    // 按组顺序执行，组内并行
    for (const group of groups) {
      // 检查任务是否已取消
      const currentTask = await this.stateManager.getTask(task.id);
      if (currentTask?.status === 'cancelled') {
        return { success: false, error: 'Task cancelled' };
      }

      // 获取组内步骤
      const steps = group.map(stepId => workflow.steps.find(s => s.id === stepId)!);
      
      // 并行执行组内所有步骤
      const results = await Promise.all(
        steps.map(step => this.executeStep(step, context))
      );

      // 保存结果
      for (const result of results) {
        task.stepResults.push(result);
      }
      task.updatedAt = new Date();
      await this.stateManager.saveTask(task);

      // 检查是否有失败的步骤
      const failedResult = results.find(r => r.status === 'failed');
      if (failedResult) {
        return { 
          success: false, 
          error: `Parallel execution failed: ${failedResult.error}` 
        };
      }

      // 更新变量供后续组使用
      for (let i = 0; i < steps.length; i++) {
        const output = results[i].output;
        if (output !== undefined) {
          context.variables[steps[i].id] = output;
        }
      }
    }

    return { success: true };
  }

  /**
   * 获取并行执行组
   * 同一组的步骤可以并行执行（无相互依赖）
   */
  private getParallelGroups(dag: DAG): string[][] {
    const groups: string[][] = [];
    const completed = new Set<string>();
    const remaining = new Set(dag.sorted);

    while (remaining.size > 0) {
      // 找到所有依赖已完成的步骤
      const group: string[] = [];
      for (const stepId of remaining) {
        const node = dag.nodes.get(stepId)!;
        const allDepsCompleted = node.dependencies.every(depId => completed.has(depId));
        if (allDepsCompleted) {
          group.push(stepId);
        }
      }

      if (group.length === 0) {
        throw new Error('Cannot find executable steps, possible dependency error');
      }

      groups.push(group);
      for (const stepId of group) {
        completed.add(stepId);
        remaining.delete(stepId);
      }
    }

    return groups;
  }
}
