/**
 * StateManager - 状态管理器接口
 * 
 * 抽象状态存储，支持不同后端实现（xurl Session, Arweave, 本地缓存）
 */

import { Task, ExecutionContext, ConfirmationRequest, TaskId } from '../types';

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

/**
 * XurlStateManager - 基于 xurl Session 的状态管理
 * 
 * 使用 xurl 协议进行跨 Agent 状态同步
 */
export class XurlStateManager implements StateManager {
  private baseUrl: string;
  private cache = new Map<string, unknown>();

  constructor(config: { baseUrl: string }) {
    this.baseUrl = config.baseUrl;
  }

  async getTask(taskId: TaskId): Promise<Task | null> {
    // 先查本地缓存
    const cached = this.cache.get(`task:${taskId}`);
    if (cached) {
      return cached as Task;
    }

    // 从 xurl Session 获取
    try {
      const response = await fetch(`${this.baseUrl}/session/task/${taskId}`);
      if (!response.ok) return null;
      const task = await response.json();
      
      // 缓存
      this.cache.set(`task:${taskId}`, task);
      
      return task as Task;
    } catch {
      return null;
    }
  }

  async saveTask(task: Task): Promise<void> {
    // 更新缓存
    this.cache.set(`task:${task.id}`, task);

    // 异步保存到 xurl Session
    try {
      await fetch(`${this.baseUrl}/session/task/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task)
      });
    } catch (error) {
      console.error('Failed to save task to xurl:', error);
      // 不抛出错误，缓存已更新，可后续重试
    }
  }

  async getContext(taskId: TaskId): Promise<ExecutionContext | null> {
    const cached = this.cache.get(`context:${taskId}`);
    if (cached) {
      return cached as ExecutionContext;
    }

    try {
      const response = await fetch(`${this.baseUrl}/session/context/${taskId}`);
      if (!response.ok) return null;
      const context = await response.json();
      this.cache.set(`context:${taskId}`, context);
      return context as ExecutionContext;
    } catch {
      return null;
    }
  }

  async saveContext(context: ExecutionContext): Promise<void> {
    this.cache.set(`context:${context.task.id}`, context);

    try {
      await fetch(`${this.baseUrl}/session/context/${context.task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(context)
      });
    } catch (error) {
      console.error('Failed to save context to xurl:', error);
    }
  }

  async getConfirmation(confirmationId: string): Promise<ConfirmationRequest | null> {
    const cached = this.cache.get(`confirmation:${confirmationId}`);
    if (cached) {
      return cached as ConfirmationRequest;
    }

    try {
      const response = await fetch(`${this.baseUrl}/session/confirmation/${confirmationId}`);
      if (!response.ok) return null;
      const confirmation = await response.json();
      this.cache.set(`confirmation:${confirmationId}`, confirmation);
      return confirmation as ConfirmationRequest;
    } catch {
      return null;
    }
  }

  async saveConfirmation(confirmation: ConfirmationRequest): Promise<void> {
    this.cache.set(`confirmation:${confirmation.id}`, confirmation);

    try {
      await fetch(`${this.baseUrl}/session/confirmation/${confirmation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(confirmation)
      });
    } catch (error) {
      console.error('Failed to save confirmation to xurl:', error);
    }
  }

  /**
   * 批量刷新缓存到 xurl
   */
  async flush(): Promise<void> {
    const promises: Promise<void>[] = [];
    
    for (const [key, value] of this.cache) {
      const [type, id] = key.split(':');
      promises.push(
        fetch(`${this.baseUrl}/session/${type}/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(value)
        }).then(() => {}).catch(() => {})
      );
    }

    await Promise.all(promises);
  }
}
