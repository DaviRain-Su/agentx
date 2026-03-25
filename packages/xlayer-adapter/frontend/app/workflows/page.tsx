"use client";

import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useLangStore } from "@/store/lang";
import { useAppSettingsStore } from "@/store/settings";
import { useWeb3 } from "@/components/Web3Provider";
import { useRouter } from "next/navigation";
import { ethers } from "ethers";
import { Workflow as WorkflowIcon, Play, ChevronRight, CheckCircle, Clock, AlertCircle, Loader2, Plus, X, Terminal } from "lucide-react";
import Link from "next/link";
import { workerApi, type WorkerAgentEntry, type A2ASimulateResponse } from "@/lib/api/worker";

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

interface SimulatedPayment {
  step: string;
  amount: string;
}

interface CreateWorkflowModalProps {
  workerBase: string;
  lang: string;
  onClose: () => void;
  onSubmit: (goal: string, agents: string[], budget: string) => Promise<void>;
}

function CreateWorkflowModal({ workerBase, lang, onClose, onSubmit }: CreateWorkflowModalProps) {
  const [agents, setAgents] = useState<Record<string, WorkerAgentEntry>>({});
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [goal, setGoal] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [budget, setBudget] = useState("1.0");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    workerApi.getAgents(workerBase)
      .then((d) => { setAgents(d); setLoadingAgents(false); })
      .catch(() => setLoadingAgents(false));
  }, [workerBase]);

  const toggleAgent = (name: string) => {
    setSelectedAgents(prev =>
      prev.includes(name) ? prev.filter(a => a !== name) : [...prev, name]
    );
  };

  const handleSubmit = async () => {
    if (!goal.trim() || selectedAgents.length === 0) return;
    setSubmitting(true);
    try {
      await onSubmit(goal.trim(), selectedAgents, budget);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg border border-white/20 bg-black">
        {/* Modal header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div>
            <span className="text-xs text-white/40 uppercase tracking-[0.2em] block mb-1">Custom</span>
            <h2 className="text-xl font-medium text-white">
              {lang === "en" ? "Create Workflow" : "创建工作流"}
            </h2>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Goal */}
          <div>
            <label className="text-xs text-white/40 uppercase tracking-wider block mb-2">
              {lang === "en" ? "Task Goal" : "任务目标"}
            </label>
            <textarea
              value={goal}
              onChange={e => setGoal(e.target.value)}
              rows={3}
              placeholder={lang === "en" ? "Describe what you want the agents to do..." : "描述你希望 Agent 完成的任务..."}
              className="w-full bg-black/30 border border-white/20 px-3 py-2 text-sm text-white placeholder-white/30 resize-none"
            />
          </div>

          {/* Agent selection */}
          <div>
            <label className="text-xs text-white/40 uppercase tracking-wider block mb-3">
              {lang === "en" ? "Select Agents" : "选择 Agent"}
            </label>
            {loadingAgents ? (
              <div className="flex items-center gap-2 text-white/40 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                {lang === "en" ? "Loading agents..." : "加载 Agent 中..."}
              </div>
            ) : Object.keys(agents).length === 0 ? (
              <p className="text-white/40 text-sm">
                {lang === "en" ? "No agents found. Worker may be offline." : "未找到 Agent，Worker 可能离线。"}
              </p>
            ) : (
              <div className="space-y-2">
                {Object.entries(agents).map(([name, info]) => {
                  const checked = selectedAgents.includes(name);
                  return (
                    <button
                      key={name}
                      onClick={() => toggleAgent(name)}
                      className={`w-full flex items-center gap-3 p-3 border transition-all text-left ${
                        checked ? "border-white/50 bg-white/10" : "border-white/10 bg-white/5 hover:border-white/30"
                      }`}
                    >
                      <div className={`w-8 h-8 border flex items-center justify-center shrink-0 transition ${
                        checked ? "border-white bg-white" : "border-white/20"
                      }`}>
                        <Terminal className={`w-4 h-4 ${checked ? "text-black" : "text-white/60"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white capitalize">{name.replace(/-/g, " ")}</p>
                        <p className="text-xs text-white/40 truncate">
                          {info.address.slice(0, 6)}...{info.address.slice(-4)}
                          {info.fee ? ` · ${info.fee}` : ""}
                        </p>
                      </div>
                      <div className={`w-4 h-4 border flex items-center justify-center shrink-0 ${
                        checked ? "border-white bg-white" : "border-white/30"
                      }`}>
                        {checked && <div className="w-2 h-2 bg-black" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Budget */}
          <div>
            <label className="text-xs text-white/40 uppercase tracking-wider block mb-2">
              {lang === "en" ? "Budget (USDC)" : "预算 (USDC)"}
            </label>
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={budget}
              onChange={e => setBudget(e.target.value)}
              className="w-full bg-black/30 border border-white/20 px-3 py-2 text-sm text-white"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-white/10">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-white/20 text-white/60 hover:text-white hover:border-white/40 transition text-sm"
          >
            {lang === "en" ? "Cancel" : "取消"}
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !goal.trim() || selectedAgents.length === 0}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-white text-black font-medium hover:bg-white/90 transition disabled:opacity-40 text-sm"
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> {lang === "en" ? "Running..." : "运行中..."}</>
            ) : (
              <><Play className="w-4 h-4" /> {lang === "en" ? "Run Workflow" : "运行工作流"}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
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
  const router = useRouter();
  const { lang } = useLangStore();
  const { workerUrl, defaultBudgetUsdc } = useAppSettingsStore();
  const workerBase = workerUrl.replace(/\/+$/, "");
  const { taskManager, usdc, address, signer } = useWeb3();
  const [workflows] = useState(WORKFLOW_TEMPLATES);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createdTaskId, setCreatedTaskId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [budgetByWorkflow, setBudgetByWorkflow] = useState<Record<string, string>>(() =>
    Object.fromEntries(WORKFLOW_TEMPLATES.map((w) => [w.id, defaultBudgetUsdc || w.budget]))
  );

  useEffect(() => {
    setBudgetByWorkflow((prev) => {
      const next: Record<string, string> = { ...prev };
      for (const workflow of WORKFLOW_TEMPLATES) {
        if (!next[workflow.id]) {
          next[workflow.id] = defaultBudgetUsdc || workflow.budget;
        }
      }
      return next;
    });
  }, [defaultBudgetUsdc]);

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

  const resolveBudget = (workflow: typeof WORKFLOW_TEMPLATES[number]) => {
    const raw = (budgetByWorkflow[workflow.id] || "").trim();
    const value = Number.parseFloat(raw);
    if (Number.isFinite(value) && value > 0) return value.toString();
    const configuredDefault = Number.parseFloat(defaultBudgetUsdc);
    if (Number.isFinite(configuredDefault) && configuredDefault > 0) return configuredDefault.toString();
    return workflow.budget;
  };

  const saveA2AJob = (job: { jobId: string; symbol: string; createdAt: number }) => {
    if (typeof window === "undefined") return;
    const existing: { jobId: string; symbol: string; createdAt: number }[] =
      JSON.parse(localStorage.getItem("a2a_jobs") || "[]");
    localStorage.setItem("a2a_jobs", JSON.stringify([...existing, job].slice(-20)));
  };

  const ensureA2AAllowance = async (
    token: NonNullable<typeof usdc>,
    userAddress: string,
    budget: string
  ) => {
    const agents = await workerApi.getAgents(workerBase);
    const orchestratorAddress = agents?.orchestrator?.address;
    if (!orchestratorAddress || !ethers.isAddress(orchestratorAddress)) {
      throw new Error("Invalid orchestrator address from worker");
    }

    const budgetWei = ethers.parseUnits(budget, 6);
    const allowance = await token.allowance(userAddress, orchestratorAddress);
    if (allowance < budgetWei) {
      const approveTx = await token.approve(orchestratorAddress, budgetWei);
      await approveTx.wait();
    }
  };

  const saveSimulatedA2AJob = (
    workflow: typeof WORKFLOW_TEMPLATES[number],
    budget: string,
    simulation: A2ASimulateResponse
  ) => {
    if (typeof window === "undefined") return;
    const jobId = `sim_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`;
    const simulatedJob = {
      jobId,
      source: "simulated" as const,
      symbol: simulation.symbol,
      createdAt: Date.now(),
      status: "completed" as const,
      currentPrice: simulation.currentPrice,
      priceSource: "simulation",
      action: simulation.action,
      totalSpent: budget,
      payments: simulation.simulatedPayments.map((p, index) => ({
        step: p.step,
        amount: p.amount,
        blockNumber: index + 1,
      })),
      workflowName: workflow.name,
    };
    const existing = JSON.parse(localStorage.getItem("a2a_simulated_jobs") || "[]");
    localStorage.setItem("a2a_simulated_jobs", JSON.stringify([simulatedJob, ...existing].slice(0, 20)));
    return jobId;
  };

  const runSimulationFlow = async (
    workflow: typeof WORKFLOW_TEMPLATES[number],
    budget: string,
    symbol: string,
    type: string,
    threshold: number
  ) => {
    const simulation = await workerApi.simulateA2A({
      symbol,
      budget: parseFloat(budget),
      type,
      threshold,
    }, workerBase);
    const simId = saveSimulatedA2AJob(workflow, budget, simulation) || "simulated";
    setCreatedTaskId(simId);
    router.push("/tasks");
  };

  // Create task on chain (or run simulated flow when wallet is not connected)
  const handleCreateTask = async (workflowId: string) => {
    const workflow = workflows.find(w => w.id === workflowId);
    if (!workflow) return;
    const effectiveBudget = resolveBudget(workflow);
    const symbol = workflow.id === "wf-2" ? "BTC" : "ETH";
    const a2aType = workflow.id === "wf-1" ? "price_alert" : "price_only";
    const threshold = workflow.id === "wf-1" ? 1800 : 0;
    const walletReady = !!taskManager && !!usdc && !!signer && !!address;

    setIsCreating(true);
    try {
      if (!walletReady) {
        await runSimulationFlow(workflow, effectiveBudget, symbol, a2aType, threshold);
        return;
      }
      const tm = taskManager as NonNullable<typeof taskManager>;
      const token = usdc as NonNullable<typeof usdc>;
      const userAddress = address as string;

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
      const totalBudget = ethers.parseUnits(effectiveBudget, 6);

      // 4. Check and approve USDC
      const currentAllowance = await token.allowance(userAddress, await tm.getAddress());
      if (currentAllowance < totalBudget) {
        const approveTx = await token.approve(await tm.getAddress(), totalBudget);
        await approveTx.wait();
      }

      // 5. Create task on chain
      const tx = await tm.createTask(workflowHash, agentDIDs, totalBudget);
      const receipt = await tx.wait();

      // Extract task ID from event
      let taskId = "unknown";
      if (receipt?.logs) {
        for (const log of receipt.logs) {
          try {
            const parsed = tm.interface.parseLog(log);
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

      // 6. Also trigger A2A Workflow for real-time payment tracking
      try {
        await ensureA2AAllowance(token, userAddress, effectiveBudget);
        const data = await workerApi.startA2A({
          symbol,
          budget: parseFloat(effectiveBudget),
          callerAddress: userAddress,
          type: a2aType,
          threshold,
        }, workerBase);
        if (data.jobId) {
          saveA2AJob({ jobId: data.jobId, symbol, createdAt: Date.now() });
        }
      } catch (err) {
        console.error("A2A workflow trigger failed:", err);
        try {
          await runSimulationFlow(workflow, effectiveBudget, symbol, a2aType, threshold);
          return;
        } catch (simError) {
          console.error("Simulation fallback failed:", simError);
        }
      }

      router.push("/tasks");
      setTimeout(() => setCreatedTaskId(null), 5000);
    } catch (error) {
      console.error("Failed to create task:", error);
      if (walletReady) {
        try {
          await runSimulationFlow(workflow, effectiveBudget, symbol, a2aType, threshold);
          return;
        } catch (simError) {
          alert(`Failed to create task: ${(error as Error).message}. Simulation fallback also failed: ${simError instanceof Error ? simError.message : String(simError)}`);
          return;
        }
      }
      alert("Failed to create task: " + (error as Error).message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCustomWorkflow = async (goal: string, agentNames: string[], budget: string) => {
    const symbol = goal.toLowerCase().includes("btc") ? "BTC" : "ETH";
    const syntheticWorkflow = {
      id: `custom_${Date.now()}`,
      name: goal.slice(0, 50),
      steps: agentNames.map((a, i) => ({ id: `step-${i + 1}`, agentId: a, config: {} })),
      budget,
    };
    const jobId = `sim_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`;
    try {
      const simulation = await workerApi.simulateA2A(
        { symbol, budget: parseFloat(budget), type: "price_only", threshold: 0 },
        workerBase
      );
      const simulatedJob = {
        jobId,
        source: "simulated" as const,
        symbol: simulation.symbol,
        createdAt: Date.now(),
        status: "completed" as const,
        currentPrice: simulation.currentPrice,
        priceSource: "simulation",
        action: simulation.action,
        totalSpent: budget,
        payments: simulation.simulatedPayments.map((p, index) => ({
          step: p.step,
          amount: p.amount,
          blockNumber: index + 1,
        })),
        workflowName: syntheticWorkflow.name,
        agents: agentNames,
        goal,
      };
      const existing = JSON.parse(localStorage.getItem("a2a_simulated_jobs") || "[]");
      localStorage.setItem("a2a_simulated_jobs", JSON.stringify([simulatedJob, ...existing].slice(0, 20)));
    } catch {
      const existing = JSON.parse(localStorage.getItem("a2a_simulated_jobs") || "[]");
      localStorage.setItem("a2a_simulated_jobs", JSON.stringify([{
        jobId, source: "simulated", symbol, createdAt: Date.now(),
        status: "completed", workflowName: syntheticWorkflow.name, agents: agentNames, goal,
        payments: [], totalSpent: budget,
      }, ...existing].slice(0, 20)));
    }
    setShowCreateModal(false);
    setCreatedTaskId(jobId);
    router.push("/tasks");
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
      {showCreateModal && (
        <CreateWorkflowModal
          workerBase={workerBase}
          lang={lang}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCustomWorkflow}
        />
      )}
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <span className="text-xs text-white/40 uppercase tracking-[0.2em] block mb-2">Automation</span>
            <h1 className="text-4xl lg:text-5xl font-light text-white">
              {lang === "en" ? "Workflows" : "工作流"}
            </h1>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 border border-white/20 text-white/60 hover:text-white hover:border-white/50 transition text-sm"
          >
            <Plus className="w-4 h-4" />
            {lang === "en" ? "Create Workflow" : "创建工作流"}
          </button>
        </div>

        {/* Success Message */}
        {createdTaskId && (
          <div className="border border-white/20 p-4 bg-white/10">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-white" />
              <div>
                <span className="text-white">
                  {lang === "en" ? `Task created! ID: ${createdTaskId}` : `任务创建成功！ID: ${createdTaskId}`}
                </span>
                <p className="text-xs text-white/50 mt-0.5">
                  {lang === "en" ? "A2A payment workflow started — track payments in Tasks" : "A2A 支付流程已启动 — 在任务页面查看每笔链上支付"}
                </p>
              </div>
              <Link href="/tasks" className="ml-auto text-sm text-white/60 hover:text-white whitespace-nowrap">
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
                    <span className="text-xs text-white/60 mt-1 block">{resolveBudget(workflow)} USDC</span>
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

                <div className="mb-4">
                  <label className="text-xs text-white/40 uppercase tracking-wider">
                    {lang === "en" ? "Budget (USDC)" : "预算 (USDC)"}
                  </label>
                  <input
                    value={budgetByWorkflow[workflow.id] ?? workflow.budget}
                    onChange={(e) =>
                      setBudgetByWorkflow((prev) => ({ ...prev, [workflow.id]: e.target.value }))
                    }
                    className="mt-1 w-full bg-black/30 border border-white/20 px-3 py-2 text-sm text-white"
                    placeholder={workflow.budget}
                  />
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
