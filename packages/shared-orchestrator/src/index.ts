/**
 * AgentX Shared Orchestrator
 * 
 * Workflow orchestration engine for X Layer.
 * Supports sequential, parallel, and conditional execution with human-in-the-loop.
 */

// Types
export * from './types';

// Engine
export { WorkflowEngine, WorkflowEngineConfig } from './engine/WorkflowEngine';
export { DAGBuilder, DAG, DAGNode } from './engine/DAGBuilder';
export { BaseRunner } from './engine/BaseRunner';
export { SequentialRunner } from './engine/SequentialRunner';
export { ParallelRunner } from './engine/ParallelRunner';
export { ConditionalRunner, Condition, ConditionalBranch } from './engine/ConditionalRunner';

// Human-in-the-loop
export { HumanInLoopManager, ConfirmationManager } from './human-in-loop/ConfirmationManager';

// State
export { StateManager, XurlStateManager } from './state/StateManager';

// Runtime (explicit exports to avoid name collision with ./types ExecutionContext)
export type { RuntimeConfig, AgentRuntime, ExecutionResult, AgentDefinition, HealthStatus, RuntimeMetrics, RuntimeType } from './runtime/types';
export { CloudflareRuntime } from './runtime/CloudflareRuntime';
export { NodeRuntime } from './runtime/NodeRuntime';
export { RuntimeFactory } from './runtime/RuntimeFactory';
export { ExecutionNode, NodeCapability, Task, TaskRequirements } from './runtime/ExecutionNode';
export type { NodeConfig } from './runtime/ExecutionNode';
