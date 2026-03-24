/**
 * HumanInLoopManager - 人在回路管理器
 * 
 * 功能:
 * - 管理确认请求的生命周期
 * - 处理超时逻辑
 * - 协调用户响应
 */

import { ConfirmationRequest, ConfirmationStatus } from '../types';

export interface HumanInLoopManager {
  /**
   * 等待用户确认
   * @param confirmationId 确认请求 ID
   * @param timeoutSeconds 超时时间（秒）
   * @returns 是否确认
   */
  waitForConfirmation(confirmationId: string, timeoutSeconds: number): Promise<boolean>;

  /**
   * 解析确认（用户响应后调用）
   */
  resolveConfirmation(confirmationId: string, decision: 'confirm' | 'reject'): void;
}

export class ConfirmationManager implements HumanInLoopManager {
  private pendingConfirmations = new Map<string, {
    resolve: (value: boolean) => void;
    timeout: NodeJS.Timeout;
  }>();

  /**
   * 等待用户确认
   * 实现: 返回 Promise，用户响应或超时时 resolve
   */
  async waitForConfirmation(confirmationId: string, timeoutSeconds: number): Promise<boolean> {
    return new Promise((resolve) => {
      // 设置超时
      const timeout = setTimeout(() => {
        this.pendingConfirmations.delete(confirmationId);
        resolve(false); // 超时视为拒绝
      }, timeoutSeconds * 1000);

      // 保存 resolve 函数和 timeout 引用
      this.pendingConfirmations.set(confirmationId, { resolve, timeout });
    });
  }

  /**
   * 解析确认请求
   * 用户响应后调用，resolve 对应的 Promise
   */
  resolveConfirmation(confirmationId: string, decision: 'confirm' | 'reject'): void {
    const pending = this.pendingConfirmations.get(confirmationId);
    if (!pending) {
      console.warn(`Confirmation ${confirmationId} not found or already resolved`);
      return;
    }

    // 清除超时
    clearTimeout(pending.timeout);
    
    // resolve Promise
    pending.resolve(decision === 'confirm');
    
    // 清理
    this.pendingConfirmations.delete(confirmationId);
  }

  /**
   * 取消所有待处理的确认（如任务取消时）
   */
  cancelAllPending(): void {
    for (const [id, pending] of this.pendingConfirmations) {
      clearTimeout(pending.timeout);
      pending.resolve(false);
    }
    this.pendingConfirmations.clear();
  }
}
