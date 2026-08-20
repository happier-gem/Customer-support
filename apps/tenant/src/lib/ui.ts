export const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export const buttonClass =
  "w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50";

export const labelClass = "mb-1 block text-sm font-medium text-gray-700";

export const linkClass = "font-medium text-indigo-600 underline underline-offset-2 hover:text-indigo-800";

export const errorTextClass = "rounded-md bg-red-50 px-3 py-2 text-sm text-red-700";

export const successTextClass = "rounded-md bg-green-50 px-3 py-2 text-sm text-green-700";

export const selectClass =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export const secondaryButtonClass =
  "rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50";

export const dangerButtonClass =
  "rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50";

export const cardClass = "rounded-xl border border-gray-200 bg-white p-6 shadow-sm";

const STATUS_BADGE_CLASSES: Record<string, string> = {
  OPEN: "bg-indigo-50 text-indigo-700",
  IN_PROGRESS: "bg-amber-50 text-amber-700",
  WAITING_FOR_CUSTOMER: "bg-purple-50 text-purple-700",
  RESOLVED: "bg-emerald-50 text-emerald-700",
  CLOSED: "bg-gray-100 text-gray-600",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  INACTIVE: "bg-gray-100 text-gray-600",
};

const PRIORITY_BADGE_CLASSES: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-600",
  MEDIUM: "bg-blue-50 text-blue-700",
  HIGH: "bg-orange-50 text-orange-700",
  URGENT: "bg-red-50 text-red-700",
};

export function statusBadgeClass(status: string): string {
  return `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[status] ?? "bg-gray-100 text-gray-600"}`;
}

export function priorityBadgeClass(priority: string): string {
  return `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORITY_BADGE_CLASSES[priority] ?? "bg-gray-100 text-gray-600"}`;
}

export function formatStatusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

/** e.g. 138 -> "2h 18m"; 45 -> "45m"; 0.4 -> "<1m". */
export function formatDurationMinutes(totalMinutes: number): string {
  if (totalMinutes < 1) return "<1m";
  const minutes = Math.round(totalMinutes);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return `${remainingMinutes}m`;
  if (remainingMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainingMinutes}m`;
}
