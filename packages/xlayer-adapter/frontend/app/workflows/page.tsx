"use client";

import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useLangStore } from "@/store/lang";
import { mockService, Workflow, Task } from "@/lib/mockService";
import { Workflow as WorkflowIcon, Play, ChevronRight, CheckCircle, Clock, AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";

export default function WorkflowsPage() {
  const { lang } = useLangStore();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createdTaskId, setCreatedTaskId] = useState<string | null>(null);

  useEffect(() => {
    setWorkflows(mockService.getWorkflows());
    setTasks(mockService.getAllTasks());

    const unsubscribe = mockService.subscribe("taskUpdated", (task: Task) => {
      setTasks((prev) => {
        const index = prev.findIndex((t) => t.id === task.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = task;
          return updated;
        }
        return [task, ...prev];
      });
    });

    return () => unsubscribe();
  }, []);

  const handleCreateTask = async (workflowId: string) => {
    setIsCreating(true);
    try {
      const task = await mockService.createTask(workflowId);
      setCreatedTaskId(task.id);
      setTasks((prev) => [task, ...prev]);
      setTimeout(() => setCreatedTaskId(null), 3000);
    } catch (error) {
      console.error("Failed to create task:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle className="w-5 h-5 text-white" />;
      case "executing": return <Loader2 className="w-5 h-5 text-white animate-spin" />;
      case "pending_confirmation": return <AlertCircle className="w-5 h-5 text-white/60" />;
      case "failed": return <AlertCircle className="w-5 h-5 text-white/40" />;
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
                  <span className="text-xs text-white/40 bg-white/5 px-2 py-1">
                    {workflow.steps.length} {lang === "en" ? "steps" : "步骤"}
                  </span>
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
                        <span className="text-[10px] text-white/60 border border-white/20 px-2 py-0.5">
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
            <Link href="/tasks" className="text-sm text-white/60 hover:text-white flex items-center gap-1">
              {lang === "en" ? "View All" : "查看全部"} <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {tasks.length === 0 ? (
            <div className="border border-white/10 p-12 bg-white/5 text-center">
              <WorkflowIcon className="w-12 h-12 text-white/40 mx-auto mb-4" />
              <p className="text-white/50">{lang === "en" ? "No tasks yet. Run a workflow to get started." : "还没有任务。运行一个工作流开始吧。"}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.slice(0, 5).map((task) => (
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
                        <p className="text-sm text-white/40">{task.id} · {new Date(task.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-white/60">{getStatusText(task.status)}</p>
                        <p className="text-xs text-white/40">{task.stepResults.length} / {task.totalSteps} steps</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-white/40" />
                    </div>
                  </div>

                  <div className="mt-3 h-1 bg-white/10 overflow-hidden">
                    <div className="h-full bg-white transition-all"
                      style={{ width: `${(task.stepResults.length / task.totalSteps) * 100}%` }} />
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
