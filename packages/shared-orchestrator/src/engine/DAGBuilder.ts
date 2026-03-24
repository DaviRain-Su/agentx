/**
 * DAG Builder - 构建和验证工作流依赖图
 * 
 * 功能:
 * - 从工作流步骤构建 DAG
 * - 检测循环依赖
 * - 拓扑排序
 */

import { Workflow, WorkflowStep, StepId } from '../types';

export interface DAGNode {
  stepId: StepId;
  dependencies: StepId[];
  dependents: StepId[];
}

export interface DAG {
  nodes: Map<StepId, DAGNode>;
  sorted: StepId[]; // 拓扑排序结果
}

export class DAGBuilder {
  /**
   * 从工作流构建 DAG
   */
  build(workflow: Workflow): DAG {
    const nodes = new Map<StepId, DAGNode>();
    
    // 初始化所有节点
    for (const step of workflow.steps) {
      nodes.set(step.id, {
        stepId: step.id,
        dependencies: [...step.dependsOn],
        dependents: []
      });
    }
    
    // 构建反向依赖（dependents）
    for (const step of workflow.steps) {
      for (const depId of step.dependsOn) {
        const depNode = nodes.get(depId);
        if (!depNode) {
          throw new Error(`Dependency step ${depId} not found for step ${step.id}`);
        }
        depNode.dependents.push(step.id);
      }
    }
    
    // 检测循环依赖
    this.detectCycle(nodes);
    
    // 拓扑排序
    const sorted = this.topologicalSort(nodes);
    
    return { nodes, sorted };
  }
  
  /**
   * 使用 DFS 检测循环依赖
   */
  private detectCycle(nodes: Map<StepId, DAGNode>): void {
    const visited = new Set<StepId>();
    const recursionStack = new Set<StepId>();
    
    const dfs = (stepId: StepId, path: StepId[]): void => {
      if (recursionStack.has(stepId)) {
        const cycleStart = path.indexOf(stepId);
        const cycle = path.slice(cycleStart).concat(stepId);
        throw new Error(`Cycle detected: ${cycle.join(' -> ')}`);
      }
      
      if (visited.has(stepId)) {
        return;
      }
      
      visited.add(stepId);
      recursionStack.add(stepId);
      path.push(stepId);
      
      const node = nodes.get(stepId);
      if (node) {
        for (const depId of node.dependencies) {
          dfs(depId, path);
        }
      }
      
      path.pop();
      recursionStack.delete(stepId);
    };
    
    for (const stepId of nodes.keys()) {
      if (!visited.has(stepId)) {
        dfs(stepId, []);
      }
    }
  }
  
  /**
   * Kahn 算法拓扑排序
   */
  private topologicalSort(nodes: Map<StepId, DAGNode>): StepId[] {
    const inDegree = new Map<StepId, number>();
    const result: StepId[] = [];
    const queue: StepId[] = [];
    
    // 计算入度
    for (const [stepId, node] of nodes) {
      inDegree.set(stepId, node.dependencies.length);
      if (node.dependencies.length === 0) {
        queue.push(stepId);
      }
    }
    
    // Kahn 算法
    while (queue.length > 0) {
      const stepId = queue.shift()!;
      result.push(stepId);
      
      const node = nodes.get(stepId);
      if (node) {
        for (const dependentId of node.dependents) {
          const newDegree = (inDegree.get(dependentId) || 0) - 1;
          inDegree.set(dependentId, newDegree);
          if (newDegree === 0) {
            queue.push(dependentId);
          }
        }
      }
    }
    
    // 检查是否有未处理的节点（循环依赖，但应该已被 detectCycle 捕获）
    if (result.length !== nodes.size) {
      throw new Error('Topological sort failed: possible cycle');
    }
    
    return result;
  }
  
  /**
   * 获取可以并行执行的步骤组
   */
  getParallelGroups(dag: DAG): StepId[][] {
    const groups: StepId[][] = [];
    const completed = new Set<StepId>();
    const remaining = new Set(dag.sorted);
    
    while (remaining.size > 0) {
      // 找到所有依赖已完成的步骤
      const group: StepId[] = [];
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
