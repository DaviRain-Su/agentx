"use client";

import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useLangStore } from "@/store/lang";
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
  ExternalLink 
} from "lucide-react";
import Link from "next/link";

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
  const { taskManager, paymentHub, address, signer } = useWeb3();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [pendingConfirmations, setPendingConfirmations] = useState<PendingConfirmation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [txPending, setTxPending] = useState(false);

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

  // Handle confirmation approval/rejection
  const handleConfirm = async (taskId: string, approved: boolean) => {
    if (!taskManager || !signer) return;
    
    setTxPending(true);
    try {
      // In a real implementation, this would call a contract method
      // For now, we'll simulate the confirmation
      console.log(`Confirming task ${taskId}: ${approved ? "approved" : "rejected"}`);
      
      // Remove from pending
      setPendingConfirmations(prev => prev.filter(c => c.taskId !== taskId));
      
      // Refresh tasks
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
                  href={`https://www.oklink.com/x-layer-testnet/address/${selectedTask.requester}`}
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
