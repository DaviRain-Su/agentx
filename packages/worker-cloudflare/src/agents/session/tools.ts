import type { Env } from "../../index";
import { DOFileStore } from "./store";
import type { WorkerLoader } from "./types";
import { buildBusinessTools } from "./businessTools";
import { createLocalExecuteTool } from "./executeTool";
import { createWorkspaceFileTools } from "./fileTools";

export function buildAgentTools(store: DOFileStore, env: Env): any[] {
  const customTools: any[] = [
    ...createWorkspaceFileTools(store),
    ...buildBusinessTools(store, env),
  ];

  if (env.LOADER) {
    customTools.push(createLocalExecuteTool(env.LOADER as WorkerLoader, store, env));
  }
  return customTools;
}
