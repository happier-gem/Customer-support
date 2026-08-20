"use client";

import { useState } from "react";
import type { MonthlyTicketCount } from "@/lib/api";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthLabel(key: string): string {
  const monthIndex = Number(key.slice(5, 7)) - 1;
  return MONTH_LABELS[monthIndex] ?? key;
}

/**
 * A single-series magnitude-over-time chart: one accent hue, rounded data-ends anchored to
 * the baseline, direct value labels (there are only ever 12 discrete monthly buckets, not a
 * dense line, so labeling every bar reads cleanly rather than as clutter), and a hover
 * tooltip with the full month. No legend — a single series is already named by the section
 * heading. Scrolls horizontally on narrow viewports instead of squeezing bars unreadably or
 * overflowing the page.
 */
export function MonthlyTicketsChart({ data }: { data: MonthlyTicketCount[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const max = Math.max(1, ...data.map((d) => d.count));

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[480px] items-end gap-2 sm:gap-3" style={{ height: 200 }}>
        {data.map((d) => {
          const heightPct = (d.count / max) * 100;
          const isHovered = hovered === d.month;
          return (
            <div
              key={d.month}
              className="relative flex flex-1 flex-col items-center justify-end"
              style={{ height: "100%" }}
              onMouseEnter={() => setHovered(d.month)}
              onMouseLeave={() => setHovered(null)}
            >
              {isHovered && (
                <div className="absolute -top-7 z-10 whitespace-nowrap rounded-md bg-primary px-2 py-1 text-xs font-medium text-white shadow-sm">
                  {d.month}: {d.count}
                </div>
              )}
              <span className="mb-1 text-xs font-medium text-muted-foreground">{d.count}</span>
              <div
                className={`w-full rounded-t-sm transition-colors ${isHovered ? "bg-info/90" : "bg-info"}`}
                style={{ height: `${Math.max(heightPct, d.count > 0 ? 3 : 0)}%`, minHeight: d.count > 0 ? 2 : 0 }}
              />
              <div className="mt-2 border-t border-border pt-1 text-xs text-muted-foreground">{monthLabel(d.month)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
