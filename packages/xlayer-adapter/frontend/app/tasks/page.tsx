"use client";

import { DashboardLayout } from "@/components/DashboardLayout";
import { useLangStore } from "@/store/lang";
import { t } from "@/lib/i18n";
import { CheckCircle2, Clock, AlertCircle, MoreHorizontal } from "lucide-react";

const MOCK_TASKS = [
  {
    id: "1",
    name: "Price Check: ETH/USDT",
    status: "completed",
    agent: "Price Oracle",
    time: "2 min ago",
    result: "$1,847.32",
  },
  {
    id: "2",
    name: "Execute Trade: Buy ETH",
    status: "pending",
    agent: "Trade Executor",
    time: "Waiting for approval",
    result: null,
  },
  {
    id: "3",
    name: "Risk Assessment",
    status: "running",
    agent: "Risk Manager",
    time: "Running...",
    result: null,
  },
];

export default function TasksPage() {
  const { lang } = useLangStore();

  return (
    <DashboardLayout>
      <div className="w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold mb-1">{t("navTasks", lang)}</h1>
            <p className="text-white/60">Monitor and manage active operations</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total", value: "24", color: "text-white" },
            { label: "Running", value: "3", color: "text-blue-400" },
            { label: "Pending", value: "5", color: "text-yellow-400" },
            { label: "Completed", value: "16", color: "text-green-400" },
          ].map((stat) => (
            <div key={stat.label} className="card p-4">
              <div className={`text-3xl font-semibold ${stat.color}`}>{stat.value}</div>
              <div className="text-sm text-white/50">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Tasks List */}
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Agent</th>
                <th>Status</th>
                <th>Time</th>
                <th>Result</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {MOCK_TASKS.map((task) => (
                <tr key={task.id}>
                  <td>
                    <div className="font-medium">{task.name}</div>
                  </td>
                  <td className="text-white/60">{task.agent}</td>
                  <td>
                    <StatusBadge status={task.status} />
                  </td>
                  <td className="text-white/60">{task.time}</td>
                  <td>{task.result || "-"}</td>
                  <td>
                    <button className="p-2 hover:bg-white/5 rounded">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}

function StatusBadge({ status }: { status: string }) {
  const icons = {
    completed: CheckCircle2,
    running: Clock,
    pending: AlertCircle,
  };

  const styles = {
    completed: "badge-success",
    running: "badge-warning",
    pending: "badge-warning",
  };

  const Icon = icons[status as keyof typeof icons] || Clock;

  return (
    <span className={`badge ${styles[status as keyof typeof styles]}`}>
      <Icon className="w-3 h-3" />
      {status}
    </span>
  );
}
