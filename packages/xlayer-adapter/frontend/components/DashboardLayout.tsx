"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWeb3 } from "./Web3Provider";
import { useLangStore } from "@/store/lang";
import { t } from "@/lib/i18n";
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
} from "lucide-react";

const NAV_ITEMS = [
  { id: "workflows", label: "navWorkflows", icon: Workflow, href: "/workflows" },
  { id: "market", label: "navMarket", icon: ShoppingCart, href: "/market" },
  { id: "teams", label: "navTeams", icon: Users, href: "/teams" },
  { id: "tasks", label: "navTasks", icon: ClipboardList, href: "/tasks" },
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
    <div className="min-h-screen bg-[#020202] flex w-full">
      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 bottom-0 z-40 bg-[#0a0a0f] border-r border-white/10 transition-all duration-300 flex-shrink-0 ${
          isSidebarOpen ? "w-64" : "w-16"
        }`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-white/10">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white text-black flex items-center justify-center rounded">
              <Terminal className="w-5 h-5" />
            </div>
            {isSidebarOpen && (
              <span className="font-semibold tracking-wide">GRADIENCE</span>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav className="p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {isSidebarOpen && (
                  <span className="text-sm font-medium">{t(item.label, lang)}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-white/10">
          {/* Language toggle */}
          <button
            onClick={toggleLang}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-white/60 hover:bg-white/5 hover:text-white rounded-lg transition-all mb-1"
          >
            <Globe className="w-5 h-5 shrink-0" />
            {isSidebarOpen && (
              <span className="text-sm">{lang === "en" ? "English" : "中文"}</span>
            )}
          </button>

          {/* Settings */}
          <button className="w-full flex items-center gap-3 px-3 py-2.5 text-white/60 hover:bg-white/5 hover:text-white rounded-lg transition-all mb-1">
            <Settings className="w-5 h-5 shrink-0" />
            {isSidebarOpen && <span className="text-sm">Settings</span>}
          </button>

          {/* Disconnect */}
          <button
            onClick={disconnect}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-white/60 hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-all"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {isSidebarOpen && <span className="text-sm">{t("disconnect", lang)}</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main
        className={`flex-1 min-w-0 w-full transition-all duration-300 overflow-hidden ${
          isSidebarOpen ? "ml-64" : "ml-16"
        }`}
      >
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-6 border-b border-white/10 bg-[#020202]/50 backdrop-blur-sm sticky top-0 z-30">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-white/5 rounded-lg transition"
          >
            <ChevronRight
              className={`w-5 h-5 transition-transform ${
                isSidebarOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          <div className="flex items-center gap-4">
            <div className="text-sm text-white/60">
              <span className="text-white/40">Wallet:</span>{" "}
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </div>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500" />
          </div>
        </header>

        {/* Page content */}
        <div className="p-6 w-full overflow-x-hidden">{children}</div>
      </main>
    </div>
  );
}
