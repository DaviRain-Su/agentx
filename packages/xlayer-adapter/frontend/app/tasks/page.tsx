"use client";

import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useLangStore } from "@/store/lang";
import { useAppSettingsStore } from "@/store/settings";
import { useWeb3 } from "@/components/Web3Provider";
import { ethers } from "ethers";
import {
  ClipboardList,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  AlertCircle,
  Check,
  X,
  ExternalLink,
  Zap
} from "lucide-react";
import Link from "next/link";

// ─── A2A Job types ────────────────────────────────────────────────────────────

interface PaymentRecord {
  step: string;
  from?: string;
  to?: string;
  amount: string;
  txHash?: string;
  blockNumber?: number;
  explorerUrl?: string;
}

interface A2AJob {
  jobId: string;
  symbol: string;
  createdAt: number;
  status: "running" | "completed" | "failed" | "unknown";
  source?: "workflow" | "simulated";
  currentPrice?: number;
  priceSource?: string;
  action?: "BUY" | "SELL" | "HOLD";
  payments?: PaymentRecord[];
  totalSpent?: string;
  refunded?: string;
}

interface Task {
  id: string;
  taskId: string;
  workflowHash: string;
  workflowName: string;
  status: "created" | "pending_confirmation" | "executing" | "completed" | "failed" | "cancelled";
  currentStepIndex: number;
  totalSteps: number;
  agentDIDs: string[];
  budget: string;
  requester: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

interface PendingConfirmation {
  taskId: string;
  stepIndex: number;
  totalSteps: number;
  title: string;
  description: string;
  timestamp: number;
}

const CHAIN_STATUS_MAP: Record<number, Task["status"]> = {
  0: "created",
  1: "pending_confirmation",
  2: "executing",
  3: "completed",
  4: "failed",
  5: "cancelled",
};

export default function TasksPage() {
  const { lang } = useLangStore();
  const { workerUrl } = useAppSettingsStore();
  const workerBase = workerUrl.replace(/\/+$/, "");
  const { taskManager, paymentHub, address, signer } = useWeb3();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [pendingConfirmations, setPendingConfirmations] = useState<PendingConfirmation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [txPending, setTxPending] = useState(false);

  // ── A2A Jobs state ──────────────────────────────────────────────────────────
  const [a2aJobs, setA2aJobs] = useState<A2AJob[]>([]);
  const [selectedA2aJob, setSelectedA2aJob] = useState<A2AJob | null>(null);

  // Load A2A jobs from localStorage and poll each one
  const fetchA2aJobs = useCallback(async () => {
    if (typeof window === "undefined") return;
    const stored: { jobId: string; symbol: string; createdAt: number }[] =
      JSON.parse(localStorage.getItem("a2a_jobs") || "[]");
    const simulated: A2AJob[] =
      JSON.parse(localStorage.getItem("a2a_simulated_jobs") || "[]");
    if (stored.length === 0 && simulated.length === 0) {
      setA2aJobs([]);
      return;
    }

    // Only keep the 10 most recent
    const recent = stored.slice(-10);

    const updated = await Promise.all(
      recent.map(async ({ jobId, symbol, createdAt }) => {
        try {
          const res = await fetch(`${workerBase}/api/a2a/${jobId}`);
          if (!res.ok) return { jobId, symbol, createdAt, status: "unknown" as const };
          const data = await res.json() as {
            status?: string;
            result?: {
              status?: string;
              currentPrice?: number;
              priceSource?: string;
              action?: "BUY" | "SELL" | "HOLD";
              payments?: PaymentRecord[];
              totalSpent?: string;
              refunded?: string;
            };
          };

          const cfStatus = data.status; // "running" | "complete" | "errored" | "paused" | "waiting"
          const result = data.result;
          const jobStatus: A2AJob["status"] =
            cfStatus === "completed" || cfStatus === "complete" ? "completed" :
            cfStatus === "failed" || cfStatus === "errored" ? "failed" :
            cfStatus === "running" || cfStatus === "waiting" || cfStatus === "paused" ? "running" :
            "unknown";

          return {
            jobId,
            symbol,
            createdAt,
            status: jobStatus,
            source: "workflow",
            currentPrice: result?.currentPrice,
            priceSource: result?.priceSource,
            action: result?.action,
            payments: result?.payments,
            totalSpent: result?.totalSpent,
            refunded: result?.refunded,
          } as A2AJob;
        } catch {
          return { jobId, symbol, createdAt, status: "unknown" as const };
        }
      })
    );

    const merged = [...simulated, ...updated]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20);
    setA2aJobs(merged);

    // Update selected if open
    if (selectedA2aJob) {
      const refreshed = merged.find(j => j.jobId === selectedA2aJob.jobId);
      if (refreshed) setSelectedA2aJob(refreshed);
    }
  }, [selectedA2aJob, workerBase]);

  useEffect(() => {
    fetchA2aJobs();
    const interval = setInterval(fetchA2aJobs, 5000);
    return () => clearInterval(interval);
  }, [fetchA2aJobs]);

  // Convert chain data to Task format
  const chainTaskToTask = useCallback((raw: any, taskId: string): Task => {
    const statusNum = Number(raw.status ?? 0);
    return {
      id: taskId,
      taskId: taskId,
      workflowHash: raw.workflowHash || "",
      workflowName: `Task #${taskId}`,
      status: CHAIN_STATUS_MAP[statusNum] ?? "created",
      currentStepIndex: Number(raw.currentStepIndex ?? 0),
      totalSteps: Number(raw.agentDIDs?.length ?? 1),
      agentDIDs: raw.agentDIDs || [],
      budget: ethers.formatUnits(raw.totalBudget || 0, 6),
      requester: raw.requester,
      createdAt: new Date(Number(raw.createdAt ?? 0) * 1000),
      updatedAt: new Date(Number(raw.updatedAt ?? 0) * 1000),
      completedAt: raw.completedAt && Number(raw.completedAt) > 0
        ? new Date(Number(raw.completedAt) * 1000)
        : undefined,
    };
  }, []);

  // Fetch all tasks from chain
  const fetchTasks = useCallback(async () => {
    if (!taskManager || !address) return;
    
    setIsLoading(true);
    try {
      // Get all task IDs for this requester
      const taskIds: bigint[] = await taskManager.getRequesterTasks(address);
      
      // Fetch details for each task
      const taskPromises = taskIds.map(async (id) => {
        try {
          const raw = await taskManager.getTask(id);
          return chainTaskToTask(raw, id.toString());
        } catch (err) {
          console.error(`Failed to fetch task ${id}:`, err);
          return null;
        }
      });

      const fetchedTasks = (await Promise.all(taskPromises))
        .filter((t): t is Task => t !== null)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      setTasks(fetchedTasks);
      
      // Check for pending confirmations (tasks in pending_confirmation status)
      const pendingTasks = fetchedTasks.filter(t => t.status === "pending_confirmation");
      const confirmations: PendingConfirmation[] = pendingTasks.map(task => ({
        taskId: task.taskId,
        stepIndex: task.currentStepIndex,
        totalSteps: task.totalSteps,
        title: `Confirm Step ${task.currentStepIndex + 1}/${task.totalSteps}`,
        description: `Task #${task.taskId} is waiting for your approval to continue`,
        timestamp: Date.now(),
      }));
      setPendingConfirmations(confirmations);
      
      // Update selected task if it's in the list
      if (selectedTask) {
        const updated = fetchedTasks.find(t => t.id === selectedTask.id);
        if (updated) setSelectedTask(updated);
      }
    } catch (err) {
      console.error("Failed to fetch tasks:", err);
    } finally {
      setIsLoading(false);
    }
  }, [taskManager, address, chainTaskToTask, selectedTask]);

  // Initial load and polling
  useEffect(() => {
    if (!taskManager || !address) return;
    
    fetchTasks();
    const interval = setInterval(fetchTasks, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, [taskManager, address, fetchTasks]);

  // Handle confirmation approval/rejection — notifies Worker via KV
  const handleConfirm = async (taskId: string, approved: boolean) => {
    setTxPending(true);
    try {
      const res = await fetch(`${workerBase}/tasks/${taskId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved }),
      });
      if (!res.ok) throw new Error(`Worker responded ${res.status}`);

      // Remove from pending list immediately for responsive UI
      setPendingConfirmations(prev => prev.filter(c => c.taskId !== taskId));

      // Refresh tasks to pick up new status
      await fetchTasks();
    } catch (err) {
      console.error("Confirmation failed:", err);
    } finally {
      setTxPending(false);
    }
  };

  // Cancel a task
  const handleCancel = async (taskId: string) => {
    if (!taskManager || !signer) return;
    
    setTxPending(true);
    try {
      const tx = await taskManager.cancelTask(taskId);
      await tx.wait();
      await fetchTasks();
    } catch (err) {
      console.error("Cancel failed:", err);
    } finally {
      setTxPending(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle className="w-5 h-5 text-white" />;
      case "executing": return <Loader2 className="w-5 h-5 text-white animate-spin" />;
      case "pending_confirmation": return <AlertCircle className="w-5 h-5 text-yellow-400" />;
      case "failed": return <XCircle className="w-5 h-5 text-red-400" />;
      case "cancelled": return <XCircle className="w-5 h-5 text-white/40" />;
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
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <span className="text-xs text-white/40 uppercase tracking-[0.2em] block mb-2">Operations</span>
          <h1 className="text-4xl lg:text-5xl font-light text-white">{lang === "en" ? "Tasks" : "任务"}</h1>
        </div>

        {/* Pending Confirmations */}
        {pendingConfirmations.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xs text-yellow-400 uppercase tracking-[0.2em]">
              Pending Confirmations ({pendingConfirmations.length})
            </h2>
            <div className="space-y-3">
              {pendingConfirmations.map((conf) => (
                <div key={conf.taskId} className="border border-yellow-400/30 p-6 bg-yellow-400/5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-medium text-white mb-1">{conf.title}</h3>
                      <p className="text-white/50 mb-2">{conf.description}</p>
                      <div className="flex items-center gap-4 text-sm text-white/40">
                        <span>Task ID: #{conf.taskId}</span>
                        <span>Step: {conf.stepIndex + 1} / {conf.totalSteps}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleConfirm(conf.taskId, false)} 
                        disabled={txPending}
                        className="p-2 border border-white/20 text-white/60 hover:bg-white/5 transition disabled:opacity-50"
                      >
                        <X className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => handleConfirm(conf.taskId, true)} 
                        disabled={txPending}
                        className="p-2 bg-yellow-400 text-black hover:bg-yellow-300 transition disabled:opacity-50"
                      >
                        <Check className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* A2A Payment Jobs */}
        {a2aJobs.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xs text-white/40 uppercase tracking-[0.2em] flex items-center gap-2">
              <Zap className="w-3 h-3" />
              A2A Payment Workflows ({a2aJobs.length})
            </h2>
            <div className="grid lg:grid-cols-2 gap-4">
              {a2aJobs.map((job) => (
                <button
                  key={job.jobId}
                  onClick={() => setSelectedA2aJob(selectedA2aJob?.jobId === job.jobId ? null : job)}
                  className={`text-left border p-4 transition-all ${
                    selectedA2aJob?.jobId === job.jobId
                      ? "bg-white/10 border-white"
                      : "bg-white/5 border-white/10 hover:border-white/30"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {job.status === "running" && <Loader2 className="w-4 h-4 text-white/60 animate-spin" />}
                      {job.status === "completed" && <CheckCircle className="w-4 h-4 text-green-400" />}
                      {job.status === "failed" && <XCircle className="w-4 h-4 text-red-400" />}
                      {job.status === "unknown" && <Clock className="w-4 h-4 text-white/40" />}
                      <span className="font-medium text-white">{job.symbol} A2A Flow</span>
                      {job.source === "simulated" && (
                        <span className="text-[10px] text-amber-300 border border-amber-400/30 px-1.5 py-0.5">
                          {lang === "en" ? "Demo" : "演示"}
                        </span>
                      )}
                    </div>
                    <span className={`text-xs ${
                      job.status === "completed" ? "text-green-400" :
                      job.status === "failed" ? "text-red-400" :
                      job.status === "running" ? "text-white/60" : "text-white/40"
                    }`}>
                      {job.status === "completed" ? (lang === "en" ? "Completed" : "已完成") :
                       job.status === "failed" ? (lang === "en" ? "Failed" : "失败") :
                       job.status === "running" ? (lang === "en" ? "Running" : "执行中") :
                       (lang === "en" ? "Unknown" : "未知")}
                    </span>
                  </div>
                  {job.currentPrice !== undefined && (
                    <p className="text-sm text-white/60">
                      {job.symbol} ${job.currentPrice.toLocaleString()} · {job.priceSource}
                      {job.action && <span className={`ml-2 font-medium ${
                        job.action === "BUY" ? "text-green-400" :
                        job.action === "SELL" ? "text-red-400" : "text-white/60"
                      }`}>{job.action}</span>}
                    </p>
                  )}
                  {job.payments && (
                    <p className="text-xs text-white/40 mt-1">
                      {job.payments.length} {job.source === "simulated"
                        ? (lang === "en" ? "simulated steps" : "笔模拟步骤")
                        : (lang === "en" ? "on-chain payments" : "笔链上支付")} · {job.totalSpent} USDC
                    </p>
                  )}
                  <p className="text-xs text-white/30 mt-1">
                    {new Date(job.createdAt).toLocaleString()} · ID: {job.jobId.slice(0, 8)}…
                  </p>
                </button>
              ))}
            </div>

            {/* A2A Payment Timeline */}
            {selectedA2aJob?.payments && selectedA2aJob.payments.length > 0 && (
              <div className="border border-white/10 bg-white/5 p-6 space-y-4">
                <h3 className="text-xs text-white/40 uppercase tracking-[0.2em]">
                  {lang === "en" ? "Payment Chain" : "支付链"}
                </h3>
                <div className="space-y-3">
                  {selectedA2aJob.payments.map((p, i) => (
                    <div key={i} className="flex items-start gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-2 h-2 rounded-full bg-green-400 mt-1.5" />
                        {i < selectedA2aJob.payments!.length - 1 && (
                          <div className="w-px flex-1 bg-white/10 mt-1 mb-0" style={{ minHeight: "24px" }} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 pb-3">
                        <p className="text-sm text-white font-medium">{p.step}</p>
                        <p className="text-xs text-white/50 mt-0.5">{p.amount}</p>
                        {p.explorerUrl && p.txHash ? (
                          <a
                            href={p.explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-white/40 hover:text-white transition mt-1 font-mono"
                          >
                            <ExternalLink className="w-3 h-3 flex-shrink-0" />
                            {p.txHash.slice(0, 10)}…{p.txHash.slice(-6)}
                          </a>
                        ) : (
                          <p className="text-xs text-white/40 mt-1">{lang === "en" ? "simulation" : "模拟执行"}</p>
                        )}
                      </div>
                      <span className="text-xs text-white/40 mt-1">{p.blockNumber ? `#${p.blockNumber}` : "--"}</span>
                    </div>
                  ))}
                </div>
                {selectedA2aJob.totalSpent && (
                  <div className="pt-3 border-t border-white/10 flex justify-between text-sm">
                    <span className="text-white/40">{lang === "en" ? "Total spent" : "总支出"}</span>
                    <span className="text-white">{selectedA2aJob.totalSpent} USDC</span>
                  </div>
                )}
                {selectedA2aJob.refunded && parseFloat(selectedA2aJob.refunded) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-white/40">{lang === "en" ? "Refunded" : "已退款"}</span>
                    <span className="text-green-400">{selectedA2aJob.refunded} USDC</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Task Grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Task List */}
          <div className="lg:col-span-1 space-y-3">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs text-white/40 uppercase tracking-[0.2em]">All Tasks</h2>
              {isLoading && <Loader2 className="w-4 h-4 text-white/40 animate-spin" />}
            </div>
            
            {tasks.length === 0 ? (
              <div className="border border-white/10 p-8 bg-white/5 text-center">
                <ClipboardList className="w-12 h-12 text-white/40 mx-auto mb-4" />
                <p className="text-white/50">{lang === "en" ? "No tasks yet" : "还没有任务"}</p>
                <Link href="/workflows" className="text-white hover:underline mt-2 inline-block">Create one →</Link>
              </div>
            ) : (
              tasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => setSelectedTask(task)}
                  className={`w-full text-left border p-4 transition-all ${
                    selectedTask?.id === task.id
                      ? "bg-white/10 border-white"
                      : "bg-white/5 border-white/10 hover:border-white/30"
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    {getStatusIcon(task.status)}
                    <span className="font-medium text-white truncate">{task.workflowName}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/40">{task.budget} USDC</span>
                    <span className={task.status === "pending_confirmation" ? "text-yellow-400" : "text-white/60"}>
                      {getStatusText(task.status)}
                    </span>
                  </div>
                  <div className="mt-2 h-1 bg-white/10 overflow-hidden">
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
                </button>
              ))
            )}
          </div>

          {/* Task Detail */}
          <div className="lg:col-span-2">
            {selectedTask ? (
              <div className="border border-white/10 bg-white/5 p-6 space-y-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-medium text-white">{selectedTask.workflowName}</h2>
                    <p className="text-white/40 mt-1">ID: {selectedTask.taskId}</p>
                    <p className="text-white/40 text-sm">Budget: {selectedTask.budget} USDC</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(selectedTask.status)}
                    <span className={selectedTask.status === "pending_confirmation" ? "text-yellow-400" : "text-white/60"}>
                      {getStatusText(selectedTask.status)}
                    </span>
                  </div>
                </div>

                {/* Progress */}
                <div>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-white/40">Progress</span>
                    <span className="text-white">{selectedTask.currentStepIndex} / {selectedTask.totalSteps} steps</span>
                  </div>
                  <div className="h-2 bg-white/10 overflow-hidden">
                    <div 
                      className={`h-full transition-all ${
                        selectedTask.status === "completed" ? "bg-green-400" :
                        selectedTask.status === "failed" ? "bg-red-400" :
                        selectedTask.status === "pending_confirmation" ? "bg-yellow-400" :
                        "bg-white"
                      }`}
                      style={{ width: `${(selectedTask.currentStepIndex / selectedTask.totalSteps) * 100}%` }} 
                    />
                  </div>
                </div>

                {/* Agent List */}
                <div className="space-y-2">
                  <h3 className="text-xs text-white/40 uppercase tracking-[0.2em]">Agents</h3>
                  {selectedTask.agentDIDs.map((did, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 border border-white/10 bg-white/5">
                      <div className={`w-2 h-2 rounded-full ${
                        index < selectedTask.currentStepIndex ? "bg-green-400" :
                        index === selectedTask.currentStepIndex ? "bg-yellow-400 animate-pulse" :
                        "bg-white/20"
                      }`} />
                      <span className="text-sm text-white/60 font-mono truncate">{did}</span>
                      {index < selectedTask.currentStepIndex && <CheckCircle className="w-4 h-4 text-green-400 ml-auto" />}
                      {index === selectedTask.currentStepIndex && selectedTask.status === "pending_confirmation" && (
                        <AlertCircle className="w-4 h-4 text-yellow-400 ml-auto" />
                      )}
                    </div>
                  ))}
                </div>

                {/* Actions */}
                {selectedTask.status === "created" && (
                  <button
                    onClick={() => handleCancel(selectedTask.taskId)}
                    disabled={txPending}
                    className="w-full py-3 border border-red-400/30 text-red-400 hover:bg-red-400/10 transition disabled:opacity-50"
                  >
                    Cancel Task
                  </button>
                )}

                {/* View on Explorer */}
                <a
                  href={`https://www.okx.com/web3/explorer/xlayer-test/address/${selectedTask.requester}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-white/40 hover:text-white transition text-sm"
                >
                  <ExternalLink className="w-4 h-4" />
                  View on Explorer
                </a>
              </div>
            ) : (
              <div className="border border-white/10 bg-white/5 p-12 text-center">
                <ClipboardList className="w-16 h-16 text-white/40 mx-auto mb-4" />
                <p className="text-white/50">Select a task to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
