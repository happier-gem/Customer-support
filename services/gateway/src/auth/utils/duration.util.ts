const DURATION_PATTERN = /^(\d+)(s|m|h|d)$/;

/** Parses a short duration string like "15m", "7d", "30s" into milliseconds. */
export function parseDurationMs(input: string): number {
  const match = DURATION_PATTERN.exec(input.trim());
  if (!match) {
    throw new Error(`Invalid duration string: "${input}". Expected formats like "15m", "7d", "30s".`);
  }
  const value = Number(match[1]);
  const unit = match[2];
  const unitMs: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * unitMs[unit];
}
