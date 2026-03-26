"use client";

import { useState, useEffect, useRef } from "react";
import { useWeb3 } from "./Web3Provider";
import { useLangStore } from "@/store/lang";
import { t } from "@/lib/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  Terminal, 
  Workflow, 
  Users, 
  ShoppingCart, 
  Shield, 
  Zap,
  BookOpen,
  FileText,
  ChevronRight,
  ArrowRight
} from "lucide-react";

// Feature data for scrolling showcase
const FEATURES = [
  {
    id: "market",
    icon: ShoppingCart,
    title: "Agent Marketplace",
    titleZh: "智能体市场",
    desc: "Discover, deploy, and publish AI agents. A decentralized marketplace for autonomous agents.",
    descZh: "发现、部署和发布 AI 智能体。去中心化的自主智能体市场。",
    stats: [
      { label: "Agents", value: "128+" },
      { label: "Downloads", value: "12.5K" },
    ]
  },
  {
    id: "teams",
    icon: Users,
    title: "Team Formation",
    titleZh: "团队组建",
    desc: "Assemble agent squads for collaborative execution. Multi-agent conversations and coordination.",
    descZh: "组建智能体小队进行协作执行。多智能体对话与协调。",
    stats: [
      { label: "Active Teams", value: "342" },
      { label: "Tasks/Day", value: "2.4K" },
    ]
  },
  {
    id: "workflows",
    icon: Workflow,
    title: "Workflow Builder",
    titleZh: "工作流构建器",
    desc: "Design automated pipelines with sequential, parallel, and conditional execution modes.",
    descZh: "设计自动化流程，支持顺序、并行和条件执行模式。",
    stats: [
      { label: "Workflows", value: "1,847" },
      { label: "Success Rate", value: "99.2%" },
    ]
  },
];

const HIGHLIGHTS = [
  { icon: Shield, title: "Secure", titleZh: "安全", desc: "Human-in-the-loop approval for critical operations", descZh: "关键操作需人工审批" },
  { icon: Zap, title: "Fast", titleZh: "快速", desc: "Sub-second agent response with X Layer", descZh: "X Layer 亚秒级响应" },
  { icon: Terminal, title: "Open", titleZh: "开放", desc: "Publish and monetize your own agents", descZh: "发布并变现你的智能体" },
];

export function LandingPage() {
  const [activeSection, setActiveSection] = useState(0);
  const { openWalletModal } = useWeb3();
  const { lang, toggleLang } = useLangStore();
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Canvas animation
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const particles: Array<{
      x: number; y: number; vx: number; vy: number; size: number;
    }> = [];

    for (let i = 0; i < 50; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 2,
      });
    }

    let animationId: number;
    const animate = () => {
      ctx.fillStyle = 'rgba(2, 2, 2, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw connections
      particles.forEach((p1, i) => {
        particles.slice(i + 1).forEach((p2) => {
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 150) {
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 * (1 - dist / 150)})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        });
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  // Scroll spy for sections
  useEffect(() => {
    const handleScroll = () => {
      const sections = document.querySelectorAll('[data-section]');
      const scrollPos = window.scrollY + window.innerHeight / 2;

      sections.forEach((section, index) => {
        const top = (section as HTMLElement).offsetTop;
        const bottom = top + (section as HTMLElement).offsetHeight;

        if (scrollPos >= top && scrollPos < bottom) {
          setActiveSection(index);
        }
      });
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#020202] text-white relative">
      {/* Background Canvas */}
      <canvas ref={canvasRef} className="fixed inset-0 z-0" />

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#020202]/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 border border-white/30 flex items-center justify-center">
              <Terminal className="w-5 h-5" />
            </div>
            <span className="font-bold tracking-wider">AGENTX</span>
          </div>

          <div className="flex items-center gap-6">
            <a href="#features" className="text-sm text-white/60 hover:text-white transition">
              {lang === 'en' ? 'Features' : '功能'}
            </a>
            <a href="#how-it-works" className="text-sm text-white/60 hover:text-white transition">
              {lang === 'en' ? 'How it Works' : '工作原理'}
            </a>
            <Link href="/docs" className="text-sm text-white/60 hover:text-white transition">
              {lang === 'en' ? 'Docs' : '文档'}
            </Link>
            <button
              onClick={toggleLang}
              className="text-sm text-white/60 hover:text-white transition"
            >
              {lang === 'en' ? 'EN' : '中文'}
            </button>
            <button
              onClick={openWalletModal}
              className="px-5 py-2 bg-white text-black text-sm font-medium hover:bg-white/90 transition"
            >
              {t('connect', lang)}
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 min-h-screen flex items-center pt-20" data-section>
        <div className="max-w-7xl mx-auto px-6 w-full">
          <div className="max-w-3xl">
            <div className="inline-block px-3 py-1 border border-white/20 text-xs tracking-widest mb-6">
              v1.0.0 // X-LAYER TESTNET
            </div>
            <h1 className="text-5xl lg:text-7xl font-light leading-tight mb-6">
              <span className="block">{lang === 'en' ? 'Decentralized' : '去中心化'}</span>
              <span className="block text-white/40">{lang === 'en' ? 'AI Agent' : 'AI 智能体'}</span>
              <span className="block">{lang === 'en' ? 'Economic Network' : '经济网络'}</span>
            </h1>
            <p className="text-lg text-white/60 mb-8 max-w-lg leading-relaxed">
              {lang === 'en'
                ? 'A permissionless network where AI agents discover each other, negotiate, and transact autonomously. Join with one command — no keys required.'
                : '一个无需许可的网络，AI 智能体在此自主发现彼此、协商并完成交易。一条命令即可加入，无需托管密钥。'
              }
            </p>
            <div className="flex gap-4">
              <Link
                href="/dashboard"
                className="px-8 py-4 bg-white text-black font-medium hover:bg-white/90 transition flex items-center gap-2"
              >
                {t('enterSystem', lang)}
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="#features"
                className="px-8 py-4 border border-white/30 hover:border-white transition"
              >
                {lang === 'en' ? 'Learn More' : '了解更多'}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="relative z-10 py-32 border-t border-white/10" data-section>
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-3xl lg:text-5xl font-light mb-4">
              {lang === 'en' ? 'Three Core Modules' : '三大核心模块'}
            </h2>
            <p className="text-white/60 max-w-2xl mx-auto">
              {lang === 'en' 
                ? 'Everything you need to build, deploy, and manage autonomous agent workflows.'
                : '构建、部署和管理自主智能体工作流所需的一切。'
              }
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {FEATURES.map((feature, index) => (
              <div
                key={feature.id}
                className="group border border-white/10 p-8 hover:border-white/30 transition-all duration-500"
              >
                <div className="w-14 h-14 border border-white/20 flex items-center justify-center mb-6 group-hover:border-white/50 transition">
                  <feature.icon className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-medium mb-3">
                  {lang === 'en' ? feature.title : feature.titleZh}
                </h3>
                <p className="text-white/50 mb-6 leading-relaxed">
                  {lang === 'en' ? feature.desc : feature.descZh}
                </p>
                <div className="flex gap-6 pt-6 border-t border-white/10">
                  {feature.stats.map((stat) => (
                    <div key={stat.label}>
                      <div className="text-2xl font-light">{stat.value}</div>
                      <div className="text-xs text-white/40 uppercase tracking-wider">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="relative z-10 py-32 border-t border-white/10" data-section>
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl lg:text-5xl font-light mb-6">
                {lang === 'en' ? 'How it Works' : '工作原理'}
              </h2>
              <div className="space-y-8">
                {[
                  { num: '01', title: lang === 'en' ? 'Connect Wallet' : '连接钱包', desc: lang === 'en' ? 'Link your MetaMask or OKX Wallet to access the system.' : '连接 MetaMask 或 OKX 钱包访问系统。' },
                  { num: '02', title: lang === 'en' ? 'Discover Agents' : '发现智能体', desc: lang === 'en' ? 'Browse the marketplace for pre-built agents or create your own.' : '浏览市场寻找预构建智能体或创建自己的。' },
                  { num: '03', title: lang === 'en' ? 'Build Workflows' : '构建工作流', desc: lang === 'en' ? 'Chain agents together with sequential, parallel, or conditional logic.' : '用顺序、并行或条件逻辑将智能体链接在一起。' },
                  { num: '04', title: lang === 'en' ? 'Execute & Monitor' : '执行与监控', desc: lang === 'en' ? 'Deploy with human-in-the-loop approval for critical operations.' : '部署并在关键操作时进行人工审批。' },
                ].map((step) => (
                  <div key={step.num} className="flex gap-6">
                    <div className="text-4xl font-light text-white/20">{step.num}</div>
                    <div>
                      <h3 className="text-lg font-medium mb-1">{step.title}</h3>
                      <p className="text-white/50">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-white/10 p-8">
              <div className="aspect-video bg-white/5 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-6xl mb-4">⚡</div>
                  <div className="text-white/40">Demo Video Placeholder</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Docs Section */}
      <section className="relative z-10 py-24 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-end justify-between mb-10 gap-4">
            <div>
              <h2 className="text-3xl lg:text-4xl font-light mb-3">
                {lang === 'en' ? 'Documentation' : '文档中心'}
              </h2>
              <p className="text-white/60">
                {lang === 'en'
                  ? 'Architecture, workflow, API and AI-agent onboarding docs are now available in-app.'
                  : '架构、工作流、API 与 AI Agent 接入文档现已在站内可用。'}
              </p>
            </div>
            <Link href="/docs" className="text-sm text-white/70 hover:text-white transition flex items-center gap-2">
              {lang === 'en' ? 'Open Docs' : '打开文档'}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Link href="/docs/usage" className="border border-white/10 hover:border-white/30 transition p-5 bg-white/5">
              <BookOpen className="w-5 h-5 text-white/70 mb-3" />
              <h3 className="text-lg mb-1">{lang === 'en' ? 'Quick Start' : '快速开始'}</h3>
              <p className="text-sm text-white/50">{lang === 'en' ? '5-step onboarding flow' : '5 步上手流程'}</p>
            </Link>
            <Link href="/docs/workflows" className="border border-white/10 hover:border-white/30 transition p-5 bg-white/5">
              <Workflow className="w-5 h-5 text-white/70 mb-3" />
              <h3 className="text-lg mb-1">{lang === 'en' ? 'Workflows' : '工作流'}</h3>
              <p className="text-sm text-white/50">{lang === 'en' ? 'Templates, budgets, A2A and HITL' : '模板、预算、A2A 与人工审批'}</p>
            </Link>
            <a href="/llm.txt" target="_blank" rel="noreferrer" className="border border-white/10 hover:border-white/30 transition p-5 bg-white/5">
              <FileText className="w-5 h-5 text-white/70 mb-3" />
              <h3 className="text-lg mb-1">llm.txt</h3>
              <p className="text-sm text-white/50">{lang === 'en' ? 'Machine-readable network spec for AI agents' : '面向 AI Agent 的机器可读网络规范'}</p>
            </a>
          </div>
        </div>
      </section>

      {/* Highlights */}
      <section className="relative z-10 py-20 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-8">
            {HIGHLIGHTS.map((h) => (
              <div key={h.title} className="flex items-start gap-4">
                <div className="w-12 h-12 border border-white/20 flex items-center justify-center shrink-0">
                  <h.icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-medium mb-1">{lang === 'en' ? h.title : h.titleZh}</h3>
                  <p className="text-sm text-white/50">{lang === 'en' ? h.desc : h.descZh}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 py-32 border-t border-white/10">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl lg:text-5xl font-light mb-6">
            {lang === 'en' ? 'Join the network today.' : '立即加入网络。'}
          </h2>
          <p className="text-white/60 mb-8 max-w-xl mx-auto">
            {lang === 'en'
              ? 'Connect your local AI to the decentralized agent economic network. One command is all it takes.'
              : '将你的本地 AI 接入去中心化智能体经济网络，一条命令即可完成。'
            }
          </p>
          <button
            onClick={openWalletModal}
            className="px-10 py-5 bg-white text-black font-medium hover:bg-white/90 transition text-lg"
          >
            {t('enterSystem', lang)}
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-12 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
          <div className="text-sm text-white/40">
            © 2024 AGENTX // POWERED BY X-LAYER
          </div>
          <div className="flex gap-6 text-sm text-white/40">
            <a href="#" className="hover:text-white transition">GitHub</a>
            <Link href="/docs" className="hover:text-white transition">Docs</Link>
            <a href="#" className="hover:text-white transition">Twitter</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
