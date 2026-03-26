"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "./DashboardLayout";
import Link from "next/link";
import { Workflow, ShoppingCart, Users, ClipboardList, ArrowRight, Activity, Cpu, Shield, Terminal, BookOpen, Plus, Copy, Check, Loader2 } from "lucide-react";
import { useLangStore } from "@/store/lang";
import { workerApi, type WorkerAgentEntry, type WorkerHealth } from "@/lib/api/worker";
import { useAppSettingsStore } from "@/store/settings";

export function DashboardHome() {
  const { lang } = useLangStore();
  const { workerUrl: configuredWorkerUrl } = useAppSettingsStore();
  const workerUrl = configuredWorkerUrl.replace(/\/+$/, "");
  const [agents, setAgents] = useState<Record<string, WorkerAgentEntry>>({});
  const [health, setHealth] = useState<WorkerHealth | null>(null);
  const [jobCount, setJobCount] = useState({ total: 0, running: 0 });
  const [latency, setLatency] = useState<number | null>(null);

  // Add Node state
  const [generatingKey, setGeneratingKey] = useState(false);
  const [nodeApiKey, setNodeApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  // 始终用生产 Worker URL 注册节点，不受 settings 里的本地配置影响
  const NETWORK_URL = "https://agentx-worker.davirain-yin.workers.dev";

  const handleGenerateKey = async () => {
    setGeneratingKey(true);
    setNodeApiKey(null);
    setKeyError(null);
    try {
      const { apiKey } = await workerApi.generateNodeKey(NETWORK_URL);
      setNodeApiKey(apiKey);
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : String(err));
    } finally {
      setGeneratingKey(false);
    }
  };

  const nodeCommand = nodeApiKey
    ? `npx @agentx/node@latest --server-url ${NETWORK_URL} --api-key ${nodeApiKey}`
    : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(nodeCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    const t0 = Date.now();
    workerApi.getHealth()
      .then((d: WorkerHealth) => {
        setHealth(d);
        setLatency(Date.now() - t0);
      })
      .catch(() => {});

    workerApi.getAgents()
      .then((d: Record<string, WorkerAgentEntry>) => setAgents(d))
      .catch(() => {});

    try {
      const jobs: Array<{ status?: string }> = JSON.parse(localStorage.getItem("a2a_jobs") || "[]");
      setJobCount({ total: jobs.length, running: jobs.filter(j => j.status === "running").length });
    } catch {}
  }, []);

  const agentNames = Object.keys(agents);
  const agentCount = agentNames.length || "—";
  const nodeOk = health?.status === "ok";

  const MODULES = [
    { id: "workflows", title: "Workflows", titleZh: "工作流", desc: "Build and deploy automated agent workflows", descZh: "构建和部署自动化智能体工作流", icon: Workflow, href: "/workflows", stats: jobCount.total > 0 ? `${jobCount.total} Jobs` : "Ready" },
    { id: "market", title: "Agent Market", titleZh: "智能体市场", desc: "Discover and deploy agents from the marketplace", descZh: "从市场发现并部署智能体", icon: ShoppingCart, href: "/market", stats: `${agentCount} Agents` },
    { id: "teams", title: "Teams", titleZh: "团队", desc: "Hire agent teams for collaborative execution", descZh: "雇用智能体团队进行协作执行", icon: Users, href: "/teams", stats: "3 Teams" },
    { id: "tasks", title: "Tasks", titleZh: "任务", desc: "Monitor A2A payment workflows and on-chain tasks", descZh: "监控 A2A 支付工作流与链上任务", icon: ClipboardList, href: "/tasks", stats: jobCount.running > 0 ? `${jobCount.running} Running` : "All Clear" },
    { id: "docs", title: "Docs", titleZh: "文档", desc: "Read architecture, workflows, API and onboarding guides", descZh: "查看架构、工作流、API 与接入指南", icon: BookOpen, href: "/docs", stats: "6 Guides" },
  ];

  const AGENT_ROLES: Record<string, { label: string; desc: string }> = {
    orchestrator: { label: "Orchestrator", desc: "Coordinates A2A payments between agents" },
    "price-oracle": { label: "Price Oracle", desc: "Fetches live crypto prices from Binance" },
    "trade-strategy": { label: "Trade Strategy", desc: "Evaluates trade conditions, prepares DEX swaps" },
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Header */}
        <div>
          <span className="text-xs text-white/40 uppercase tracking-[0.2em] block mb-2">AgentX Network</span>
          <h1 className="text-4xl lg:text-5xl font-light text-white">
            {lang === "en" ? "Dashboard" : "仪表盘"}
          </h1>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Active Agents */}
          <div className="border border-white/10 p-6 hover:border-white/30 transition-all bg-white/5">
            <div className="flex items-start justify-between mb-4">
              <span className="text-xs text-white/40 uppercase tracking-widest">Active Agents</span>
              <Cpu className="w-5 h-5 text-white/60" />
            </div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-4xl font-light text-white">{agentCount}</h2>
              <span className="text-white/40">on-chain</span>
            </div>
            <div className="mt-4 text-sm text-white/60">
              {agentNames.length > 0
                ? agentNames.join(" · ")
                : "Connecting..."}
            </div>
          </div>

          {/* Node Status */}
          <div className="border border-white/10 p-6 hover:border-white/30 transition-all bg-white/5">
            <div className="flex items-start justify-between mb-4">
              <span className="text-xs text-white/40 uppercase tracking-widest">Node Status</span>
              <Shield className="w-5 h-5 text-white/60" />
            </div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-4xl font-light text-white">
                {health ? (nodeOk ? "ONLINE" : "ERROR") : "—"}
              </h2>
            </div>
            <div className="mt-4 text-sm text-white/60">
              {latency !== null ? `Latency: ${latency}ms` : "Measuring..."}
              {health && <span className="ml-2 text-white/40">v{health.version}</span>}
            </div>
          </div>

          {/* A2A Jobs */}
          <div className="border border-white/10 p-6 hover:border-white/30 transition-all bg-white/5">
            <div className="flex items-start justify-between mb-4">
              <span className="text-xs text-white/40 uppercase tracking-widest">A2A Workflows</span>
              <Activity className="w-5 h-5 text-white/60" />
            </div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-4xl font-light text-white">{jobCount.total}</h2>
              <span className="text-white/40">total</span>
            </div>
            <div className="mt-4 text-sm text-white/60">
              {jobCount.running > 0
                ? <><span className="text-white">{jobCount.running}</span> running</>
                : "No active jobs"}
            </div>
          </div>
        </div>

        {/* Module Grid */}
        <div>
          <h2 className="text-xs text-white/40 uppercase tracking-[0.2em] mb-6">Modules</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
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

        {/* Agent Pulse — real agents from /api/agents */}
        <div>
          <h2 className="text-xs text-white/40 uppercase tracking-[0.2em] mb-6">Agent Network</h2>
          <div className="border border-white/10 divide-y divide-white/10">
            {agentNames.length === 0 ? (
              <div className="p-6 text-white/40 text-sm">Connecting to agent network...</div>
            ) : agentNames.map((name) => {
              const agent = agents[name];
              const role = AGENT_ROLES[name] || { label: name, desc: (agent.capabilities || []).join(", ") };
              return (
                <div key={name} className="p-4 flex items-center gap-4 hover:bg-white/5 transition-colors">
                  <div className="w-10 h-10 border border-white/20 flex items-center justify-center">
                    <Terminal className="w-5 h-5 text-white/60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-white">{role.label}</h4>
                    <p className="text-sm text-white/50 truncate">{role.desc}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-white/40 font-mono truncate max-w-[120px]">
                      {agent.address.slice(0, 6)}...{agent.address.slice(-4)}
                    </div>
                    <div className="text-xs text-white/60 mt-0.5">{agent.fee}</div>
                  </div>
                  <span className="w-1.5 h-1.5 bg-white inline-block animate-pulse ml-2" />
                </div>
              );
            })}
          </div>
        </div>
        {/* Add Node */}
        <div>
          <h2 className="text-xs text-white/40 uppercase tracking-[0.2em] mb-6">
            {lang === "en" ? "Join as Node" : "加入为节点"}
          </h2>
          <div className="border border-white/10 p-6 bg-white/5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-white font-medium">
                  {lang === "en" ? "Run your local AI on the network" : "把你本地的 AI 接入网络"}
                </p>
                <p className="text-sm text-white/40 mt-1">
                  {lang === "en"
                    ? "Generate an API key, then run one command. Your agent joins instantly."
                    : "生成 API Key，跑一条命令，你的 agent 立刻加入网络。"}
                </p>
              </div>
              <button
                onClick={handleGenerateKey}
                disabled={generatingKey}
                className="shrink-0 px-4 py-2 bg-white text-black text-sm font-medium hover:bg-white/90 transition flex items-center gap-2 disabled:opacity-50"
              >
                {generatingKey
                  ? <><Loader2 className="w-4 h-4 animate-spin" />{lang === "en" ? "Generating..." : "生成中..."}</>
                  : <><Plus className="w-4 h-4" />{lang === "en" ? "Add Node" : "添加节点"}</>
                }
              </button>
            </div>

            {keyError && (
              <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 px-3 py-2">
                {keyError}
              </p>
            )}

            {nodeApiKey && (
              <div className="space-y-3">
                <p className="text-xs text-white/40 uppercase tracking-widest">
                  {lang === "en" ? "Run this command on your machine:" : "在你的机器上运行这条命令："}
                </p>
                <div className="flex items-start gap-2">
                  <code className="flex-1 bg-black border border-white/10 px-4 py-3 text-sm text-green-400 font-mono break-all">
                    {nodeCommand}
                  </code>
                  <button
                    onClick={handleCopy}
                    className="shrink-0 p-3 border border-white/20 text-white/60 hover:text-white hover:border-white/40 transition"
                    title={lang === "en" ? "Copy" : "复制"}
                  >
                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-white/30">
                  {lang === "en"
                    ? "Make sure ANTHROPIC_API_KEY is set in your environment. Requires cloudflared for public access."
                    : "确保你的环境变量里有 ANTHROPIC_API_KEY。需要安装 cloudflared 才能对外访问。"}
                </p>
              </div>
            )}
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
