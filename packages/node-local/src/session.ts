import { randomUUID } from "crypto";
import { ClaudeBackend, ChatMessage } from "./backends/claude";
import { PiBackend } from "./backends/pi";

export type Backend = ClaudeBackend | PiBackend;

interface Session {
  messages: ChatMessage[];
  backend: Backend;
  agentName: string;
  createdAt: number;
}

const sessions = new Map<string, Session>();

export function createSession(backend: Backend, agentName: string): string {
  const id = randomUUID();
  sessions.set(id, { messages: [], backend, agentName, createdAt: Date.now() });
  return id;
}

export async function chatInSession(id: string, message: string): Promise<string> {
  const session = sessions.get(id);
  if (!session) throw new Error(`Session not found: ${id}`);

  const response = await session.backend.chat(session.messages, message);

  session.messages.push({ role: "user", content: message });
  session.messages.push({ role: "assistant", content: response });

  return response;
}

export function getSessionHistory(id: string): { role: string; content: string; ts: number }[] {
  const session = sessions.get(id);
  if (!session) return [];
  return session.messages.map((m, i) => ({
    role: m.role,
    content: m.content,
    ts: session.createdAt + i * 1000,
  }));
}

export function clearSessionHistory(id: string): void {
  const session = sessions.get(id);
  if (session) session.messages = [];
}

export function sessionExists(id: string): boolean {
  return sessions.has(id);
}
