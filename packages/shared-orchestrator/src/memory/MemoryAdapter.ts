/**
 * Memory Adapter - Agent Memory System Interface
 * 
 * Current: Null implementation (no memory)
 * Future: Integrate MEM9, db9, or custom memory service
 */

import { AgentId, WorkflowId, TaskId } from '../types';

export interface UserProfile {
  userId: string;
  walletAddress: string;
  preferences: {
    riskTolerance: 'low' | 'medium' | 'high';
    preferredAgents: AgentId[];
    notificationSettings: {
      email?: string;
      push?: boolean;
    };
  };
  behaviorPatterns: {
    avgConfirmationTime: number; // seconds
    preferredExecutionMode: 'sequential' | 'parallel' | 'conditional';
    commonWorkflows: WorkflowId[];
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface Interaction {
  userId: string;
  taskId: TaskId;
  agentId: AgentId;
  action: string;
  context: Record<string, unknown>;
  timestamp: Date;
}

export interface MemoryAdapter {
  // User Profile
  getUserProfile(userId: string): Promise<UserProfile | null>;
  updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<void>;
  
  // Interaction History
  recordInteraction(interaction: Interaction): Promise<void>;
  getRecentInteractions(userId: string, limit: number): Promise<Interaction[]>;
  
  // Context for Agent execution
  getContextForAgent(userId: string, agentId: AgentId): Promise<Record<string, unknown>>;
  
  // Recommendations
  getRecommendedAgents(userId: string): Promise<AgentId[]>;
  getRecommendedWorkflows(userId: string): Promise<WorkflowId[]>;
}

/**
 * NullMemory - No memory (current implementation)
 */
export class NullMemory implements MemoryAdapter {
  async getUserProfile(): Promise<null> {
    return null;
  }
  
  async updateUserProfile(): Promise<void> {
    // No-op
  }
  
  async recordInteraction(): Promise<void> {
    // No-op
  }
  
  async getRecentInteractions(): Promise<Interaction[]> {
    return [];
  }
  
  async getContextForAgent(): Promise<Record<string, unknown>> {
    return {};
  }
  
  async getRecommendedAgents(): Promise<AgentId[]> {
    return [];
  }
  
  async getRecommendedWorkflows(): Promise<WorkflowId[]> {
    return [];
  }
}

/**
 * ArweaveMemory - Basic memory on Arweave (interim solution)
 * Stores user profile and interactions as JSON transactions
 */
export class ArweaveMemory implements MemoryAdapter {
  private arweaveClient: any; // Arweave client instance
  
  constructor(arweaveConfig: { host: string; port: number; protocol: string }) {
    // Initialize Arweave client
    // this.arweaveClient = Arweave.init(arweaveConfig);
  }
  
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    // Query Arweave for user profile by tag
    // Return parsed profile or null
    return null;
  }
  
  async updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<void> {
    // Store updated profile to Arweave
    // Use userId as tag for retrieval
  }
  
  async recordInteraction(interaction: Interaction): Promise<void> {
    // Store interaction to Arweave
    // Tag with userId and timestamp
  }
  
  async getRecentInteractions(userId: string, limit: number): Promise<Interaction[]> {
    // Query Arweave for interactions by userId tag
    // Sort by timestamp, return last N
    return [];
  }
  
  async getContextForAgent(userId: string, agentId: AgentId): Promise<Record<string, unknown>> {
    // Get user profile
    // Get recent interactions with this agent
    // Compile relevant context
    return {};
  }
  
  async getRecommendedAgents(userId: string): Promise<AgentId[]> {
    // Simple recommendation based on past usage
    // Return most frequently used agents
    return [];
  }
  
  async getRecommendedWorkflows(userId: string): Promise<WorkflowId[]> {
    // Return commonly used workflows
    return [];
  }
}

/**
 * MEM9Memory - Integration with MEM9 service (future)
 */
export class MEM9Memory implements MemoryAdapter {
  private mem9Endpoint: string;
  private apiKey: string;
  
  constructor(config: { endpoint: string; apiKey: string }) {
    this.mem9Endpoint = config.endpoint;
    this.apiKey = config.apiKey;
  }
  
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    // Call MEM9 API
    // GET /api/v1/users/{userId}/profile
    return null;
  }
  
  async updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<void> {
    // POST /api/v1/users/{userId}/profile
  }
  
  async recordInteraction(interaction: Interaction): Promise<void> {
    // POST /api/v1/interactions
  }
  
  async getRecentInteractions(userId: string, limit: number): Promise<Interaction[]> {
    // GET /api/v1/users/{userId}/interactions?limit={limit}
    return [];
  }
  
  async getContextForAgent(userId: string, agentId: AgentId): Promise<Record<string, unknown>> {
    // MEM9 provides rich context including:
    // - User preferences relevant to agent
    // - Past interactions with this agent
    // - Similar users' successful patterns
    return {};
  }
  
  async getRecommendedAgents(userId: string): Promise<AgentId[]> {
    // GET /api/v1/users/{userId}/recommendations/agents
    return [];
  }
  
  async getRecommendedWorkflows(userId: string): Promise<WorkflowId[]> {
    // GET /api/v1/users/{userId}/recommendations/workflows
    return [];
  }
}
