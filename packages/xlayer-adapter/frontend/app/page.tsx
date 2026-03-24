"use client";

import { useWeb3 } from "@/components/Web3Provider";
import { LandingPage } from "@/components/LandingPage";
import { DashboardLayout } from "@/components/DashboardLayout";
import Link from "next/link";
import { Workflow, ShoppingCart, Users, ClipboardList, ArrowRight, Zap, Activity, Cpu, Shield, Terminal } from "lucide-react";
import { useLangStore } from "@/store/lang";
import { t } from "@/lib/i18n";

const STATS = [
  { id: "credits", title: "Protocol Credits", value: "842.12", unit: "GPC", change: "+12.4%", icon: Activity },
  { id: "agents", title: "Active Agents", value: "14", unit: "", icon: Cpu },
  { id: "node", title: "Node Status", value: "OPTIMIZED", latency: "14ms", icon: Shield },
];

const MODULES = [
  { id: "workflows", title: "Workflows", titleZh: "工作流", desc: "Build and deploy automated agent workflows", descZh: "构建和部署自动化智能体工作流", icon: Workflow, href: "/workflows", stats: "12 Active" },
  { id: "market", title: "Agent Market", titleZh: "智能体市场", desc: "Discover and deploy agents from the marketplace", descZh: "从市场发现并部署智能体", icon: ShoppingCart, href: "/market", stats: "128 Available" },
  { id: "teams", title: "Teams", titleZh: "团队", desc: "Create agent squads for collaborative execution", descZh: "创建智能体小队进行协作执行", icon: Users, href: "/teams", stats: "5 Members" },
  { id: "tasks", title: "Tasks", titleZh: "任务", desc: "Monitor and manage active operations", descZh: "监控和管理活跃操作", icon: ClipboardList, href: "/tasks", stats: "3 Pending" },
  { id: "octo", title: "Octo-Kinetic", titleZh: "八爪动力", desc: "Neural sync interface with 3D visualization", descZh: "神经同步界面与3D可视化", icon: Zap, href: "/octo", stats: "99.8% Sync" },
];

const AGENTS = [
  { name: "Neural-Alpha-09", status: "Running", desc: "Processing market signals...", active: true },
  { name: "Sentinel-Shield", status: "Active", desc: "Monitoring node security", active: true },
  { name: "Data-Miner-X", status: "Idle", desc: "Awaiting task assignment", active: false },
];

function DashboardHome() {
  const { lang } = useLangStore();

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs text-white/40 uppercase tracking-[0.2em] block mb-2">Neural Prism v1.0</span>
            <h1 className="text-4xl lg:text-5xl font-light text-white">
              {lang === "en" ? "Dashboard" : "仪表盘"}
            </h1>
          </div>
        </div>

        {/* Stats Grid - 黑白极简风格 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {STATS.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.id} className="border border-white/10 p-6 hover:border-white/30 transition-all bg-white/5">
                <div className="flex items-start justify-between mb-4">
                  <span className="text-xs text-white/40 uppercase tracking-widest">{stat.title}</span>
                  <Icon className="w-5 h-5 text-white/60" />
                </div>
                <div className="flex items-baseline gap-2">
                  <h2 className="text-4xl font-light text-white">{stat.value}</h2>
                  {stat.unit && <span className="text-white/40">{stat.unit}</span>}
                </div>
                {stat.change && (
                  <div className="mt-4 text-sm text-white/60">
                    <span className="text-white">{stat.change}</span> vs last cycle
                  </div>
                )}
                {stat.latency && (
                  <div className="mt-4 text-sm text-white/60">
                    Latency: <span className="text-white">{stat.latency}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Module Grid - 黑白极简风格 */}
        <div>
          <h2 className="text-xs text-white/40 uppercase tracking-[0.2em] mb-6">Modules</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {MODULES.map((module) => {
              const Icon = module.icon;
              return (
                <Link
                  key={module.id}
                  href={module.href}
                  className="group border border-white/10 p-6 hover:border-white/30 transition-all bg-white/5"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 border border-white/20 flex items-center justify-center group-hover:border-white/50 transition">
                      <Icon className="w-6 h-6 text-white/60 group-hover:text-white" />
                    </div>
                    <span className="text-xs text-white/40">{module.stats}</span>
                  </div>
                  <h3 className="text-xl font-medium text-white mb-1">
                    {lang === "en" ? module.title : module.titleZh}
                  </h3>
                  <p className="text-sm text-white/50 mb-4">
                    {lang === "en" ? module.desc : module.descZh}
                  </p>
                  <div className="flex items-center text-white/40 group-hover:text-white transition-colors">
                    <span className="text-sm">{lang === "en" ? "Open" : "打开"}</span>
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Agent Pulse - 黑白极简风格 */}
        <div>
          <h2 className="text-xs text-white/40 uppercase tracking-[0.2em] mb-6">Agent Pulse</h2>
          <div className="border border-white/10 divide-y divide-white/10">
            {AGENTS.map((agent, index) => (
              <div key={index} className="p-4 flex items-center gap-4 hover:bg-white/5 transition-colors">
                <div className="w-10 h-10 border border-white/20 flex items-center justify-center">
                  <Terminal className="w-5 h-5 text-white/60" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-white">{agent.name}</h4>
                  <p className="text-sm text-white/50">{agent.desc}</p>
                </div>
                <div className="text-right">
                  <span className={`text-xs uppercase tracking-wider ${agent.active ? 'text-white' : 'text-white/40'}`}>
                    {agent.status}
                  </span>
                  {agent.active && <span className="ml-2 w-1.5 h-1.5 bg-white inline-block animate-pulse" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function Home() {
  const { isConnected } = useWeb3();

  if (!isConnected) {
    return <LandingPage />;
  }

  return <DashboardHome />;
}
