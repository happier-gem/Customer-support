import { Suspense } from "react";
import { Sidebar } from "@/components/sidebar";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";

export default function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col md:flex-row">
      <Suspense fallback={null}>
        <Sidebar />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <div className="hidden items-center justify-end gap-1 border-b border-border bg-card px-4 py-2.5 md:flex">
          <ThemeToggle />
          <NotificationBell />
        </div>
        {children}
      </div>
    </div>
  );
}
