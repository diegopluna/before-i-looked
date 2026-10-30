import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight } from './digest/read.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightSummary[];
};

// Counts of digest rows by lastStatus; `null` when the night can't be read (shown as `—`).
export type NightSummary = {
  night: string;
  counts: { ok: number; retry: number; fail: number } | null;
};

function summarize(runsDir: string, night: string): NightSummary {
  try {
    const read = readNight(runsDir, night);
    if (!read) return { night, counts: null };
    const counts = { ok: 0, retry: 0, fail: 0 };
    for (const row of read.rows) counts[row.lastStatus]++;
    return { night, counts };
  } catch {
    return { night, counts: null };
  }
}

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((n) => summarize(config.runsDir, n)),
  };
}
