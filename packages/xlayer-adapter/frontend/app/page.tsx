"use client";

import { useWeb3 } from "@/components/Web3Provider";
import { LandingPage } from "@/components/LandingPage";
import { DashboardLayout } from "@/components/DashboardLayout";
import Link from "next/link";
import { Workflow, ShoppingCart, Users, ClipboardList, ArrowRight, Zap, Activity, Cpu, Shield } from "lucide-react";
import { useLangStore } from "@/store/lang";
import { t } from "@/lib/i18n";

const MODULES = [
  {
    id: "credits",
    title: "Protocol Credits",
    titleZh: "协议积分",
    value: "842.12",
    unit: "GPC",
    change: "+12.4%",
    icon: Activity,
    href: "/",
    color: "from-[#ba9eff] to-[#8455ef]",
    large: true,
  },
  {
    id: "agents",
    title: "Active Agents",
    titleZh: "活跃智能体",
    value: "14",
    unit: "",
    progress: 75,
    icon: Cpu,
    href: "/market",
    color: "from-[#53ddfc] to-[#40ceed]",
  },
  {
    id: "node",
    title: "Node Status",
    titleZh: "节点状态",
    value: "OPTIMIZED",
    unit: "",
    latency: "14ms",
    icon: Shield,
    href: "/tasks",
    color: "from-[#699cff] to-[#4388fd]",
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
  {
    id: "octo",
    title: "Octo-Kinetic",
    titleZh: "八爪动力",
    desc: "Neural sync interface with 3D visualization",
    descZh: "神经同步界面与3D可视化",
    icon: Zap,
    href: "/octo",
    stats: { label: "Sync", value: "99.8%" },
    color: "from-white to-gray-400",
    featured: true,
  },
];

function DashboardHome() {
  const { lang } = useLangStore();

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Header Stats Grid - Asymmetrical Bento */}
        <section className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Credits Card - Large */}
          <div className="md:col-span-6 lg:col-span-5 p-8 rounded-2xl bg-[#091328] border border-[#40485d]/20 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#ba9eff]/5 rounded-full -mr-16 -mt-16 blur-3xl"></div>
            <div className="relative z-10">
              <p className="font-headline text-xs uppercase tracking-[0.2em] text-[#a3aac4] mb-2">Protocol Credits</p>
              <h2 className="font-headline text-6xl font-bold tracking-tighter text-[#dee5ff] flex items-baseline gap-2">
                842.12 <span className="text-[#ba9eff] text-xl tracking-normal">GPC</span>
              </h2>
              <div className="mt-6 flex items-center gap-3">
                <span className="text-[#53ddfc] text-xs font-medium px-2 py-1 bg-[#53ddfc]/10 rounded-lg">+12.4% vs last cycle</span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#53ddfc] agent-pulse"></span>
              </div>
            </div>
          </div>

          {/* Active Agents Card */}
          <div className="md:col-span-6 lg:col-span-3 p-6 rounded-2xl bg-[#0f1930] border border-[#40485d]/20 flex flex-col justify-between">
            <div>
              <span className="material-symbols-outlined text-[#8ab0ff] mb-4">memory</span>
              <p className="font-headline text-xs uppercase tracking-[0.2em] text-[#a3aac4]">Active Agents</p>
            </div>
            <h3 className="font-headline text-4xl font-bold text-[#dee5ff]">14</h3>
            <div className="h-1 w-full bg-[#192540] rounded-full mt-4 overflow-hidden">
              <div className="h-full bg-[#699cff] w-3/4"></div>
            </div>
          </div>

          {/* Node Status Card */}
          <div className="md:col-span-12 lg:col-span-4 p-6 rounded-2xl bg-[#141f38] border border-[#40485d]/20 flex items-center gap-6">
            <div className="w-20 h-20 rounded-full border-4 border-[#ba9eff]/20 flex items-center justify-center p-1">
              <div className="w-full h-full rounded-full bg-gradient-to-br from-[#ba9eff] to-[#53ddfc] flex items-center justify-center">
                <Shield className="w-8 h-8 text-[#39008c]" />
              </div>
            </div>
            <div>
              <p className="font-headline text-xs uppercase tracking-[0.2em] text-[#a3aac4]">Node Status</p>
              <h3 className="font-headline text-2xl font-bold text-[#dee5ff]">OPTIMIZED</h3>
              <p className="text-sm text-[#40ceed] font-medium">Latency: 14ms</p>
            </div>
          </div>
        </section>

        {/* Network Activity Chart */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-headline text-2xl font-bold tracking-tight text-[#dee5ff]">Network Activity</h3>
            <div className="flex gap-2">
              <button className="px-3 py-1 rounded bg-[#0f1930] text-xs font-headline uppercase tracking-widest text-[#a3aac4] hover:text-[#ba9eff] transition-colors">24h</button>
              <button className="px-3 py-1 rounded bg-[#ba9eff]/20 text-xs font-headline uppercase tracking-widest text-[#ba9eff]">7d</button>
            </div>
          </div>
          <div className="w-full h-80 bg-[#091328] rounded-2xl border border-[#40485d]/10 p-6 relative">
            {/* Retro Grid Lines */}
            <div className="absolute inset-0 flex items-end px-8 pb-12 opacity-40 pointer-events-none">
              <div className="w-full h-full border-b border-l border-[#40485d]/20 flex items-end justify-between">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="w-[1px] h-full bg-[#40485d]/10"></div>
                ))}
              </div>
            </div>
            {/* Chart SVG */}
            <svg className="w-full h-full relative z-10 overflow-visible" preserveAspectRatio="none" viewBox="0 0 1000 300">
              <defs>
                <linearGradient id="line-grad" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#ba9eff" stopOpacity="0.3"></stop>
                  <stop offset="100%" stopColor="#ba9eff" stopOpacity="0"></stop>
                </linearGradient>
              </defs>
              <path d="M0,250 L100,220 L200,240 L300,150 L400,180 L500,80 L600,120 L700,50 L800,90 L900,40 L1000,70 V300 H0 Z" fill="url(#line-grad)"></path>
              <path d="M0,250 L100,220 L200,240 L300,150 L400,180 L500,80 L600,120 L700,50 L800,90 L900,40 L1000,70" fill="none" stroke="#ba9eff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4"></path>
              <circle className="animate-pulse" cx="500" cy="80" fill="#ba9eff" r="6"></circle>
              <circle cx="900" cy="40" fill="#53ddfc" r="6"></circle>
            </svg>
            <div className="flex justify-between mt-4 font-headline text-[10px] text-[#a3aac4] uppercase tracking-widest">
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
              <span>Sun</span>
            </div>
          </div>
        </section>

        {/* Module Grid */}
        <section className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {MODULES.filter(m => m.id !== "credits" && m.id !== "agents" && m.id !== "node").map((module) => {
            const Icon = module.icon;
            return (
              <Link
                key={module.id}
                href={module.href}
                className={`group relative overflow-hidden rounded-2xl glass-card p-6 hover:border-[#ba9eff]/40 transition-all ${
                  module.featured ? "lg:col-span-2" : ""
                }`}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${module.color} opacity-0 group-hover:opacity-10 transition-opacity`} />
                
                <div className="relative z-10">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${module.color} p-3`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    {module.stats && (
                      <div className="text-right">
                        <div className="font-headline text-2xl font-bold text-[#dee5ff]">{module.stats.value}</div>
                        <div className="text-xs text-[#a3aac4] uppercase tracking-wider">{module.stats.label}</div>
                      </div>
                    )}
                  </div>

                  <h3 className="font-headline text-lg font-bold text-[#dee5ff] mb-2">
                    {lang === "en" ? module.title : module.titleZh}
                  </h3>
                  <p className="text-sm text-[#a3aac4] mb-4">
                    {lang === "en" ? module.desc : module.descZh}
                  </p>

                  <div className="flex items-center text-[#53ddfc] group-hover:text-[#ba9eff] transition-colors">
                    <span className="font-medium text-sm">{lang === "en" ? "Open" : "打开"}</span>
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition" />
                  </div>
                </div>
              </Link>
            );
          })}
        </section>

        {/* Agent Pulse Section */}
        <section className="space-y-6">
          <h3 className="font-headline text-2xl font-bold tracking-tight text-[#dee5ff]">Agent Pulse</h3>
          <div className="space-y-4">
            {/* Agent Card */}
            <div className="p-4 rounded-xl bg-[#0f1930] border border-[#40485d]/10 flex items-center gap-4 transition-all hover:bg-[#141f38] group">
              <div className="w-12 h-12 rounded-lg bg-[#ba9eff]/10 flex items-center justify-center text-[#ba9eff]">
                <Cpu className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h4 className="font-headline font-medium text-[#dee5ff] group-hover:text-[#ba9eff] transition-colors">Neural-Alpha-09</h4>
                <p className="text-xs text-[#a3aac4]">Processing market signals...</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-headline font-bold text-[#53ddfc] uppercase tracking-tighter">Running</p>
              </div>
            </div>
            
            <div className="p-4 rounded-xl bg-[#0f1930] border border-[#40485d]/10 flex items-center gap-4 transition-all hover:bg-[#141f38] group">
              <div className="w-12 h-12 rounded-lg bg-[#699cff]/10 flex items-center justify-center text-[#699cff]">
                <Shield className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h4 className="font-headline font-medium text-[#dee5ff] group-hover:text-[#699cff] transition-colors">Sentinel-Shield</h4>
                <p className="text-xs text-[#a3aac4]">Monitoring node security</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-headline font-bold text-[#53ddfc] uppercase tracking-tighter">Active</p>
              </div>
            </div>
          </div>
        </section>

        {/* Recent Tasks */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-headline text-2xl font-bold tracking-tight text-[#dee5ff]">Recent Tasks</h3>
            <a className="text-[#ba9eff] text-sm font-headline uppercase tracking-widest hover:underline decoration-2 underline-offset-4" href="#">View Archive</a>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Task Card 1 */}
            <div className="md:col-span-2 p-6 rounded-xl bg-[#091328] border border-[#40485d]/10 flex flex-col justify-between h-64 hover:border-[#ba9eff]/40 transition-colors">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-headline font-bold text-[#ba9eff] uppercase tracking-widest bg-[#ba9eff]/10 px-2 py-1 rounded">High Priority</span>
                  <h4 className="mt-4 font-headline text-xl font-bold leading-tight text-[#dee5ff]">Liquidity Optimization<br/>Protocol V3</h4>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex -space-x-2">
                  <div className="w-8 h-8 rounded-full border-2 border-[#091328] bg-[#192540]"></div>
                  <div className="w-8 h-8 rounded-full border-2 border-[#091328] bg-[#141f38]"></div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[#a3aac4]">Progress</p>
                  <p className="font-headline font-bold text-[#ba9eff]">88%</p>
                </div>
              </div>
            </div>
            
            {/* Task Card 2 */}
            <div className="p-6 rounded-xl bg-[#0f1930] border border-[#40485d]/10 flex flex-col justify-between h-64 hover:bg-[#141f38] transition-colors">
              <div>
                <div className="w-10 h-10 rounded bg-[#53ddfc]/10 flex items-center justify-center text-[#53ddfc] mb-4">
                  <Activity className="w-5 h-5" />
                </div>
                <h4 className="font-headline font-bold text-[#dee5ff]">Risk Assessment Alpha</h4>
                <p className="text-xs text-[#a3aac4] mt-2">Continuous scanning of node clusters for anomalous behavior.</p>
              </div>
              <div className="pt-4 border-t border-[#40485d]/10">
                <p className="text-[10px] font-headline uppercase tracking-widest text-[#53ddfc] font-bold">Analyzing</p>
              </div>
            </div>
            
            {/* Task Card 3 */}
            <div className="p-6 rounded-xl bg-[#0f1930] border border-[#40485d]/10 flex flex-col justify-between h-64 hover:bg-[#141f38] transition-colors">
              <div>
                <div className="w-10 h-10 rounded bg-[#699cff]/10 flex items-center justify-center text-[#699cff] mb-4">
                  <Zap className="w-5 h-5" />
                </div>
                <h4 className="font-headline font-bold text-[#dee5ff]">Reward Distribution</h4>
                <p className="text-xs text-[#a3aac4] mt-2">Automated batching of monthly protocol incentives.</p>
              </div>
              <div className="pt-4 border-t border-[#40485d]/10">
                <p className="text-[10px] font-headline uppercase tracking-widest text-[#a3aac4] font-bold">Scheduled (2h)</p>
              </div>
            </div>
          </div>
        </section>
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
