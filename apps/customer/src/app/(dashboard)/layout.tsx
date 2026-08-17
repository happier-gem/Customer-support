import { Sidebar } from "@/components/sidebar";

export default function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col md:flex-row">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col bg-gray-50">{children}</div>
    </div>
  );
}
