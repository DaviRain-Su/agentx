/**
 * CodeFlare - Autonomous Code Generation & Execution Framework
 * 
 * Example usage:
 * ```typescript
 * import { CodeFlare } from '@gradience/codeflare';
 * 
 * const codeflare = new CodeFlare({
 *   llmProvider: 'anthropic',
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 * });
 * 
 * const artifact = await codeflare.generate({
 *   requirement: 'Create a function to calculate fibonacci numbers',
 *   language: 'typescript',
 * });
 * 
 * const result = await codeflare.execute(artifact.code, artifact.language);
 * ```
 */

export * from './types';
export { CodeGenerator } from './generator';
export { CodeExecutor } from './executor';

import { CodeGenerator } from './generator';
import { CodeExecutor } from './executor';
import { CodeRequest, CodeArtifact, CodeFlareConfig, ExecutionResult, TestResult } from './types';

export class CodeFlare {
  private generator: CodeGenerator;
  private executor: CodeExecutor;

  constructor(config: CodeFlareConfig) {
    this.generator = new CodeGenerator(config);
    this.executor = new CodeExecutor();
  }

  /**
   * Generate code from natural language requirements
   */
  async generate(request: CodeRequest): Promise<CodeArtifact> {
    return this.generator.generate(request);
  }

  /**
   * Execute generated code safely
   */
  async execute(code: string, language: string, input?: any): Promise<ExecutionResult> {
    if (language === 'typescript' || language === 'javascript') {
      return this.executor.executeJavaScript(code, input);
    }
    
    return {
      success: false,
      output: '',
      error: `Execution for ${language} not yet implemented. Only TypeScript/JavaScript is supported in this version.`,
      executionTime: 0,
      memoryUsed: 0,
    };
  }

  /**
   * Run tests on generated code
   */
  async test(code: string, tests: string, language: string): Promise<TestResult> {
    return this.executor.runTests(code, tests, language);
  }

  /**
   * Full pipeline: generate, test, and execute
   */
  async run(request: CodeRequest, testInput?: any): Promise<{
    artifact: CodeArtifact;
    execution?: ExecutionResult;
    testResults?: TestResult;
  }> {
    // Generate
    const artifact = await this.generate(request);

    // Test if tests are available
    let testResults: TestResult | undefined;
    if (artifact.tests) {
      testResults = await this.test(artifact.code, artifact.tests, request.language);
    }

    // Execute
    const execution = await this.execute(artifact.code, request.language, testInput);

    return {
      artifact,
      execution,
      testResults,
    };
  }
}
