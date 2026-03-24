"use client";

import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useLangStore } from "@/store/lang";
import { mockService, Task, ConfirmationRequest } from "@/lib/mockService";
import { useWeb3 } from "@/components/Web3Provider";
import { ClipboardList, ChevronRight, CheckCircle, XCircle, Clock, Loader2, AlertCircle, Check, X, Link2 } from "lucide-react";
import Link from "next/link";

const CHAIN_STATUS_MAP: Record<number, Task["status"]> = {
  0: "created",
  1: "pending_confirmation",
  2: "executing",
  3: "completed",
  4: "failed",
  5: "cancelled",
};

function chainTaskToTask(raw: any): Task {
  const id = raw.id?.toString() || "0";
  const statusNum = Number(raw.status ?? 0);
  return {
    id: `chain-${id}`,
    workflowId: raw.workflowHash || "",
    workflowName: `On-Chain Task #${id}`,
    status: CHAIN_STATUS_MAP[statusNum] ?? "created",
    currentStepIndex: Number(raw.currentStepIndex ?? 0),
    stepResults: [],
    totalSteps: Number(raw.agentDIDs?.length ?? 1),
    createdAt: new Date(Number(raw.createdAt ?? 0) * 1000),
    updatedAt: new Date(Number(raw.updatedAt ?? 0) * 1000),
    completedAt: raw.completedAt && Number(raw.completedAt) > 0
      ? new Date(Number(raw.completedAt) * 1000)
      : undefined,
  };
}

export default function TasksPage() {
  const { lang } = useLangStore();
  const { taskManager, address } = useWeb3();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [pendingConfirmations, setPendingConfirmations] = useState<ConfirmationRequest[]>([]);

  // Poll on-chain tasks
  const pollChainTasks = useCallback(async () => {
    if (!taskManager || !address) return;
    try {
      const taskIds: bigint[] = await taskManager.getRequesterTasks(address);
      const chainTasks = await Promise.all(
        taskIds.map(async (id) => {
          const raw = await taskManager.getTask(id);
          return chainTaskToTask(raw);
        })
      );
      setTasks((prev) => {
        const mockTasks = prev.filter((t) => !t.id.startsWith("chain-"));
        const merged = [...chainTasks, ...mockTasks];
        return merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      });
    } catch (err) {
      console.error("Chain polling error:", err);
    }
  }, [taskManager, address]);

  useEffect(() => {
    setTasks(mockService.getAllTasks());

    const unsubscribeTask = mockService.subscribe("taskUpdated", (task: Task) => {
      setTasks((prev) => {
        const index = prev.findIndex((t) => t.id === task.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = task;
          return updated;
        }
        return [task, ...prev];
      });
      if (selectedTask?.id === task.id) setSelectedTask(task);
    });

    const unsubscribeConf = mockService.subscribe("confirmationCreated", (conf: ConfirmationRequest) => {
      setPendingConfirmations((prev) => [...prev, conf]);
    });

    const unsubscribeConfUpdate = mockService.subscribe("confirmationUpdated", (conf: ConfirmationRequest) => {
      setPendingConfirmations((prev) => prev.filter((c) => c.id !== conf.id));
    });

    return () => {
      unsubscribeTask();
      unsubscribeConf();
      unsubscribeConfUpdate();
    };
  }, [selectedTask?.id]);

  useEffect(() => {
    setPendingConfirmations(mockService.getPendingConfirmations());
  }, []);

  // Start chain polling when wallet connected
  useEffect(() => {
    if (!taskManager || !address) return;
    pollChainTasks();
    const interval = setInterval(pollChainTasks, 10_000);
    return () => clearInterval(interval);
  }, [taskManager, address, pollChainTasks]);

  const handleConfirm = (confirmationId: string, approved: boolean) => {
    mockService.respondToConfirmation(confirmationId, approved);
    setPendingConfirmations((prev) => prev.filter((c) => c.id !== confirmationId));
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle className="w-5 h-5 text-white" />;
      case "executing": return <Loader2 className="w-5 h-5 text-white animate-spin" />;
      case "pending_confirmation": return <AlertCircle className="w-5 h-5 text-white/60" />;
      case "failed": return <XCircle className="w-5 h-5 text-white/40" />;
      case "cancelled": return <XCircle className="w-5 h-5 text-white/40" />;
      default: return <Clock className="w-5 h-5 text-white/40" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "completed": return lang === "en" ? "Completed" : "已完成";
      case "executing": return lang === "en" ? "Executing" : "执行中";
      case "pending_confirmation": return lang === "en" ? "Pending" : "等待确认";
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
            <h2 className="text-xs text-white/40 uppercase tracking-[0.2em]">Pending Confirmations</h2>
            <div className="space-y-3">
              {pendingConfirmations.map((conf) => (
                <div key={conf.id} className="border border-white/20 p-6 bg-white/5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-medium text-white mb-1">{conf.title}</h3>
                      <p className="text-white/50 mb-2">{conf.description}</p>
                      <div className="flex items-center gap-4 text-sm text-white/40">
                        <span>Workflow: {(conf.details as any).workflowName}</span>
                        <span>Step: {(conf.details as any).stepIndex} / {(conf.details as any).totalSteps}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleConfirm(conf.id, false)} className="p-2 border border-white/20 text-white/60 hover:bg-white/5 transition">
                        <X className="w-5 h-5" />
                      </button>
                      <button onClick={() => handleConfirm(conf.id, true)} className="p-2 bg-white text-black hover:bg-white/90 transition">
                        <Check className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-sm text-white/40">
                    <Clock className="w-4 h-4" />
                    <span>Timeout: {new Date(conf.timeoutAt).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Task Grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Task List */}
          <div className="lg:col-span-1 space-y-3">
            <h2 className="text-xs text-white/40 uppercase tracking-[0.2em] mb-4">All Tasks</h2>
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
                    <span className="text-white/40">
                      {task.id.startsWith("chain-") ? (
                        <span className="flex items-center gap-1">
                          <Link2 className="w-3 h-3" />
                          {task.id.slice(6, 14)}
                        </span>
                      ) : task.id.slice(0, 8) + "..."}
                    </span>
                    <span className="text-white/60">{getStatusText(task.status)}</span>
                  </div>
                  <div className="mt-2 h-1 bg-white/10 overflow-hidden">
                    <div className={`h-full bg-white transition-all`}
                      style={{ width: `${(task.stepResults.length / task.totalSteps) * 100}%` }} />
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
                    <p className="text-white/40 mt-1">ID: {selectedTask.id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(selectedTask.status)}
                    <span className="text-white/60">{getStatusText(selectedTask.status)}</span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-white/40">Progress</span>
                    <span className="text-white">{selectedTask.stepResults.length} / {selectedTask.totalSteps} steps</span>
                  </div>
                  <div className="h-2 bg-white/10 overflow-hidden">
                    <div className="h-full bg-white transition-all"
                      style={{ width: `${(selectedTask.stepResults.length / selectedTask.totalSteps) * 100}%` }} />
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs text-white/40 uppercase tracking-[0.2em]">Execution Steps</h3>
                  {selectedTask.stepResults.map((result, index) => (
                    <div key={result.stepId} className="border border-white/10 p-4 bg-white/5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 border border-white/20 flex items-center justify-center text-sm text-white/60">{index + 1}</div>
                          <div>
                            <p className="font-medium text-white">{result.stepName}</p>
                            <p className="text-xs text-white/40">{result.stepId}</p>
                          </div>
                        </div>
                        {getStatusIcon(result.status)}
                      </div>
                      {result.output && (
                        <div className="mt-3 p-3 bg-black/20">
                          <p className="text-xs text-white/40 mb-1">Output</p>
                          <pre className="text-sm text-white/80 overflow-x-auto">{JSON.stringify(result.output, null, 2)}</pre>
                        </div>
                      )}
                      {result.error && (
                        <div className="mt-3 p-3 border border-white/20 bg-white/5">
                          <p className="text-sm text-white/60">{result.error}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
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
