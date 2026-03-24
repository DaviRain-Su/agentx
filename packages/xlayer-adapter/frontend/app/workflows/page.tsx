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
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createdTaskId, setCreatedTaskId] = useState<string | null>(null);

  useEffect(() => {
    setWorkflows(mockService.getWorkflows());
    setTasks(mockService.getAllTasks());

    // 订阅任务更新
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
      
      // 3秒后清除提示
      setTimeout(() => setCreatedTaskId(null), 3000);
    } catch (error) {
      console.error("Failed to create task:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case "executing":
        return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
      case "pending_confirmation":
        return <AlertCircle className="w-5 h-5 text-yellow-400" />;
      case "failed":
        return <AlertCircle className="w-5 h-5 text-red-400" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "completed":
        return lang === "en" ? "Completed" : "已完成";
      case "executing":
        return lang === "en" ? "Executing" : "执行中";
      case "pending_confirmation":
        return lang === "en" ? "Pending Approval" : "等待确认";
      case "failed":
        return lang === "en" ? "Failed" : "失败";
      case "cancelled":
        return lang === "en" ? "Cancelled" : "已取消";
      default:
        return lang === "en" ? "Created" : "已创建";
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-[#a3aac4] text-sm mb-2">
            <Link href="/" className="hover:text-[#dee5ff]">
              {lang === "en" ? "Home" : "首页"}
            </Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-[#dee5ff]">{lang === "en" ? "Workflows" : "工作流"}</span>
          </div>
          <h1 className="font-headline text-3xl font-bold text-[#dee5ff]">
            {lang === "en" ? "Workflows" : "工作流"}
          </h1>
          <p className="text-[#a3aac4] mt-2">
            {lang === "en" 
              ? "Build and deploy automated agent workflows" 
              : "构建和部署自动化智能体工作流"}
          </p>
        </div>

        {/* Success Message */}
        {createdTaskId && (
          <div className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <span className="text-green-400">
                {lang === "en" 
                  ? `Task created successfully! ID: ${createdTaskId}` 
                  : `任务创建成功！ID: ${createdTaskId}`}
              </span>
              <Link 
                href="/tasks" 
                className="ml-auto text-sm text-[#53ddfc] hover:underline"
              >
                {lang === "en" ? "View Tasks →" : "查看任务 →"}
              </Link>
            </div>
          </div>
        )}

        {/* Workflow Templates */}
        <div className="mb-12">
          <h2 className="font-headline text-xl font-bold text-[#dee5ff] mb-4">
            {lang === "en" ? "Workflow Templates" : "工作流模板"}
          </h2>
          
          <div className="grid md:grid-cols-2 gap-4">
            {workflows.map((workflow) => (
              <div
                key={workflow.id}
                className="glass-card rounded-2xl p-6 border border-white/5 hover:border-[#53ddfc]/30 transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="rounded-xl bg-gradient-to-br from-[#ba9eff] to-[#8455ef] p-3">
                    <WorkflowIcon className="w-6 h-6 text-white" />
                  </div>
                  <span className="text-xs text-[#a3aac4] bg-white/5 px-2 py-1 rounded-full">
                    {workflow.steps.length} {lang === "en" ? "steps" : "步骤"}
                  </span>
                </div>

                <h3 className="font-headline text-lg font-bold text-[#dee5ff] mb-2">
                  {workflow.name}
                </h3>
                <p className="text-[#a3aac4] text-sm mb-4">{workflow.description}</p>

                {/* Steps Preview */}
                <div className="space-y-2 mb-6">
                  {workflow.steps.map((step, index) => (
                    <div key={step.id} className="flex items-center gap-3 text-sm"
003e
                      <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-xs text-[#a3aac4]">
                        {index + 1}
                      </div>
                      <span className="text-[#dee5ff]">{step.name}</span>
                      {step.humanApproval && (
                        <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded">
                          {lang === "en" ? "Approval" : "需确认"}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => handleCreateTask(workflow.id)}
                  disabled={isCreating}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-[#53ddfc] to-[#40ceed] text-black font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {lang === "en" ? "Creating..." : "创建中..."}
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      {lang === "en" ? "Run Workflow" : "运行工作流"}
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Tasks */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-headline text-xl font-bold text-[#dee5ff]">
              {lang === "en" ? "Recent Tasks" : "最近任务"}
            </h2>
            <Link 
              href="/tasks" 
              className="text-sm text-[#53ddfc] hover:underline flex items-center gap-1"
            >
              {lang === "en" ? "View All" : "查看全部"}
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {tasks.length === 0 ? (
            <div className="surface-container rounded-2xl p-12 text-center border border-white/5">
              <WorkflowIcon className="w-12 h-12 text-[#a3aac4] mx-auto mb-4" />
              <p className="text-[#a3aac4]">
                {lang === "en" 
                  ? "No tasks yet. Run a workflow to get started." 
                  : "还没有任务。运行一个工作流开始吧。"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.slice(0, 5).map((task) => (
                <Link
                  key={task.id}
                  href={`/tasks?id=${task.id}`}
                  className="block surface-container rounded-xl p-4 border border-white/5 hover:border-[#53ddfc]/30 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {getStatusIcon(task.status)}
                      <div>
                        <p className="font-medium text-[#dee5ff]">{task.workflowName}</p>
                        <p className="text-sm text-[#a3aac4]">
                          {task.id} · {new Date(task.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className={`text-sm font-medium ${
                          task.status === "completed" ? "text-green-400" :
                          task.status === "failed" ? "text-red-400" :
                          task.status === "executing" ? "text-blue-400" :
                          "text-yellow-400"
                        }`}>
                          {getStatusText(task.status)}
                        </p>
                        <p className="text-xs text-[#a3aac4]">
                          {task.stepResults.length} / {task.totalSteps} {lang === "en" ? "steps" : "步骤"}
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-[#a3aac4]" />
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-3 h-1 bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all ${
                        task.status === "completed" ? "bg-green-400" :
                        task.status === "failed" ? "bg-red-400" :
                        "bg-[#53ddfc]"
                      }`}
                      style={{ width: `${(task.stepResults.length / task.totalSteps) * 100}%` }}
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
