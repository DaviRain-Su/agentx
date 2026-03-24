/**
 * CodeFlare Type Definitions
 */

export interface CodeRequest {
  requirement: string;
  language: 'typescript' | 'javascript' | 'python' | 'solidity' | 'rust';
  framework?: string;
  constraints?: string[];
  context?: CodeContext;
}

export interface CodeContext {
  existingFiles?: Record<string, string>;
  dependencies?: string[];
  entryPoints?: string[];
}

export interface CodeArtifact {
  code: string;
  language: string;
  fileName: string;
  tests?: string;
  documentation?: string;
  metadata: {
    generatedAt: Date;
    model: string;
    tokensUsed: number;
  };
}

export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  executionTime: number;
  memoryUsed: number;
}

export interface TestResult {
  passed: boolean;
  total: number;
  passed: number;
  failed: number;
  coverage?: number;
  details: Array<{
    name: string;
    status: 'passed' | 'failed';
    duration: number;
    error?: string;
  }>;
}

export interface CodeQualityReport {
  score: number;
  issues: Array<{
    severity: 'error' | 'warning' | 'info';
    message: string;
    line?: number;
    column?: number;
  }>;
  metrics: {
    complexity: number;
    linesOfCode: number;
    commentRatio: number;
  };
}

export interface CodeFlareConfig {
  llmProvider: 'anthropic' | 'openai';
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}
