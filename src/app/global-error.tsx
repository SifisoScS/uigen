"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.error(error);
    }
  }, [error]);

  return (
    <html>
      <body>
        <div className="flex h-screen items-center justify-center">
          <div className="text-center space-y-4 p-8">
            <h2 className="text-xl font-semibold">Something went wrong</h2>
            <p className="text-sm text-gray-500 max-w-sm">
              A critical error occurred. Please refresh the page.
            </p>
            <button
              onClick={reset}
              className="px-4 py-2 text-sm rounded-md bg-black text-white hover:bg-gray-800 transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
