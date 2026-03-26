import { spawn } from "child_process";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * ClaudeBackend — delegates to the locally installed `claude` CLI.
 * No API key needed: uses whatever auth the user already has (subscription / OAuth).
 * Prompt is written to stdin so claude doesn't wait for terminal input.
 */
export class ClaudeBackend {
  readonly model: string;
  readonly systemPrompt?: string;

  constructor(_apiKey: string, model = "claude-sonnet-4-6", systemPrompt?: string) {
    this.model = model;
    this.systemPrompt = systemPrompt;
  }

  async chat(history: ChatMessage[], userMessage: string): Promise<string> {
    const historyText = history.map((m) =>
      `${m.role === "user" ? "Human" : "Assistant"}: ${m.content}`
    ).join("\n");

    const prompt = historyText
      ? `${historyText}\nHuman: ${userMessage}`
      : userMessage;

    return new Promise((resolve, reject) => {
      const args = ["--print", "--output-format", "text"];
      if (this.systemPrompt) args.push("--system-prompt", this.systemPrompt);

      const proc = spawn("claude", args, {
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 120_000,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

      proc.on("close", (code) => {
        if (code !== 0) reject(new Error(`claude exited with code ${code}: ${stderr.trim()}`));
        else resolve(stdout.trim());
      });

      proc.on("error", reject);

      // Write prompt to stdin and close it so claude doesn't wait
      proc.stdin.write(prompt);
      proc.stdin.end();
    });
  }
}
