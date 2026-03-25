import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { createDownloadHandler } from "pi-worker";

export interface CodegenWorkflowParams {
  prompt: string;
  language?: "typescript" | "javascript" | "solidity";
  target?: "cloudflare-worker" | "smart-contract";
}

export interface CodegenWorkflowResult {
  status: "completed";
  jobId: string;
  summary: string;
  files: string[];
  artifactKey: string;
  artifactBytes: number;
  downloadUrl: string;
  model: string;
  createdAt: number;
  completedAt: number;
}

interface Env {
  CF_ACCOUNT_ID: string;
  CF_GATEWAY_NAME: string;
  CF_GATEWAY_TOKEN: string;
  AI_GATEWAY_MODEL: string;
  DOWNLOAD_SECRET: string;
  CODEGEN_FILES: R2Bucket;
}

interface GeneratedProject {
  summary: string;
  files: Array<{ path: string; content: string }>;
  model: string;
}

const CODEGEN_SYSTEM_PROMPT = `You are CodeFlare, an autonomous code generation engine.
Return JSON only with shape:
{
  "summary": "short summary",
  "files": [
    { "path": "src/index.ts", "content": "file content" }
  ]
}
Rules:
- paths must be relative (no leading slash)
- do not use ".." in paths
- generate practical production-ready starter code
- include at least 2 files
- do not include markdown fences or explanations outside JSON`;

function sanitizeFiles(files: Array<{ path: string; content: string }>) {
  return files
    .map((f) => ({ path: f.path.replace(/^\/+/, "").trim(), content: String(f.content ?? "") }))
    .filter((f) => f.path.length > 0 && !f.path.includes(".."));
}

function fallbackProject(prompt: string, target: string, language: string, model: string): GeneratedProject {
  if (target === "smart-contract" || language === "solidity") {
    return {
      model,
      summary: "Generated a Solidity starter contract and deployment script.",
      files: [
        {
          path: "contracts/GeneratedContract.sol",
          content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract GeneratedContract {
    string public promptDigest;

    constructor(string memory _promptDigest) {
        promptDigest = _promptDigest;
    }
}
`,
        },
        {
          path: "scripts/deploy.ts",
          content: `import { ethers } from "ethers";

export async function deployGeneratedContract(providerUrl: string, privateKey: string, promptDigest: string) {
  const provider = new ethers.JsonRpcProvider(providerUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  return { deployer: wallet.address, promptDigest };
}
`,
        },
      ],
    };
  }

  return {
    model,
    summary: "Generated a Cloudflare Worker starter with one API route.",
    files: [
      {
        path: "src/index.ts",
        content: `export interface Env {}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }
    return Response.json({
      message: "CodeFlare starter worker",
      prompt: ${JSON.stringify(prompt.slice(0, 160))},
    });
  },
};
`,
      },
      {
        path: "wrangler.toml",
        content: `name = "codeflare-generated-worker"
main = "src/index.ts"
compatibility_date = "2025-06-01"
compatibility_flags = ["nodejs_compat"]
`,
      },
      {
        path: "package.json",
        content: `{
  "name": "codeflare-generated-worker",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "wrangler deploy --dry-run --outdir dist"
  }
}
`,
      },
    ],
  };
}

function parseCodegenOutput(content: string, prompt: string, target: string, language: string, model: string): GeneratedProject {
  const tryParse = (text: string) => {
    const parsed = JSON.parse(text) as { summary?: string; files?: Array<{ path: string; content: string }> };
    const files = sanitizeFiles(parsed.files || []);
    if (files.length >= 2) {
      return {
        summary: parsed.summary?.trim() || "Generated project files.",
        files,
        model,
      };
    }
    return null;
  };

  try {
    const parsed = tryParse(content);
    if (parsed) return parsed;
  } catch {}

  const fenced = content.match(/```json\s*([\s\S]*?)```/i)?.[1];
  if (fenced) {
    try {
      const parsed = tryParse(fenced);
      if (parsed) return parsed;
    } catch {}
  }

  return fallbackProject(prompt, target, language, model);
}

async function generateProject(env: Env, params: CodegenWorkflowParams): Promise<GeneratedProject> {
  const modelRaw = env.AI_GATEWAY_MODEL?.trim() || "workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  const modelId = modelRaw.startsWith("workers-ai/") ? modelRaw.slice("workers-ai/".length) : modelRaw;
  const endpoint = `https://gateway.ai.cloudflare.com/v1/${encodeURIComponent(env.CF_ACCOUNT_ID)}/${encodeURIComponent(env.CF_GATEWAY_NAME)}/workers-ai/${encodeURIComponent(modelId)}/chat/completions`;
  const target = params.target || "cloudflare-worker";
  const language = params.language || "typescript";
  const userPrompt = [
    `Target: ${target}`,
    `Language: ${language}`,
    "",
    "User requirement:",
    params.prompt.trim(),
  ].join("\n");

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(env.CF_GATEWAY_TOKEN ? { Authorization: `Bearer ${env.CF_GATEWAY_TOKEN}` } : {}),
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: CODEGEN_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 2800,
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    return fallbackProject(params.prompt, target, language, modelId);
  }

  const completion = await res.json() as {
    result?: { choices?: Array<{ message?: { content?: string | null } }> };
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = completion.result?.choices?.[0]?.message?.content
    || completion.choices?.[0]?.message?.content
    || "";

  if (!content) {
    return fallbackProject(params.prompt, target, language, modelId);
  }

  return parseCodegenOutput(content, params.prompt, target, language, modelId);
}

export class CodegenWorkflow extends WorkflowEntrypoint<Env, CodegenWorkflowParams> {
  async run(
    event: Readonly<WorkflowEvent<CodegenWorkflowParams>>,
    step: WorkflowStep
  ): Promise<CodegenWorkflowResult> {
    const jobId = event.instanceId;
    const createdAt = Date.now();

    const generated = await step.do("generate_code", { timeout: "4 minutes" }, async () => {
      if (!event.payload.prompt?.trim()) throw new Error("prompt is required");
      return generateProject(this.env, event.payload);
    });

    const packaged = await step.do("package_artifact", { timeout: "2 minutes" }, async () => {
      const artifact = {
        jobId,
        prompt: event.payload.prompt,
        target: event.payload.target || "cloudflare-worker",
        language: event.payload.language || "typescript",
        summary: generated.summary,
        model: generated.model,
        files: generated.files,
      };
      const artifactText = JSON.stringify(artifact, null, 2);
      const artifactKey = `codegen/${jobId}.json`;
      const downloads = createDownloadHandler(this.env.CODEGEN_FILES, this.env.DOWNLOAD_SECRET, "/api/codegen/download/");
      const downloadUrl = await downloads.store(artifactKey, artifactText, {
        contentType: "application/json",
        filename: `${jobId}.json`,
        ttl: 86400,
      });
      return {
        artifactKey,
        artifactBytes: artifactText.length,
        downloadUrl,
      };
    });

    return {
      status: "completed",
      jobId,
      summary: generated.summary,
      files: generated.files.map((f) => f.path),
      artifactKey: packaged.artifactKey,
      artifactBytes: packaged.artifactBytes,
      downloadUrl: packaged.downloadUrl,
      model: generated.model,
      createdAt,
      completedAt: Date.now(),
    };
  }
}
