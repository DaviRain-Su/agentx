"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";

const DOCS_NAV = [
  {
    section: "Getting Started",
    items: [
      { label: "Overview", href: "/docs" },
      { label: "Quick Start", href: "/docs/usage" },
    ],
  },
  {
    section: "Guides",
    items: [
      { label: "Workflows", href: "/docs/workflows" },
      { label: "Deploy an Agent", href: "/docs/agents" },
    ],
  },
  {
    section: "Reference",
    items: [
      { label: "API Reference", href: "/docs/api" },
      { label: "llm.txt", href: "/llm.txt", external: true },
    ],
  },
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto flex gap-10">
        {/* Docs sidebar */}
        <aside className="w-52 shrink-0">
          <div className="sticky top-8 space-y-6">
            {DOCS_NAV.map((group) => (
              <div key={group.section}>
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/30 mb-2">{group.section}</p>
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const isActive = !item.external && (
                      item.href === "/docs" ? pathname === "/docs" : pathname.startsWith(item.href)
                    );
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          target={item.external ? "_blank" : undefined}
                          rel={item.external ? "noreferrer" : undefined}
                          className={`block px-3 py-1.5 text-sm transition-colors border-l-2 ${
                            isActive
                              ? "border-white text-white bg-white/5"
                              : "border-transparent text-white/50 hover:text-white hover:border-white/30"
                          }`}
                        >
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </aside>

        {/* Docs content */}
        <div className="flex-1 min-w-0 max-w-3xl">
          {children}
        </div>
      </div>
    </DashboardLayout>
  );
}
