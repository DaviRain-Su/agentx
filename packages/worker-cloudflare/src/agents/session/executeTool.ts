import type { Env } from "../../index";
import { EXECUTE_ENTRYPOINT, executeSchema, MODULE_SYNTAX_RE } from "./constants";
import { sanitizePath } from "./pathUtils";
import { DOFileStore } from "./store";
import type { WorkerLoader } from "./types";

export function createLocalExecuteTool(loader: WorkerLoader, store: DOFileStore, env: Env): any {
  return {
    name: "execute",
    label: "execute",
    description: "Execute JavaScript in an isolated worker sandbox.",
    parameters: executeSchema,
    execute: async (_id: string, { code, file }: { code?: string; file?: string }) => {
      if (!code && !file) throw new Error("Provide either 'code' or 'file'");
      const helperNames = ["readFile", "writeFile", "listFiles"];
      const helpers = {
        readFile: async (path: string) => {
          const key = sanitizePath(path);
          const content = await store.get(key);
          if (content === undefined) throw new Error(`File not found: ${key}`);
          return content;
        },
        writeFile: async (path: string, content: string) => {
          const key = sanitizePath(path);
          await store.put(key, String(content));
          return `Wrote ${String(content).length} bytes to ${key}`;
        },
        listFiles: async (path = ".") => {
          const clean = path === "." || path === "/" ? "" : sanitizePath(path);
          const prefix = clean ? `${clean}/` : "";
          const entries = new Set<string>();
          for (const key of await store.list()) {
            if (!key.startsWith(prefix)) continue;
            const rest = key.slice(prefix.length);
            if (!rest) continue;
            const slashIdx = rest.indexOf("/");
            entries.add(slashIdx === -1 ? rest : `${rest.slice(0, slashIdx)}/`);
          }
          return [...entries].sort((a, b) => a.localeCompare(b));
        },
      };

      let userCode = code || "";
      if (file) {
        const key = sanitizePath(file);
        const content = await store.get(key);
        if (content === undefined) throw new Error(`File not found: ${key}`);
        userCode = content;
      }

      if (!MODULE_SYNTAX_RE.test(userCode)) {
        userCode = `export default async function({ ${helperNames.join(", ")} }) {\n${userCode}\n}`;
      }

      const modules = {
        "main.js": EXECUTE_ENTRYPOINT,
        "user-code.js": userCode,
      };
      const id = `exec-${Date.now()}-${crypto.randomUUID()}`;
      const stub = loader.get(`sandbox-${id}`, () => ({
        compatibilityDate: "2025-06-01",
        compatibilityFlags: ["nodejs_compat"],
        mainModule: "main.js",
        modules,
        ...(env.OUTBOUND ? { globalOutbound: env.OUTBOUND } : {}),
        env: env.OUTBOUND ? { OUTBOUND: env.OUTBOUND } : {},
      }));
      const runner = stub.getEntrypoint("Runner");
      const result = await Promise.race([
        runner.run(helpers),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Execution timed out after 60000ms")), 60_000)),
      ]);
      const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
      return { content: [{ type: "text" as const, text: text || "(no return value)" }], details: {} };
    },
  };
}
