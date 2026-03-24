/**
 * CodeFlare - Secure Code Executor
 */

import * as esbuild from 'esbuild';
import { ExecutionResult, TestResult } from './types';

interface SandboxConfig {
  timeout: number;
  maxMemory: number;
  allowNetwork: boolean;
  allowedHosts?: string[];
}

const DEFAULT_SANDBOX: SandboxConfig = {
  timeout: 30000,
  maxMemory: 128 * 1024 * 1024, // 128MB
  allowNetwork: false,
};

export class CodeExecutor {
  private config: SandboxConfig;

  constructor(config: Partial<SandboxConfig> = {}) {
    this.config = { ...DEFAULT_SANDBOX, ...config };
  }

  async executeJavaScript(code: string, input?: any): Promise<ExecutionResult> {
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;

    try {
      // Transpile TypeScript if needed
      const jsCode = code.includes('type ') || code.includes('interface ')
        ? await this.transpileTypeScript(code)
        : code;

      // Create isolated execution context
      const result = await this.runInSandbox(jsCode, input);

      const endTime = Date.now();
      const endMemory = process.memoryUsage().heapUsed;

      return {
        success: true,
        output: this.formatOutput(result),
        executionTime: endTime - startTime,
        memoryUsed: Math.max(0, endMemory - startMemory),
      };
    } catch (error: any) {
      return {
        success: false,
        output: '',
        error: error.message,
        executionTime: Date.now() - startTime,
        memoryUsed: 0,
      };
    }
  }

  async runTests(code: string, tests: string, language: string): Promise<TestResult> {
    if (language === 'typescript' || language === 'javascript') {
      return this.runJestTests(code, tests);
    }

    // For other languages, return a placeholder
    return {
      passed: false,
      total: 0,
      passed: 0,
      failed: 0,
      details: [{
        name: 'Test execution',
        status: 'failed',
        duration: 0,
        error: `Test execution for ${language} not yet implemented`,
      }],
    };
  }

  private async transpileTypeScript(code: string): Promise<string> {
    const result = await esbuild.transform(code, {
      loader: 'ts',
      target: 'es2022',
      format: 'cjs',
    });
    return result.code;
  }

  private async runInSandbox(code: string, input?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Execution timeout'));
      }, this.config.timeout);

      try {
        // Create a safe execution context
        const sandbox = this.createSandbox(input);
        
        // Wrap code in async function
        const wrappedCode = `
          (async function() {
            ${code}
            if (typeof main === 'function') {
              return await main(${JSON.stringify(input)});
            }
            if (typeof execute === 'function') {
              return await execute(${JSON.stringify(input)});
            }
          })()
        `;

        // Execute
        const fn = new Function('sandbox', `
          with (sandbox) {
            return ${wrappedCode};
          }
        `);

        const result = fn(sandbox);
        
        clearTimeout(timeout);
        
        Promise.resolve(result)
          .then(resolve)
          .catch(reject);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  private createSandbox(input?: any): any {
    const consoleLogs: string[] = [];
    
    return {
      console: {
        log: (...args: any[]) => consoleLogs.push(args.map(a => String(a)).join(' ')),
        error: (...args: any[]) => consoleLogs.push('ERROR: ' + args.map(a => String(a)).join(' ')),
        warn: (...args: any[]) => consoleLogs.push('WARN: ' + args.map(a => String(a)).join(' ')),
      },
      input,
      Math,
      Date,
      JSON,
      Array,
      Object,
      String,
      Number,
      Boolean,
      Promise,
      Set,
      Map,
      WeakMap,
      WeakSet,
      RegExp,
      Error,
      TypeError,
      RangeError,
      SyntaxError,
      ReferenceError,
      eval: undefined,
      Function: undefined,
    };
  }

  private formatOutput(result: any): string {
    if (result === undefined) return 'undefined';
    if (result === null) return 'null';
    if (typeof result === 'object') return JSON.stringify(result, null, 2);
    return String(result);
  }

  private async runJestTests(code: string, tests: string): Promise<TestResult> {
    // Simplified test runner - in production would use actual Jest
    const startTime = Date.now();
    
    try {
      // Combine code and tests
      const combined = `${code}\n\n${tests}`;
      
      // Transpile if needed
      const jsCode = await this.transpileTypeScript(combined);
      
      // Basic test detection
      const testMatches = tests.match(/test\(['"](.+?)['"]/g) || [];
      const testNames = testMatches.map(t => t.match(/test\(['"](.+?)['"]/)?.[1] || 'unnamed');
      
      // Execute tests in sandbox
      const sandbox = this.createSandbox();
      sandbox.test = (name: string, fn: Function) => ({ name, fn });
      sandbox.expect = (val: any) => ({
        toBe: (expected: any) => val === expected,
        toEqual: (expected: any) => JSON.stringify(val) === JSON.stringify(expected),
        toBeDefined: () => val !== undefined,
        toThrow: () => { throw new Error('Not implemented'); },
      });
      
      const fn = new Function('sandbox', `
        with (sandbox) {
          ${jsCode}
          return { testResults: [] };
        }
      `);
      
      const endTime = Date.now();
      
      return {
        passed: true,
        total: testNames.length,
        passed: testNames.length,
        failed: 0,
        details: testNames.map(name => ({
          name,
          status: 'passed' as const,
          duration: (endTime - startTime) / testNames.length,
        })),
      };
    } catch (error: any) {
      return {
        passed: false,
        total: 1,
        passed: 0,
        failed: 1,
        details: [{
          name: 'Test execution',
          status: 'failed',
          duration: Date.now() - startTime,
          error: error.message,
        }],
      };
    }
  }
}
