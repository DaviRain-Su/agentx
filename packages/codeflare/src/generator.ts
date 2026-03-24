/**
 * CodeFlare - Code Generation Engine
 */

import Anthropic from '@anthropic-ai/sdk';
import { CodeRequest, CodeArtifact, CodeFlareConfig } from './types';

const CODE_GENERATION_PROMPT = `You are an expert software engineer. Generate production-ready code based on the requirements.

Requirements:
{{requirement}}

Language: {{language}}
{{framework}}
{{constraints}}

Rules:
1. Write clean, idiomatic code
2. Include comprehensive error handling
3. Add inline comments for complex logic
4. Follow best practices for {{language}}
5. Ensure the code is secure and efficient

Output ONLY the code in the following format:

FILE: {{fileName}}
\`\`\`{{language}}
// Your code here
\`\`\`

{{testSection}}
`;

const TEST_GENERATION_PROMPT = `Generate comprehensive unit tests for the following code.

Code:
{{code}}

Language: {{language}}
Framework: {{testFramework}}

Requirements:
- Cover all public functions
- Include edge cases
- Test error scenarios
- Use descriptive test names

Output ONLY the tests in runnable format.

\`\`\`{{language}}
// Tests here
\`\`\`
`;

export class CodeGenerator {
  private client: Anthropic;
  private config: CodeFlareConfig;

  constructor(config: CodeFlareConfig) {
    this.config = config;
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
  }

  async generate(request: CodeRequest): Promise<CodeArtifact> {
    const fileName = this.generateFileName(request);
    const framework = request.framework ? `Framework: ${request.framework}` : '';
    const constraints = request.constraints?.length 
      ? `Constraints:\n${request.constraints.map(c => `- ${c}`).join('\n')}` 
      : '';
    const testSection = '\n\nTESTS:\n```{{language}}\n// Tests will be generated separately\n```';

    const prompt = CODE_GENERATION_PROMPT
      .replace('{{requirement}}', request.requirement)
      .replace('{{language}}', request.language)
      .replace('{{framework}}', framework)
      .replace('{{constraints}}', constraints)
      .replace('{{fileName}}', fileName)
      .replace('{{testSection}}', testSection)
      .replace(/{{language}}/g, request.language);

    const response = await this.client.messages.create({
      model: this.config.model || 'claude-3-5-sonnet-20241022',
      max_tokens: this.config.maxTokens || 4000,
      temperature: this.config.temperature || 0.2,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0].type === 'text' 
      ? response.content[0].text 
      : '';

    const code = this.extractCode(content, request.language);
    const tests = await this.generateTests(code, request);

    return {
      code,
      language: request.language,
      fileName,
      tests,
      metadata: {
        generatedAt: new Date(),
        model: response.model,
        tokensUsed: response.usage.output_tokens,
      },
    };
  }

  async generateTests(code: string, request: CodeRequest): Promise<string | undefined> {
    const testFramework = this.getTestFramework(request.language);
    
    const prompt = TEST_GENERATION_PROMPT
      .replace('{{code}}', code)
      .replace('{{language}}', request.language)
      .replace('{{testFramework}}', testFramework)
      .replace(/{{language}}/g, request.language);

    const response = await this.client.messages.create({
      model: this.config.model || 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0].type === 'text' 
      ? response.content[0].text 
      : '';

    return this.extractCode(content, request.language) || undefined;
  }

  private generateFileName(request: CodeRequest): string {
    const ext = this.getFileExtension(request.language);
    // Extract a reasonable name from the requirement
    const name = request.requirement
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .substring(0, 30)
      .replace(/-+$/, '');
    return `${name || 'generated'}${ext}`;
  }

  private getFileExtension(language: string): string {
    const extensions: Record<string, string> = {
      typescript: '.ts',
      javascript: '.js',
      python: '.py',
      solidity: '.sol',
      rust: '.rs',
    };
    return extensions[language] || '.txt';
  }

  private getTestFramework(language: string): string {
    const frameworks: Record<string, string> = {
      typescript: 'Jest',
      javascript: 'Jest',
      python: 'pytest',
      solidity: 'Foundry/Hardhat',
      rust: 'cargo test',
    };
    return frameworks[language] || 'unknown';
  }

  private extractCode(content: string, language: string): string {
    // Extract code from markdown code blocks
    const codeBlockRegex = new RegExp(
      `\\\\`\\\\`\\\\`${language}\\s*\\n?([\\s\\S]*?)\\n?\\\\`\\\\`\\\\``,
      'i'
    );
    const match = content.match(codeBlockRegex);
    if (match) {
      return match[1].trim();
    }
    
    // Fallback: look for any code block
    const genericBlock = content.match(/```[\w]*\n?([\s\S]*?)```/);
    if (genericBlock) {
      return genericBlock[1].trim();
    }
    
    return content.trim();
  }
}
