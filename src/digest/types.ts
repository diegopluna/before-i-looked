// Plan morning-digest § 1. The contract the digest page, JSON API, board link and route tests
// code against; the reader itself lives next to it. Times are the log's own strings, offset kept.

export type JobStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, as written by the night's jobs.
export type RunLine = {
  at: string;
  job: string;
  status: JobStatus;
  owner: string | null;
  error?: string;
};

export type DigestRow = {
  job: string;
  /** Owner on the job's latest line; `null` when the log has none (shown as `—`). */
  owner: string | null;
  /** Parsed lines for this job, whatever their status. */
  runs: number;
  /** Lines for this job with status `retry`. */
  retries: number;
  /** Status of the job's latest line. */
  lastStatus: JobStatus;
  /** Most recent `error` the job logged, even if a later run was ok; `null` if it never logged one. */
  lastError: string | null;
  /** `at` of the job's earliest line, verbatim (e.g. `2026-10-29T01:30:00+01:00`). */
  firstAt: string;
  /** `at` of the job's latest line, verbatim. */
  lastAt: string;
};

export type Night = {
  night: string;
  /** One row per job, sorted by job, so the page and the JSON can't disagree (ADR 0001). */
  rows: DigestRow[];
  /** Lines that didn't parse as a RunLine; counted, never thrown. */
  badLines: number;
};

// Sync, like the rest of rig's file reads. `null` = no runs/<night>.jsonl (404); an empty file
// is a Night with no rows ("nothing ran").
export type ReadNight = (runsDir: string, night: string) => Night | null;
