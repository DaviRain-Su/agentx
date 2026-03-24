"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#020202] text-white flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-light mb-4">Something went wrong</h2>
        <p className="text-white/60 mb-6">{error.message}</p>
        <button
          onClick={reset}
          className="px-6 py-3 bg-white text-black hover:bg-white/90 transition"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
