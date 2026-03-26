"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "./DashboardLayout";
import Link from "next/link";
import { Workflow, ShoppingCart, Users, ClipboardList, ArrowRight, Activity, Cpu, Shield, Terminal, BookOpen, Copy, Check, Plus } from "lucide-react";
import { useLangStore } from "@/store/lang";
import { workerApi, type WorkerAgentEntry, type WorkerHealth, type ActiveNode } from "@/lib/api/worker";

const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL || "https://agentx-worker.davirain-yin.workers.dev";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={copy} className="flex items-center gap-1 text-xs text-white/40 hover:text-white transition px-2 py-1 border border-white/10 hover:border-white/30">
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function DashboardHome() {
  const { lang } = useLangStore();
  const [agents, setAgents] = useState<Record<string, WorkerAgentEntry>>({});
  const [health, setHealth] = useState<WorkerHealth | null>(null);
  const [jobCount, setJobCount] = useState({ total: 0, running: 0 });
  const [latency, setLatency] = useState<number | null>(null);
  const [activeNodes, setActiveNodes] = useState<ActiveNode[]>([]);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [keyName, setKeyName] = useState("");
  const [generating, setGenerating] = useState(false);

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

    workerApi.getActiveNodes()
      .then(setActiveNodes)
      .catch(() => {});

    try {
      const jobs: Array<{ status?: string }> = JSON.parse(localStorage.getItem("a2a_jobs") || "[]");
      setJobCount({ total: jobs.length, running: jobs.filter(j => j.status === "running").length });
    } catch {}
  }, []);

  const generateKey = async () => {
    setGenerating(true);
    try {
      const res = await workerApi.generateNodeKey(keyName.trim() || "my-agent");
      setGeneratedKey(res.apiKey);
    } catch { /* ignore */ } finally {
      setGenerating(false);
    }
  };

  const agentNames = Object.keys(agents);
  const agentCount = agentNames.length || "—";
  const nodeOk = health?.status === "ok";

  const MODULES = [
    { id: "workflows", title: "Workflows", titleZh: "工作流", desc: "Build and deploy automated agent workflows", descZh: "构建和部署自动化智能体工作流", icon: Workflow, href: "/workflows", stats: jobCount.total > 0 ? `${jobCount.total} Jobs` : "Ready" },
    { id: "market", title: "Agent Swarm", titleZh: "智能体蜂群", desc: "Discover and deploy agents from the swarm", descZh: "从蜂群发现并部署智能体", icon: ShoppingCart, href: "/market", stats: `${agentCount} Agents` },
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
        {/* Add Node to Network */}
        <div>
          <h2 className="text-xs text-white/40 uppercase tracking-[0.2em] mb-6">
            {lang === "en" ? "Connect Your Agent" : "接入你的智能体"}
          </h2>
          <div className="border border-white/10 p-6 bg-white/5 space-y-6">
            {/* Step 1: Name + Generate */}
            <div>
              <p className="text-sm text-white/60 mb-4">
                {lang === "en"
                  ? "Generate an API key, then register your Cloudflare Worker or local agent with one command."
                  : "生成 API Key，然后用一条命令将你的 Cloudflare Worker 或本地智能体接入网络。"}
              </p>
              <div className="flex gap-3 items-center">
                <input
                  type="text"
                  placeholder={lang === "en" ? "Agent name (optional)" : "智能体名称（可选）"}
                  value={keyName}
                  onChange={e => setKeyName(e.target.value)}
                  className="flex-1 bg-black/40 border border-white/20 px-4 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/50 max-w-xs"
                />
                <button
                  onClick={generateKey}
                  disabled={generating}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-medium border transition"
                  style={{ borderColor: '#1de1f1', color: '#1de1f1' }}
                >
                  <Plus className="w-4 h-4" />
                  {generating
                    ? (lang === "en" ? "Generating..." : "生成中...")
                    : (lang === "en" ? "Generate API Key" : "生成 API Key")}
                </button>
              </div>
            </div>

            {/* Generated Key + Commands */}
            {generatedKey && (
              <div className="space-y-5 pt-2 border-t border-white/10">
                {/* Key display */}
                <div>
                  <span className="text-xs text-white/40 uppercase tracking-widest block mb-2">API Key</span>
                  <div className="flex items-center gap-3">
                    <code className="font-mono text-sm bg-black/40 border border-white/10 px-4 py-2 flex-1 truncate" style={{ color: '#1de1f1' }}>
                      {generatedKey}
                    </code>
                    <CopyButton text={generatedKey} />
                  </div>
                </div>

                {/* Option A: CF Worker */}
                <div>
                  <span className="text-xs text-white/40 uppercase tracking-widest block mb-2">
                    {lang === "en" ? "Option A — Cloudflare Worker" : "方案 A — Cloudflare Worker"}
                  </span>
                  <div className="bg-black/40 border border-white/10 p-4 font-mono text-xs text-white/70 leading-relaxed">
                    <div><span className="text-white/30">$</span> curl -X POST {WORKER_URL}/api/nodes/connect \</div>
                    <div className="pl-4">-H <span className="text-white/50">"Authorization: Bearer {generatedKey}"</span> \</div>
                    <div className="pl-4">-H <span className="text-white/50">"Content-Type: application/json"</span> \</div>
                    <div className="pl-4">-d <span className="text-white/50">'{"{"}"endpoint":"https://your-worker.workers.dev","name":"{keyName || "my-agent"}","model":"your-model"{"}"}'</span></div>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <CopyButton text={`curl -X POST ${WORKER_URL}/api/nodes/connect -H "Authorization: Bearer ${generatedKey}" -H "Content-Type: application/json" -d '{"endpoint":"https://your-worker.workers.dev","name":"${keyName || "my-agent"}","model":"your-model"}'`} />
                  </div>
                </div>

                {/* Option B: Local / npx */}
                <div>
                  <span className="text-xs text-white/40 uppercase tracking-widest block mb-2">
                    {lang === "en" ? "Option B — Local Agent (npx)" : "方案 B — 本地智能体（npx）"}
                  </span>
                  <div className="bg-black/40 border border-white/10 p-4 font-mono text-xs text-white/70 leading-relaxed">
                    <div><span className="text-white/30">$</span> npx <span style={{ color: '#1de1f1' }}>@agentxs/node@latest</span> \</div>
                    <div className="pl-4">--server-url <span className="text-white/50">{WORKER_URL}</span> \</div>
                    <div className="pl-4">--api-key <span className="text-white/50">{generatedKey}</span></div>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <CopyButton text={`npx @agentxs/node@latest --server-url ${WORKER_URL} --api-key ${generatedKey}`} />
                  </div>
                </div>

                <p className="text-xs text-white/30">
                  {lang === "en"
                    ? "Your agent will appear in Agent Swarm within seconds. Heartbeat keeps it alive for 5 minutes per ping."
                    : "你的智能体将在几秒内出现在智能体蜂群中。每次心跳保持 5 分钟在线状态。"}
                </p>
              </div>
            )}

            {/* Active nodes count */}
            {activeNodes.length > 0 && (
              <div className="pt-4 border-t border-white/10 flex items-center gap-3">
                <span className="w-1.5 h-1.5 rounded-full animate-pulse inline-block" style={{ background: '#1de1f1' }} />
                <span className="text-sm text-white/50">
                  {activeNodes.length} {lang === "en" ? "node(s) currently online in the swarm" : "个节点当前在线"}
                </span>
                <Link href="/market" className="text-xs ml-auto" style={{ color: '#1de1f1' }}>
                  {lang === "en" ? "View Swarm →" : "查看蜂群 →"}
                </Link>
              </div>
            )}
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
