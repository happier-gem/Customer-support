export const inputClass =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring";

export const buttonClass =
  "w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50";

export const labelClass = "mb-1 block text-sm font-medium text-foreground/80";

export const linkClass = "font-medium text-primary underline underline-offset-2 hover:text-primary/80";

export const errorTextClass = "rounded-md bg-danger/10 px-3 py-2 text-sm text-danger";

export const successTextClass = "rounded-md bg-success/10 px-3 py-2 text-sm text-success";

export const selectClass =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring";

export const secondaryButtonClass =
  "rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-ring/40 hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50";

export const cardClass = "rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm";

/** Dynamic initials for an org/user avatar fallback, e.g. "ABC Technologies" -> "AT". */
export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const STATUS_BADGE_CLASSES: Record<string, string> = {
  OPEN: "bg-info/10 text-info",
  IN_PROGRESS: "bg-warning/10 text-warning",
  WAITING_FOR_CUSTOMER: "bg-purple-50 text-purple-700",
  RESOLVED: "bg-success/10 text-success",
  CLOSED: "bg-muted text-muted-foreground",
};

const PRIORITY_BADGE_CLASSES: Record<string, string> = {
  LOW: "bg-muted text-muted-foreground",
  MEDIUM: "bg-info/10 text-info",
  HIGH: "bg-warning/10 text-warning",
  URGENT: "bg-danger/10 text-danger",
};

export function statusBadgeClass(status: string): string {
  return `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[status] ?? "bg-muted text-muted-foreground"}`;
}

export function priorityBadgeClass(priority: string): string {
  return `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORITY_BADGE_CLASSES[priority] ?? "bg-muted text-muted-foreground"}`;
}

export function formatStatusLabel(status: string): string {
  return status.replace(/_/g, " ");
}
