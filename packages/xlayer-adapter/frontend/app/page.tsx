"use client";

import { useWeb3 } from "@/components/Web3Provider";
import { LandingPage } from "@/components/LandingPage";
import { DashboardLayout } from "@/components/DashboardLayout";
import Link from "next/link";
import { Workflow, ShoppingCart, Users, ClipboardList, ArrowRight } from "lucide-react";
import { useLangStore } from "@/store/lang";
import { t } from "@/lib/i18n";

const MODULES = [
  {
    id: "workflows",
    title: "Workflows",
    titleZh: "工作流",
    desc: "Build and deploy automated agent workflows",
    descZh: "构建和部署自动化智能体工作流",
    icon: Workflow,
    href: "/workflows",
    stats: { label: "Active", value: "12" },
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
  },
];

function DashboardHome() {
  const { lang } = useLangStore();

  return (
    <DashboardLayout>
      <div className="w-full">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">
            {lang === "en" ? "Welcome back" : "欢迎回来"}
          </h1>
          <p className="text-white/60">
            {lang === "en"
              ? "Select a module to get started with agent orchestration"
              : "选择一个模块开始智能体编排"}
          </p>
        </div>

        {/* Module Grid */}
        <div className="grid md:grid-cols-2 gap-4">
          {MODULES.map((module) => {
            const Icon = module.icon;
            return (
              <Link
                key={module.id}
                href={module.href}
                className="group card p-6 hover:border-white/30 transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition">
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-semibold">{module.stats.value}</div>
                    <div className="text-xs text-white/40 uppercase tracking-wider">
                      {module.stats.label}
                    </div>
                  </div>
                </div>

                <h3 className="text-lg font-medium mb-1">
                  {lang === "en" ? module.title : module.titleZh}
                </h3>
                <p className="text-sm text-white/50 mb-4">
                  {lang === "en" ? module.desc : module.descZh}
                </p>

                <div className="flex items-center text-sm text-white/40 group-hover:text-white transition">
                  <span>{lang === "en" ? "Open" : "打开"}</span>
                  <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition" />
                </div>
              </Link>
            );
          })}
        </div>

        {/* Recent Activity */}
        <div className="mt-8">
          <h2 className="text-lg font-medium mb-4">
            {lang === "en" ? "Recent Activity" : "最近活动"}
          </h2>
          <div className="card">
            <div className="p-4 text-center text-white/40 py-12">
              {lang === "en" ? "No recent activity" : "暂无最近活动"}
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
