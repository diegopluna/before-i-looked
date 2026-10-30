import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, JobStatus, ReadNight, RunLine } from './types.js';

// Plan morning-digest § 1. `night` comes from a URL: anything but YYYY-MM-DD never reaches the
// filesystem, so no path traversal.
const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly JobStatus[] = ['ok', 'retry', 'fail'];

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }

  // Lines in file order: the first line seen for a job is its earliest, the last its latest.
  // Dates are never parsed, so offsets stay as written.
  const byJob = new Map<string, DigestRow>();
  let badLines = 0;
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (!line) {
      badLines++;
      continue;
    }
    const row = byJob.get(line.job);
    if (!row) {
      byJob.set(line.job, {
        job: line.job,
        owner: line.owner,
        runs: 1,
        retries: line.status === 'retry' ? 1 : 0,
        lastStatus: line.status,
        lastError: line.error ?? null,
        firstAt: line.at,
        lastAt: line.at,
      });
      continue;
    }
    row.owner = line.owner;
    row.runs++;
    if (line.status === 'retry') row.retries++;
    row.lastStatus = line.status;
    if (line.error !== undefined) row.lastError = line.error;
    row.lastAt = line.at;
  }

  // Code-unit order, not localeCompare: the same on every machine.
  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, badLines };
};

// A RunLine, or null if the line isn't one. A missing `owner` (or `error: null`) reads as none.
function parseLine(raw: string): RunLine | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const { at, job, status, owner = null, error } = v as Record<string, unknown>;
  if (typeof at !== 'string' || at === '') return null;
  if (typeof job !== 'string' || job === '') return null;
  if (!STATUSES.includes(status as JobStatus)) return null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && error !== null && typeof error !== 'string') return null;
  const line: RunLine = { at, job, status: status as JobStatus, owner };
  if (typeof error === 'string') line.error = error;
  return line;
}
