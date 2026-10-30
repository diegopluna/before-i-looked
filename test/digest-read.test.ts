import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

// runs/ is read-only: real nights are only read; everything else goes to a temp dir.
const tmp = mkdtempSync(join(tmpdir(), 'rig-digest-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function nightFile(night: string, lines: string): string {
  const dir = mkdtempSync(join(tmp, 'runs-'));
  writeFileSync(join(dir, `${night}.jsonl`), lines);
  return dir;
}

describe('readNight on the real night', () => {
  const n = readNight('runs', '2026-10-28')!;

  it('has 5 jobs, sorted by job, and 1 bad line', () => {
    expect(n.night).toBe('2026-10-28');
    expect(n.badLines).toBe(1);
    expect(n.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('keeps the row with a null owner', () => {
    expect(n.rows[0]).toEqual({
      job: 'digest/render',
      owner: null,
      runs: 1,
      retries: 0,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T05:41:09+01:00',
      lastAt: '2026-10-29T05:41:09+01:00',
    });
  });

  it('counts retries and keeps the last error after a later ok', () => {
    expect(n.rows[1]).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('spans midnight with times verbatim, and skips the truncated line', () => {
    expect(n.rows[2]).toMatchObject({
      job: 'lane/sync',
      runs: 8,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'lock held',
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
  });

  it('shows a failed job', () => {
    expect(n.rows[3]).toMatchObject({
      job: 'notes/backup',
      owner: 'lane-07',
      runs: 1,
      lastStatus: 'fail',
      lastError: 'quota exceeded',
    });
  });
});

describe('readNight edge cases', () => {
  it('returns null when the night has no file', () => {
    expect(readNight(tmp, '2026-01-01')).toBeNull();
  });

  it('returns a night with no rows for an empty file', () => {
    expect(readNight(nightFile('2026-01-02', ''), '2026-01-02')).toEqual({
      night: '2026-01-02',
      rows: [],
      badLines: 0,
    });
  });

  it('returns null for a night that is not YYYY-MM-DD, without touching the disk', () => {
    const dir = join(tmp, 'nested');
    mkdirSync(dir);
    writeFileSync(join(tmp, 'evil.jsonl'), '{"at":"x","job":"j","status":"ok","owner":null}\n');
    for (const night of ['../evil', '2026-1-02', '2026-01-02.jsonl', '2026-01-02/../x', '', ' 2026-01-02']) {
      expect(readNight(dir, night)).toBeNull();
    }
  });

  it('counts invalid lines and ignores blank ones', () => {
    const dir = nightFile(
      '2026-01-03',
      [
        '{"at":"2026-01-03T01:00:00+01:00","job":"a","status":"ok","owner":"rook"}',
        '',
        '   ',
        'not json',
        '42',
        'null',
        '["a"]',
        '{"job":"a","status":"ok","owner":"rook"}',
        '{"at":"2026-01-03T02:00:00+01:00","status":"ok","owner":"rook"}',
        '{"at":"2026-01-03T02:00:00+01:00","job":"a","status":"done","owner":"rook"}',
        '{"at":"2026-01-03T02:00:00+01:00","job":"a","status":"ok","owner":7}',
        '{"at":"2026-01-03T02:00:00+01:00","job":"a","status":"ok","owner":"rook","error":{}}',
        '',
      ].join('\n'),
    );
    const n = readNight(dir, '2026-01-03')!;
    expect(n.badLines).toBe(9);
    expect(n.rows).toHaveLength(1);
    expect(n.rows[0]!.runs).toBe(1);
  });

  it('orders by line, not by date, and takes owner and status from the latest line', () => {
    const dir = nightFile(
      '2026-01-04',
      [
        '{"at":"2026-01-04T03:00:00+01:00","job":"b","status":"retry","owner":"rook","error":"first"}',
        '{"at":"2026-01-04T02:00:00Z","job":"a","status":"ok"}',
        '{"at":"2026-01-04T01:00:00+01:00","job":"b","status":"fail","owner":null,"error":null}',
      ].join('\r\n'),
    );
    const n = readNight(dir, '2026-01-04')!;
    expect(n.badLines).toBe(0);
    expect(n.rows).toEqual([
      {
        job: 'a',
        owner: null,
        runs: 1,
        retries: 0,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-01-04T02:00:00Z',
        lastAt: '2026-01-04T02:00:00Z',
      },
      {
        job: 'b',
        owner: null,
        runs: 2,
        retries: 1,
        lastStatus: 'fail',
        lastError: 'first',
        firstAt: '2026-01-04T03:00:00+01:00',
        lastAt: '2026-01-04T01:00:00+01:00',
      },
    ]);
  });
});
