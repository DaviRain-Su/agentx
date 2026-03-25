import { sanitizePath } from "./pathUtils";
import type { SqliteTextFileStore, StoredMessage } from "./types";

export class DOFileStore implements SqliteTextFileStore {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(`
      CREATE TABLE IF NOT EXISTS files (
        path    TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        updated INTEGER NOT NULL
      );
    `);
  }

  async get(path: string): Promise<string | undefined> {
    const rows = [...this.sql.exec("SELECT content FROM files WHERE path = ?", sanitizePath(path))];
    return rows.length > 0 ? (rows[0].content as string) : undefined;
  }

  async put(path: string, content: string): Promise<void> {
    const clean = sanitizePath(path);
    this.sql.exec(
      "INSERT OR REPLACE INTO files (path, content, updated) VALUES (?, ?, ?)",
      clean, content, Date.now()
    );
  }

  async list(): Promise<string[]> {
    return [...this.sql.exec("SELECT path FROM files ORDER BY path")].map((r) => r.path as string);
  }

  async getUpdatedAt(path: string): Promise<number | undefined> {
    const rows = [...this.sql.exec("SELECT updated FROM files WHERE path = ?", sanitizePath(path))];
    return rows.length > 0 ? Number(rows[0].updated) : undefined;
  }
}

export function seedMessagesFromHistory(history: Array<{ role: string; content: string; ts: number }>): StoredMessage[] {
  return history.map((entry) => ({
    role: entry.role,
    content: [{ type: "text", text: entry.content }],
    ts: entry.ts,
    id: crypto.randomUUID(),
  }));
}
