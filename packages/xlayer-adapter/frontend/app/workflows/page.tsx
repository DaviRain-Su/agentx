"use client";

import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useLangStore } from "@/store/lang";
import { useWeb3 } from "@/components/Web3Provider";
import { ethers } from "ethers";
import { Workflow as WorkflowIcon, Play, ChevronRight, CheckCircle, Clock, AlertCircle, Loader2, Plus } from "lucide-react";
import Link from "next/link";

// Workflow templates stored in frontend (could be moved to IPFS/chain later)
const WORKFLOW_TEMPLATES = [
  {
    id: "wf-1",
    name: "ETH Price Alert & Buy",
    description: "Monitor ETH price and execute buy when condition is met",
    executionMode: "sequential",
    steps: [
      {
        id: "step-1",
        agentId: "price-monitor",
        name: "Monitor ETH Price",
        description: "Get current ETH price from CoinGecko",
        config: { token: "ethereum", source: "coingecko" },
        dependsOn: [],
        humanApproval: false,
        timeout: 60,
      },
      {
        id: "step-2",
        agentId: "condition-eval",
        name: "Evaluate Condition",
        description: "Check if price < $1800",
        config: { condition: "price < 1800", operator: "<", threshold: 1800 },
        dependsOn: ["step-1"],
        humanApproval: true,
        timeout: 300,
      },
      {
        id: "step-3",
        agentId: "trade-executor",
        name: "Execute Trade",
        description: "Buy 0.1 ETH",
        config: { action: "buy", token: "ETH", amount: "0.1" },
        dependsOn: ["step-2"],
        humanApproval: true,
        timeout: 300,
      },
    ],
    budget: "2.5", // USDC
  },
  {
    id: "wf-2",
    name: "BTC Trend Analysis",
    description: "Analyze BTC trend and send notification",
    executionMode: "sequential",
    steps: [
      {
        id: "step-1",
        agentId: "price-monitor",
        name: "Get BTC Price",
        description: "Fetch BTC price from Binance",
        config: { token: "bitcoin", source: "binance" },
        dependsOn: [],
        humanApproval: false,
        timeout: 60,
      },
      {
        id: "step-2",
        agentId: "condition-eval",
        name: "Trend Analysis",
        description: "Check 24h change > 5%",
        config: { condition: "change > 5%", operator: ">", threshold: 5 },
        dependsOn: ["step-1"],
        humanApproval: false,
        timeout: 60,
      },
    ],
    budget: "1.0", // USDC
  },
];

interface Task {
  id: string;
  taskId: string;
  workflowId: string;
  workflowName: string;
  status: "created" | "pending_confirmation" | "executing" | "completed" | "failed" | "cancelled";
  currentStepIndex: number;
  totalSteps: number;
  budget: string;
  createdAt: Date;
}

const CHAIN_STATUS_MAP: Record<number, Task["status"]> = {
  0: "created",
  1: "pending_confirmation",
  2: "executing",
  3: "completed",
  4: "failed",
  5: "cancelled",
};

export default function WorkflowsPage() {
  const { lang } = useLangStore();
  const { taskManager, usdc, address, signer } = useWeb3();
  const [workflows] = useState(WORKFLOW_TEMPLATES);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createdTaskId, setCreatedTaskId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Convert chain data to Task format
  const chainTaskToTask = useCallback((raw: any, taskId: string, workflowName: string): Task => {
    const statusNum = Number(raw.status ?? 0);
    return {
      id: taskId,
      taskId: taskId,
      workflowId: raw.workflowHash || "",
      workflowName: workflowName || `Task #${taskId}`,
      status: CHAIN_STATUS_MAP[statusNum] ?? "created",
      currentStepIndex: Number(raw.currentStepIndex ?? 0),
      totalSteps: Number(raw.agentDIDs?.length ?? 1),
      budget: ethers.formatUnits(raw.totalBudget || 0, 6),
      createdAt: new Date(Number(raw.createdAt ?? 0) * 1000),
    };
  }, []);

  // Fetch tasks from chain
  const fetchTasks = useCallback(async () => {
    if (!taskManager || !address) return;
    
    setIsLoading(true);
    try {
      const taskIds: bigint[] = await taskManager.getRequesterTasks(address);
      
      const taskPromises = taskIds.slice(-5).map(async (id) => {
        try {
          const raw = await taskManager.getTask(id);
          // Try to find workflow name from hash
          const workflowName = WORKFLOW_TEMPLATES.find(w => 
            ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(w))) === raw.workflowHash
          )?.name;
          return chainTaskToTask(raw, id.toString(), workflowName || `Task #${id}`);
        } catch (err) {
          console.error(`Failed to fetch task ${id}:`, err);
          return null;
        }
      });

      const fetchedTasks = (await Promise.all(taskPromises))
        .filter((t): t is Task => t !== null)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      setTasks(fetchedTasks);
    } catch (err) {
      console.error("Failed to fetch tasks:", err);
    } finally {
      setIsLoading(false);
    }
  }, [taskManager, address, chainTaskToTask]);

  // Poll tasks
  useEffect(() => {
    if (!taskManager || !address) return;
    fetchTasks();
    const interval = setInterval(fetchTasks, 5000);
    return () => clearInterval(interval);
  }, [taskManager, address, fetchTasks]);

  // Create task on chain
  const handleCreateTask = async (workflowId: string) => {
    if (!taskManager || !usdc || !signer || !address) {
      console.error("Wallet not connected");
      return;
    }

    const workflow = workflows.find(w => w.id === workflowId);
    if (!workflow) return;

    setIsCreating(true);
    try {
      // 1. Generate workflow hash
      const workflowData = JSON.stringify({
        steps: workflow.steps.map(s => ({ id: s.id, agentId: s.agentId, config: s.config })),
        mode: workflow.executionMode,
        createdAt: Date.now(),
      });
      const workflowHash = ethers.keccak256(ethers.toUtf8Bytes(workflowData));

      // 2. Generate agent DIDs (placeholder - would query 8004 registry in production)
      const agentDIDs = workflow.steps.map(() => 
        ethers.keccak256(ethers.toUtf8Bytes("agent_did_placeholder"))
      );

      // 3. Calculate budget
      const totalBudget = ethers.parseUnits(workflow.budget, 6);

      // 4. Check and approve USDC
      const currentAllowance = await usdc.allowance(address, await taskManager.getAddress());
      if (currentAllowance < totalBudget) {
        const approveTx = await usdc.approve(await taskManager.getAddress(), totalBudget);
        await approveTx.wait();
      }

      // 5. Create task on chain
      const tx = await taskManager.createTask(workflowHash, agentDIDs, totalBudget);
      const receipt = await tx.wait();

      // Extract task ID from event
      let taskId = "unknown";
      if (receipt?.logs) {
        for (const log of receipt.logs) {
          try {
            const parsed = taskManager.interface.parseLog(log);
            if (parsed?.name === "TaskCreated") {
              taskId = parsed.args.taskId?.toString() || "unknown";
              break;
            }
          } catch {
            // Skip non-matching logs
          }
        }
      }

      setCreatedTaskId(taskId);
      await fetchTasks(); // Refresh task list
      setTimeout(() => setCreatedTaskId(null), 3000);
    } catch (error) {
      console.error("Failed to create task:", error);
      alert("Failed to create task: " + (error as Error).message);
    } finally {
      setIsCreating(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle className="w-5 h-5 text-white" />;
      case "executing": return <Loader2 className="w-5 h-5 text-white animate-spin" />;
      case "pending_confirmation": return <AlertCircle className="w-5 h-5 text-yellow-400" />;
      case "failed": return <AlertCircle className="w-5 h-5 text-red-400" />;
      default: return <Clock className="w-5 h-5 text-white/40" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "completed": return lang === "en" ? "Completed" : "已完成";
      case "executing": return lang === "en" ? "Executing" : "执行中";
      case "pending_confirmation": return lang === "en" ? "Needs Approval" : "需要审批";
      case "failed": return lang === "en" ? "Failed" : "失败";
      case "cancelled": return lang === "en" ? "Cancelled" : "已取消";
      default: return lang === "en" ? "Created" : "已创建";
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Header */}
        <div>
          <span className="text-xs text-white/40 uppercase tracking-[0.2em] block mb-2">Automation</span>
          <h1 className="text-4xl lg:text-5xl font-light text-white">
            {lang === "en" ? "Workflows" : "工作流"}
          </h1>
        </div>

        {/* Success Message */}
        {createdTaskId && (
          <div className="border border-white/20 p-4 bg-white/10">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-white" />
              <span className="text-white">
                {lang === "en" ? `Task created! ID: ${createdTaskId}` : `任务创建成功！ID: ${createdTaskId}`}
              </span>
              <Link href="/tasks" className="ml-auto text-sm text-white/60 hover:text-white">
                {lang === "en" ? "View Tasks →" : "查看任务 →"}
              </Link>
            </div>
          </div>
        )}

        {/* Workflow Templates */}
        <div>
          <h2 className="text-xs text-white/40 uppercase tracking-[0.2em] mb-6">
            {lang === "en" ? "Templates" : "模板"}
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {workflows.map((workflow) => (
              <div key={workflow.id} className="border border-white/10 p-6 hover:border-white/30 transition-all bg-white/5">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 border border-white/20 flex items-center justify-center">
                    <WorkflowIcon className="w-6 h-6 text-white/60" />
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-white/40 bg-white/5 px-2 py-1 block">
                      {workflow.steps.length} {lang === "en" ? "steps" : "步骤"}
                    </span>
                    <span className="text-xs text-white/60 mt-1 block">{workflow.budget} USDC</span>
                  </div>
                </div>

                <h3 className="text-xl font-medium text-white mb-2">{workflow.name}</h3>
                <p className="text-white/50 text-sm mb-4">{workflow.description}</p>

                <div className="space-y-2 mb-6">
                  {workflow.steps.map((step, index) => (
                    <div key={step.id} className="flex items-center gap-3 text-sm">
                      <div className="w-6 h-6 border border-white/20 flex items-center justify-center text-xs text-white/40">
                        {index + 1}
                      </div>
                      <span className="text-white/80">{step.name}</span>
                      {step.humanApproval && (
                        <span className="text-[10px] text-yellow-400 border border-yellow-400/30 px-2 py-0.5">
                          {lang === "en" ? "Approval" : "需确认"}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => handleCreateTask(workflow.id)}
                  disabled={isCreating}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white text-black font-medium hover:bg-white/90 transition disabled:opacity-50"
                >
                  {isCreating ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {lang === "en" ? "Creating..." : "创建中..."}</>
                  ) : (
                    <><Play className="w-4 h-4" /> {lang === "en" ? "Run Workflow" : "运行工作流"}</>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Tasks */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xs text-white/40 uppercase tracking-[0.2em]">
              {lang === "en" ? "Recent Tasks" : "最近任务"}
            </h2>
            <div className="flex items-center gap-4">
              {isLoading && <Loader2 className="w-4 h-4 text-white/40 animate-spin" />}
              <Link href="/tasks" className="text-sm text-white/60 hover:text-white flex items-center gap-1">
                {lang === "en" ? "View All" : "查看全部"} <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {tasks.length === 0 ? (
            <div className="border border-white/10 p-12 bg-white/5 text-center">
              <WorkflowIcon className="w-12 h-12 text-white/40 mx-auto mb-4" />
              <p className="text-white/50">{lang === "en" ? "No tasks yet. Run a workflow to get started." : "还没有任务。运行一个工作流开始吧。"}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => (
                <Link
                  key={task.id}
                  href={`/tasks?id=${task.id}`}
                  className="block border border-white/10 p-4 hover:border-white/30 transition-all bg-white/5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {getStatusIcon(task.status)}
                      <div>
                        <p className="font-medium text-white">{task.workflowName}</p>
                        <p className="text-sm text-white/40">ID: {task.taskId} · {task.createdAt.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className={task.status === "pending_confirmation" ? "text-yellow-400" : "text-white/60"}>
                          {getStatusText(task.status)}
                        </p>
                        <p className="text-xs text-white/40">{task.currentStepIndex} / {task.totalSteps} steps</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-white/40" />
                    </div>
                  </div>

                  <div className="mt-3 h-1 bg-white/10 overflow-hidden">
                    <div 
                      className={`h-full transition-all ${
                        task.status === "completed" ? "bg-green-400" :
                        task.status === "failed" ? "bg-red-400" :
                        task.status === "pending_confirmation" ? "bg-yellow-400" :
                        "bg-white"
                      }`}
                      style={{ width: `${(task.currentStepIndex / task.totalSteps) * 100}%` }} 
                    />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
