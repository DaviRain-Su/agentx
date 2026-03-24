"use client";

import { useWeb3 } from "@/components/Web3Provider";
import { LandingPage } from "@/components/LandingPage";
import { DashboardLayout } from "@/components/DashboardLayout";
import Link from "next/link";
import { Workflow, ShoppingCart, Users, ClipboardList, ArrowRight, Zap, Activity } from "lucide-react";
import { useLangStore } from "@/store/lang";
import { t } from "@/lib/i18n";

const MODULES = [
  {
    id: "octo",
    title: "Octo-Kinetic",
    titleZh: "八爪动力",
    desc: "Neural sync interface with 3D tentacle visualization",
    descZh: "神经同步界面与3D触手可视化",
    icon: Zap,
    href: "/octo",
    stats: { label: "Sync", value: "99.8%" },
    color: "from-white to-gray-400",
    featured: true,
  },
  {
    id: "workflows",
    title: "Workflows",
    titleZh: "工作流",
    desc: "Build and deploy automated agent workflows",
    descZh: "构建和部署自动化智能体工作流",
    icon: Workflow,
    href: "/workflows",
    stats: { label: "Active", value: "12" },
    color: "from-[#ba9eff] to-[#8455ef]",
  },
  {
    id: "market",
    title: "Agent Market",
    titleZh: "智能体市场",
    desc: "Discover and deploy agents from the marketplace",
    descZh: "从市场发现并部署智能体",
    icon: ShoppingCart,
    href: "/market",
    stats: { label: "Available", value: "128" },
    color: "from-[#53ddfc] to-[#40ceed]",
  },
  {
    id: "teams",
    title: "Teams",
    titleZh: "团队",
    desc: "Create agent squads for collaborative execution",
    descZh: "创建智能体小队进行协作执行",
    icon: Users,
    href: "/teams",
    stats: { label: "Members", value: "5" },
    color: "from-[#699cff] to-[#4388fd]",
  },
  {
    id: "tasks",
    title: "Tasks",
    titleZh: "任务",
    desc: "Monitor and manage active operations",
    descZh: "监控和管理活跃操作",
    icon: ClipboardList,
    href: "/tasks",
    stats: { label: "Pending", value: "3" },
    color: "from-[#ff6e84] to-[#d73357]",
  },
];

function DashboardHome() {
  const { lang } = useLangStore();

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        {/* Welcome */}
        <div className="mb-10">
          <span className="text-[#53ddfc] font-label text-xs uppercase tracking-[0.2em] block mb-2">
            Neural Prism v1.0
          </span>
          <h1 className="font-headline text-4xl font-bold text-[#dee5ff] tracking-tight mb-3">
            {lang === "en" ? "Welcome back" : "欢迎回来"}
          </h1>
          <p className="text-[#a3aac4] text-lg">
            {lang === "en"
              ? "Select a module to get started with agent orchestration"
              : "选择一个模块开始智能体编排"}
          </p>
        </div>

        {/* Module Grid - Bento Style */}
        <div className="grid md:grid-cols-2 gap-6">
          {MODULES.map((module, index) => {
            const Icon = module.icon;
            const isFeatured = module.featured;
            
            return (
              <Link
                key={module.id}
                href={module.href}
                className={`group relative overflow-hidden rounded-3xl glass-card p-8 hover:border-white/10 transition-all ${
                  isFeatured ? "md:col-span-2 min-h-[280px] border-white/20" : "min-h-[240px]"
                }`}
              >
                {/* Background Gradient */}
                <div className={`absolute inset-0 bg-gradient-to-br ${module.color} opacity-0 group-hover:opacity-10 transition-opacity`} />
                
                <div className="relative z-10 h-full flex flex-col">
                  <div className="flex items-start justify-between mb-6">
                    <div className={`rounded-2xl bg-gradient-to-br ${module.color} p-4`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <div className="text-right">
                      <div className="font-headline text-4xl font-bold text-[#dee5ff]">{module.stats.value}</div>
                      <div className="text-xs text-[#a3aac4] uppercase tracking-widest">
                        {module.stats.label}
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto">
                    <h3 className="font-headline text-2xl font-bold text-[#dee5ff] mb-2">
                      {lang === "en" ? module.title : module.titleZh}
                    </h3>
                    <p className="text-[#a3aac4] mb-4">
                      {lang === "en" ? module.desc : module.descZh}
                    </p>

                    <div className="flex items-center text-[#53ddfc] group-hover:text-[#ba9eff] transition-colors">
                      <span className="font-medium">{lang === "en" ? "Open Module" : "打开模块"}</span>
                      <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition" />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Quick Stats */}
        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Agents", value: "128", change: "+12%" },
            { label: "Active Workflows", value: "24", change: "+5%" },
            { label: "Tasks Completed", value: "1.2K", change: "+18%" },
            { label: "Network Uptime", value: "99.9%", change: "" },
          ].map((stat) => (
            <div key={stat.label} className="surface-container rounded-2xl p-6 border border-white/5">
              <div className="text-[#a3aac4] text-sm mb-1">{stat.label}</div>
              <div className="flex items-baseline gap-2">
                <span className="font-headline text-3xl font-bold text-[#dee5ff]">{stat.value}</span>
                {stat.change && (
                  <span className="text-[#53ddfc] text-sm">{stat.change}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Recent Activity */}
        <div className="mt-12">
          <h2 className="font-headline text-xl font-bold text-[#dee5ff] mb-4">
            {lang === "en" ? "Recent Activity" : "最近活动"}
          </h2>
          <div className="surface-container rounded-2xl border border-white/5">
            <div className="p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-[#192540] flex items-center justify-center mx-auto mb-4">
                <Zap className="w-8 h-8 text-[#53ddfc]" />
              </div>
              <p className="text-[#a3aac4]">
                {lang === "en" ? "No recent activity" : "暂无最近活动"}
              </p>
            </div>
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
