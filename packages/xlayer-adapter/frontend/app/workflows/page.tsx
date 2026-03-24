"use client";

import { DashboardLayout } from "@/components/DashboardLayout";
import { useLangStore } from "@/store/lang";
import { t } from "@/lib/i18n";
import { Plus, Play, Pause, MoreHorizontal } from "lucide-react";

const MOCK_WORKFLOWS = [
  {
    id: "1",
    name: "ETH Price Alert",
    status: "active",
    agents: 3,
    executions: 128,
    lastRun: "2 min ago",
  },
  {
    id: "2",
    name: "MEV Protection",
    status: "paused",
    agents: 2,
    executions: 45,
    lastRun: "1 hour ago",
  },
  {
    id: "3",
    name: "Yield Rebalancer",
    status: "active",
    agents: 4,
    executions: 892,
    lastRun: "5 min ago",
  },
];

export default function WorkflowsPage() {
  const { lang } = useLangStore();

  return (
    <DashboardLayout>
      <div className="w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold mb-1">{t("navWorkflows", lang)}</h1>
            <p className="text-white/60">Build and deploy automated agent workflows</p>
          </div>
          <button className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Create Workflow
          </button>
        </div>

        {/* Workflows Table */}
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Workflow</th>
                <th>Status</th>
                <th>Agents</th>
                <th>Executions</th>
                <th>Last Run</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {MOCK_WORKFLOWS.map((wf) => (
                <tr key={wf.id}>
                  <td>
                    <div className="font-medium">{wf.name}</div>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        wf.status === "active" ? "badge-success" : "badge-warning"
                      }`}
                    >
                      {wf.status}
                    </span>
                  </td>
                  <td>{wf.agents}</td>
                  <td>{wf.executions.toLocaleString()}</td>
                  <td className="text-white/60">{wf.lastRun}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <button className="p-2 hover:bg-white/5 rounded">
                        {wf.status === "active" ? (
                          <Pause className="w-4 h-4" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </button>
                      <button className="p-2 hover:bg-white/5 rounded">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>
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
