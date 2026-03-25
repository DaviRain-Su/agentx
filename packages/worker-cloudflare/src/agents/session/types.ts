export type StoredMessage = {
  role: string;
  content: Array<{ type: "text"; text: string }>;
  id?: string;
  ts?: number;
};

export type PersistedPiState = {
  messages?: unknown[];
  model?: { provider: string; id: string };
  thinkingLevel?: string;
};

export type WorkerLoader = {
  get(id: string, cb: () => unknown): {
    getEntrypoint(name: string): { run(helpers: Record<string, unknown>): Promise<unknown> };
  };
};

export interface SqliteTextFileStore {
  get(path: string): Promise<string | undefined>;
  put(path: string, content: string): Promise<void>;
  list(): Promise<string[]>;
  getUpdatedAt(path: string): Promise<number | undefined>;
}
