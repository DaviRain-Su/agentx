/**
 * Ollama backend — 无需 API key，本地免费运行。
 * 通过 Ollama 的 OpenAI 兼容接口通信。
 *
 * 安装 Ollama: https://ollama.com
 * 拉取模型:    ollama pull llama3.2
 * 启动服务:    ollama serve（安装后默认自动运行）
 */
import { ChatMessage } from "./claude";

const DEFAULT_BASE_URL = "http://localhost:11434/v1";

export class OllamaBackend {
  private baseUrl: string;
  readonly model: string;
  private systemPrompt?: string;

  constructor(
    model = "llama3.2",
    baseUrl = DEFAULT_BASE_URL,
    systemPrompt?: string
  ) {
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.systemPrompt = systemPrompt;
  }

  async chat(history: ChatMessage[], userMessage: string): Promise<string> {
    const messages: { role: string; content: string }[] = [];

    if (this.systemPrompt) {
      messages.push({ role: "system", content: this.systemPrompt });
    }

    for (const m of history) {
      messages.push({ role: m.role, content: m.content });
    }
    messages.push({ role: "user", content: userMessage });

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama error (${res.status}): ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
    };

    return data.choices[0]?.message?.content ?? "(empty response)";
  }
}
