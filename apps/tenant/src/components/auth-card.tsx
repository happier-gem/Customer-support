import type { ReactNode } from "react";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
