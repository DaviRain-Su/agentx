/**
 * SequentialRunner - 顺序执行器
 * 
 * 按拓扑排序顺序依次执行每个步骤
 */

import { DAG } from './DAGBuilder';
import { ExecutionContext, StepResult, TaskStatus } from '../types';
import { BaseRunner } from './BaseRunner';

export class SequentialRunner extends BaseRunner {
  /**
   * 顺序执行所有步骤
   */
  async run(dag: DAG, context: ExecutionContext): Promise<{ success: boolean; error?: string }> {
    const { task, workflow } = context;
    
    // 按拓扑排序顺序执行
    for (const stepId of dag.sorted) {
      const step = workflow.steps.find(s => s.id === stepId)!;
      
      // 检查任务是否已取消
      const currentTask = await this.stateManager.getTask(task.id);
      if (currentTask?.status === 'cancelled') {
        return { success: false, error: 'Task cancelled' };
      }

      // 执行步骤
      const result = await this.executeStep(step, context);
      
      // 保存结果
      task.stepResults.push(result);
      task.currentStepIndex++;
      task.updatedAt = new Date();
      await this.stateManager.saveTask(task);

      // 步骤失败，终止执行
      if (result.status === 'failed') {
        return { 
          success: false, 
          error: `Step ${stepId} failed: ${result.error}` 
        };
      }

      // 更新变量供后续步骤使用
      if (result.output !== undefined) {
        context.variables[stepId] = result.output;
      }
    }

    return { success: true };
  }
}
