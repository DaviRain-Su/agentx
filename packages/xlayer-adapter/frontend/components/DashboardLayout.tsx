"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWeb3 } from "./Web3Provider";
import { useLangStore } from "@/store/lang";
import { t, translations } from "@/lib/i18n";
import {
  Workflow,
  ShoppingCart,
  Users,
  ClipboardList,
  Settings,
  LogOut,
  ChevronRight,
  Terminal,
  Globe,
  Home,
  Zap,
} from "lucide-react";

const NAV_ITEMS: { id: string; label: "Home" | "navWorkflows" | "navMarket" | "navTeams" | "navTasks" | "Octo-Kinetic"; icon: typeof Home; href: string }[] = [
  { id: "home", label: "Home", icon: Home, href: "/" },
  { id: "workflows", label: "navWorkflows", icon: Workflow, href: "/workflows" },
  { id: "market", label: "navMarket", icon: ShoppingCart, href: "/market" },
  { id: "teams", label: "navTeams", icon: Users, href: "/teams" },
  { id: "tasks", label: "navTasks", icon: ClipboardList, href: "/tasks" },
  { id: "octo", label: "Octo-Kinetic", icon: Zap, href: "/octo" },
];

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { address, disconnect } = useWeb3();
  const { lang, toggleLang } = useLangStore();
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  return (
    <div className="min-h-screen bg-[#060e20] text-[#dee5ff] flex">
      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 bottom-0 z-40 bg-[#0f1930] border-r border-[#40485d]/30 transition-all duration-300 flex-shrink-0 ${
          isSidebarOpen ? "w-72" : "w-20"
        }`}
      >
        {/* Logo */}
        <div className="h-20 flex items-center px-6 border-b border-[#40485d]/30">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#ba9eff] to-[#53ddfc] flex items-center justify-center">
              <Terminal className="w-5 h-5 text-[#39008c]" />
            </div>
            {isSidebarOpen && (
              <span className="font-headline font-bold text-xl tracking-tight text-[#dee5ff]">
                NEURAL PRISM
              </span>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));

            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all ${
                  isActive
                    ? "bg-[#ba9eff]/10 text-[#ba9eff] border border-[#ba9eff]/20"
                    : "text-[#a3aac4] hover:bg-white/5 hover:text-[#dee5ff]"
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {isSidebarOpen && (
                  <span className="font-medium font-headline">{item.label === "Home" ? "Home" : t(item.label as keyof typeof translations.en, lang)}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-[#40485d]/30">
          {/* Language toggle */}
          <button
            onClick={toggleLang}
            className="w-full flex items-center gap-4 px-4 py-3 text-[#a3aac4] hover:bg-white/5 hover:text-[#dee5ff] rounded-xl transition-all mb-2"
          >
            <Globe className="w-5 h-5 shrink-0" />
            {isSidebarOpen && (
              <span className="font-medium">{lang === "en" ? "English" : "中文"}</span>
            )}
          </button>

          {/* Settings */}
          <button className="w-full flex items-center gap-4 px-4 py-3 text-[#a3aac4] hover:bg-white/5 hover:text-[#dee5ff] rounded-xl transition-all mb-2">
            <Settings className="w-5 h-5 shrink-0" />
            {isSidebarOpen && <span className="font-medium">Settings</span>}
          </button>

          {/* Disconnect */}
          <button
            onClick={disconnect}
            className="w-full flex items-center gap-4 px-4 py-3 text-[#a3aac4] hover:bg-red-500/10 hover:text-red-400 rounded-xl transition-all"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {isSidebarOpen && <span className="font-medium">{t("disconnect", lang)}</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main
        className={`flex-1 min-w-0 transition-all duration-300 ${
          isSidebarOpen ? "ml-72" : "ml-20"
        }`}
      >
        {/* Header */}
        <header className="h-20 flex items-center justify-between px-8 border-b border-[#40485d]/30 bg-[#060e20]/80 backdrop-blur-xl sticky top-0 z-30">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2.5 hover:bg-white/5 rounded-xl transition border border-[#40485d]/30"
          >
            <ChevronRight
              className={`w-5 h-5 transition-transform ${
                isSidebarOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          <div className="flex items-center gap-4">
            <div className="text-sm text-[#a3aac4]">
              <span className="text-[#6d758c]">Wallet:</span>{" "}
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </div>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#ba9eff] to-[#53ddfc]" />
          </div>
        </header>

        {/* Page content */}
        <div className="p-8 retro-grid min-h-[calc(100vh-80px)]">
          {children}
        </div>
      </main>
    </div>
  );
}
