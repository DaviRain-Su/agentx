"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#020202] text-white flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-4xl font-light mb-4">404</h2>
        <p className="text-white/60 mb-6">Page not found</p>
        <Link
          href="/"
          className="px-6 py-3 bg-white text-black hover:bg-white/90 transition inline-block"
        >
          Return Home
        </Link>
      </div>
    </div>
  );
}
