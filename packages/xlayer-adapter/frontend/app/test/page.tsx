"use client";

import { DashboardLayout } from "@/components/DashboardLayout";

export default function TestPage() {
  return (
    <DashboardLayout>
      <div className="bg-red-500/20 border-2 border-red-500 p-8">
        <h1 className="text-2xl font-bold mb-4">Layout Test</h1>
        <p className="mb-4">This box should stretch across the entire content area.</p>
        <div className="bg-blue-500/20 border border-blue-500 p-4">
          Inner content
        </div>
      </div>
    </DashboardLayout>
  );
}
