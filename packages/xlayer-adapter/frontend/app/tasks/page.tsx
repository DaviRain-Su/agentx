"use client";

import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useLangStore } from "@/store/lang";
import { mockService, Task, StepResult, ConfirmationRequest } from "@/lib/mockService";
import { ClipboardList, ChevronRight, CheckCircle, XCircle, Clock, Loader2, AlertCircle, Play, Check, X } from "lucide-react";
import Link from "next/link";

export default function TasksPage() {
  const { lang } = useLangStore();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [pendingConfirmations, setPendingConfirmations] = useState<ConfirmationRequest[]>([]);

  useEffect(() => {
    // 加载任务
    setTasks(mockService.getAllTasks());

    // 订阅更新
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

      if (selectedTask?.id === task.id) {
        setSelectedTask(task);
      }
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

  // 加载待确认的请求
  useEffect(() => {
    setPendingConfirmations(mockService.getPendingConfirmations());
  }, []);

  const handleConfirm = (confirmationId: string, approved: boolean) => {
    mockService.respondToConfirmation(confirmationId, approved);
    setPendingConfirmations((prev) => prev.filter((c) => c.id !== confirmationId));
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
        return <XCircle className="w-5 h-5 text-red-400" />;
      case "cancelled":
        return <XCircle className="w-5 h-5 text-gray-400" />;
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

  const getStepStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-red-400" />;
      case "skipped":
        return <X className="w-4 h-4 text-gray-400" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
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
            <span className="text-[#dee5ff]">{lang === "en" ? "Tasks" : "任务"}</span>
          </div>
          <h1 className="font-headline text-3xl font-bold text-[#dee5ff]">
            {lang === "en" ? "Tasks" : "任务"}
          </h1>
          <p className="text-[#a3aac4] mt-2">
            {lang === "en" 
              ? "Monitor and manage active operations" 
              : "监控和管理活跃操作"}
          </p>
        </div>

        {/* Pending Confirmations */}
        {pendingConfirmations.length > 0 && (
          <div className="mb-8">
            <h2 className="font-headline text-lg font-bold text-[#dee5ff] mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-400" />
              {lang === "en" ? "Pending Confirmations" : "待确认"}
              <span className="text-sm text-[#a3aac4] font-normal">
                ({pendingConfirmations.length})
              </span>
            </h2>

            <div className="space-y-3">
              {pendingConfirmations.map((conf) => (
                <div
                  key={conf.id}
                  className="surface-container rounded-xl p-6 border border-yellow-400/30 bg-yellow-400/5"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-headline text-lg font-bold text-[#dee5ff] mb-1">
                        {conf.title}
                      </h3>
                      <p className="text-[#a3aac4] mb-2">{conf.description}</p>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-[#a3aac4]">
                          {lang === "en" ? "Workflow" : "工作流"}: {conf.details.workflowName}
                        </span>
                        <span className="text-[#a3aac4]">
                          {lang === "en" ? "Step" : "步骤"}: {conf.details.stepIndex} / {conf.details.totalSteps}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleConfirm(conf.id, false)}
                        className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleConfirm(conf.id, true)}
                        className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors"
                      >
                        <Check className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2 text-sm text-yellow-400">
                    <Clock className="w-4 h-4" />
                    <span>
                      {lang === "en" ? "Timeout at" : "超时时间"}: {new Date(conf.timeoutAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Task List */}
          <div className="lg:col-span-1">
            <h2 className="font-headline text-lg font-bold text-[#dee5ff] mb-4">
              {lang === "en" ? "All Tasks" : "所有任务"}
            </h2>

            <div className="space-y-2">
              {tasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => setSelectedTask(task)}
                  className={`w-full text-left surface-container rounded-xl p-4 border transition-all ${
                    selectedTask?.id === task.id
                      ? "border-[#53ddfc] bg-[#53ddfc]/5"
                      : "border-white/5 hover:border-white/10"
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    {getStatusIcon(task.status)}
                    <span className="font-medium text-[#dee5ff] truncate">
                      {task.workflowName}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#a3aac4]">{task.id.slice(0, 8)}...</span>
                    <span className={`${
                      task.status === "completed" ? "text-green-400" :
                      task.status === "failed" ? "text-red-400" :
                      task.status === "executing" ? "text-blue-400" :
                      "text-yellow-400"
                    }`}>
                      {getStatusText(task.status)}
                    </span>
                  </div>

                  <div className="mt-2 h-1 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        task.status === "completed" ? "bg-green-400" :
                        task.status === "failed" ? "bg-red-400" :
                        "bg-[#53ddfc]"
                      }`}
                      style={{ width: `${(task.stepResults.length / task.totalSteps) * 100}%` }}
                    />
                  </div>
                </button>
              ))}

              {tasks.length === 0 && (
                <div className="surface-container rounded-xl p-8 text-center border border-white/5">
                  <ClipboardList className="w-12 h-12 text-[#a3aac4] mx-auto mb-4" />
                  <p className="text-[#a3aac4]">
                    {lang === "en" ? "No tasks yet" : "还没有任务"}
                  </p>
                  <Link
                    href="/workflows"
                    className="text-[#53ddfc] hover:underline mt-2 inline-block"
                  >
                    {lang === "en" ? "Create one →" : "创建一个 →"}
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Task Detail */}
          <div className="lg:col-span-2">
            {selectedTask ? (
              <div className="surface-container rounded-2xl border border-white/5">
                {/* Task Header */}
                <div className="p-6 border-b border-white/5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="font-headline text-2xl font-bold text-[#dee5ff]">
                        {selectedTask.workflowName}
                      </h2>
                      <p className="text-[#a3aac4] mt-1">ID: {selectedTask.id}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(selectedTask.status)}
                      <span className={`font-medium ${
                        selectedTask.status === "completed" ? "text-green-400" :
                        selectedTask.status === "failed" ? "text-red-400" :
                        selectedTask.status === "executing" ? "text-blue-400" :
                        "text-yellow-400"
                      }`}>
                        {getStatusText(selectedTask.status)}
                      </span>
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-[#a3aac4]">
                        {lang === "en" ? "Progress" : "进度"}
                      </span>
                      <span className="text-[#dee5ff]">
                        {selectedTask.stepResults.length} / {selectedTask.totalSteps} {lang === "en" ? "steps" : "步骤"}
                      </span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          selectedTask.status === "completed" ? "bg-green-400" :
                          selectedTask.status === "failed" ? "bg-red-400" :
                          "bg-[#53ddfc]"
                        }`}
                        style={{ width: `${(selectedTask.stepResults.length / selectedTask.totalSteps) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Steps */}
                <div className="p-6">
                  <h3 className="font-headline text-lg font-bold text-[#dee5ff] mb-4">
                    {lang === "en" ? "Execution Steps" : "执行步骤"}
                  </h3>

                  <div className="space-y-4">
                    {selectedTask.stepResults.map((result, index) => (
                      <div
                        key={result.stepId}
                        className="rounded-xl border border-white/5 p-4"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-sm text-[#dee5ff]">
                              {index + 1}
                            </div>
                            <div>
                              <p className="font-medium text-[#dee5ff]">{result.stepName}</p>
                              <p className="text-sm text-[#a3aac4]">{result.stepId}</p>
                            </div>
                          </div>
                          {getStepStatusIcon(result.status)}
                        </div>

                        {result.output && (
                          <div className="mt-3 p-3 bg-white/5 rounded-lg">
                            <p className="text-xs text-[#a3aac4] mb-1">
                              {lang === "en" ? "Output" : "输出"}
                            </p>
                            <pre className="text-sm text-[#dee5ff] overflow-x-auto">
                              {JSON.stringify(result.output, null, 2)}
                            </pre>
                          </div>
                        )}

                        {result.error && (
                          <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                            <p className="text-xs text-red-400 mb-1">
                              {lang === "en" ? "Error" : "错误"}
                            </p>
                            <p className="text-sm text-red-400">{result.error}</p>
                          </div>
                        )}

                        {result.completedAt && (
                          <p className="mt-2 text-xs text-[#a3aac4]">
                            {lang === "en" ? "Completed at" : "完成于"}: {new Date(result.completedAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                    ))}

                    {selectedTask.stepResults.length === 0 && (
                      <p className="text-[#a3aac4] text-center py-8">
                        {lang === "en" ? "No steps executed yet" : "尚未执行步骤"}
                      </p>
                    )}
                  </div>
                </div>

                {/* Task Info */}
                <div className="p-6 border-t border-white/5">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-[#a3aac4] mb-1">{lang === "en" ? "Created" : "创建时间"}</p>
                      <p className="text-[#dee5ff]">{new Date(selectedTask.createdAt).toLocaleString()}</p>
                    </div>
                    {selectedTask.completedAt && (
                      <div>
                        <p className="text-[#a3aac4] mb-1">{lang === "en" ? "Completed" : "完成时间"}</p>
                        <p className="text-[#dee5ff]">{new Date(selectedTask.completedAt).toLocaleString()}</p>
                      </div>
                    )}
                  </div>

                  {selectedTask.error && (
                    <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                      <p className="text-sm text-red-400">{selectedTask.error}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="surface-container rounded-2xl p-12 text-center border border-white/5">
                <ClipboardList className="w-16 h-16 text-[#a3aac4] mx-auto mb-4" />
                <p className="text-[#a3aac4]">
                  {lang === "en" 
                    ? "Select a task to view details" 
                    : "选择一个任务查看详情"}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
