import { editSchema, lsSchema, readSchema, writeSchema } from "./constants";
import { sanitizePath } from "./pathUtils";
import { DOFileStore } from "./store";

export function createWorkspaceFileTools(store: DOFileStore): any[] {
  return [
    {
      name: "read",
      label: "read",
      description: "Read a file from the workspace.",
      parameters: readSchema,
      execute: async (_id: string, { path, offset, limit }: { path: string; offset?: number; limit?: number }) => {
        const key = sanitizePath(path);
        if (!key) throw new Error("Path is required");
        const content = await store.get(key);
        if (content === undefined) throw new Error(`File not found: ${key}`);
        const start = Math.max(0, Math.floor(offset ?? 0));
        const max = limit === undefined ? undefined : Math.max(1, Math.floor(limit));
        const lines = content.split("\n");
        const slice = max === undefined ? lines.slice(start) : lines.slice(start, start + max);
        return { content: [{ type: "text" as const, text: slice.join("\n") }], details: { path: key, offset: start, limit: max } };
      },
    },
    {
      name: "write",
      label: "write",
      description: "Write text content to a workspace file.",
      parameters: writeSchema,
      execute: async (_id: string, { path, content }: { path: string; content: string }) => {
        const key = sanitizePath(path);
        if (!key) throw new Error("Path is required");
        await store.put(key, content);
        return { content: [{ type: "text" as const, text: `Wrote ${content.length} bytes to ${key}` }], details: {} };
      },
    },
    {
      name: "edit",
      label: "edit",
      description: "Edit text in a workspace file by replacing oldText with newText once.",
      parameters: editSchema,
      execute: async (_id: string, { path, oldText, newText }: { path: string; oldText: string; newText: string }) => {
        const key = sanitizePath(path);
        if (!key) throw new Error("Path is required");
        const current = await store.get(key);
        if (current === undefined) throw new Error(`File not found: ${key}`);
        const idx = current.indexOf(oldText);
        if (idx === -1) throw new Error(`oldText not found in ${key}`);
        const next = `${current.slice(0, idx)}${newText}${current.slice(idx + oldText.length)}`;
        await store.put(key, next);
        return { content: [{ type: "text" as const, text: `Edited ${key}` }], details: {} };
      },
    },
    {
      name: "ls",
      label: "ls",
      description: "List files and directories under a workspace path.",
      parameters: lsSchema,
      execute: async (_id: string, { path }: { path?: string }) => {
        const clean = path ? sanitizePath(path) : "";
        const prefix = clean ? `${clean}/` : "";
        const entries = new Set<string>();
        for (const key of await store.list()) {
          if (!key.startsWith(prefix)) continue;
          const rest = key.slice(prefix.length);
          if (!rest) continue;
          const slashIdx = rest.indexOf("/");
          entries.add(slashIdx === -1 ? rest : `${rest.slice(0, slashIdx)}/`);
        }
        const list = [...entries].sort((a, b) => a.localeCompare(b));
        return { content: [{ type: "text" as const, text: list.length ? list.join("\n") : "(empty)" }], details: {} };
      },
    },
  ];
}
