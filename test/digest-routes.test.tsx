import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night, RunLine } from '../src/digest/types.js';

// Own temp runs dir; runs/ is read-only real data and is never written here.
let runsDir: string;

const line = (l: RunLine) => JSON.stringify(l);

// Unsorted in the file on purpose; `build-report` has no owner.
const busyNight = [
  line({ at: '2026-10-29T23:10:00+01:00', job: 'sync-mail', status: 'ok', owner: 'ana' }),
  line({ at: '2026-10-29T23:20:00+01:00', job: 'backup-db', status: 'retry', owner: 'ben', error: 'timeout' }),
  line({ at: '2026-10-29T23:25:00+01:00', job: 'backup-db', status: 'ok', owner: 'ben' }),
  line({ at: '2026-10-29T23:40:00+01:00', job: 'build-report', status: 'fail', owner: null, error: 'no input' }),
].join('\n') + '\n';

const badLineNight = [
  line({ at: '2026-10-30T23:10:00+01:00', job: 'sync-mail', status: 'ok', owner: 'ana' }),
  line({ at: '2026-10-30T23:40:00+01:00', job: 'backup-db', status: 'ok', owner: 'ben' }),
  '{"at":"2026-10-30T23:5',
].join('\n') + '\n';

const busyJobs = ['backup-db', 'build-report', 'sync-mail'];

beforeAll(() => {
  runsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-runs-'));
  fs.writeFileSync(path.join(runsDir, '2026-10-29.jsonl'), busyNight);
  fs.writeFileSync(path.join(runsDir, '2026-10-30.jsonl'), badLineNight);
  fs.writeFileSync(path.join(runsDir, '2026-10-31.jsonl'), '');
});

afterAll(() => {
  fs.rmSync(runsDir, { recursive: true, force: true });
});

const config = () => ({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });

describe('digest page (2a)', () => {
  it('renders a night with a few jobs, sorted by job, owner null shown as a dash', async () => {
    const res = await createApp(config()).request('/digest/2026-10-29');
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const job of busyJobs) expect(html).toContain(job);
    expect(html).toContain('—');
  });

  it('404s for a night with no file', async () => {
    const res = await createApp(config()).request('/digest/2001-01-01');
    expect(res.status).toBe(404);
  });

  it('says "nothing ran" for an empty night', async () => {
    const res = await createApp(config()).request('/digest/2026-10-31');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('still renders a night with a bad line, listing the good jobs', async () => {
    const res = await createApp(config()).request('/digest/2026-10-30');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('backup-db');
    expect(html).toContain('sync-mail');
  });
});

describe('digest JSON (2b)', () => {
  it('returns the night with one row per job, sorted by job', async () => {
    const res = await createApp(config()).request('/api/digest/2026-10-29');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.night).toBe('2026-10-29');
    expect(body.rows.map((r) => r.job)).toEqual(busyJobs);
    const build = body.rows.find((r) => r.job === 'build-report');
    expect(build?.owner).toBeNull();
    expect(build?.lastStatus).toBe('fail');
  });

  it('404s for a night with no file, with a JSON error', async () => {
    const res = await createApp(config()).request('/api/digest/2001-01-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toHaveProperty('error');
  });

  it('returns rows: [] for an empty night', async () => {
    const res = await createApp(config()).request('/api/digest/2026-10-31');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.rows).toEqual([]);
  });

  it('counts a bad line in badLines and keeps the good jobs', async () => {
    const res = await createApp(config()).request('/api/digest/2026-10-30');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['backup-db', 'sync-mail']);
  });
});

describe('page and JSON agree (ADR 0001)', () => {
  it('lists every JSON job in the page, in the same order', async () => {
    const app = createApp(config());
    const html = await (await app.request('/digest/2026-10-29')).text();
    const body = (await (await app.request('/api/digest/2026-10-29')).json()) as Night;

    let previous = -1;
    for (const row of body.rows) {
      const at = html.indexOf(row.job);
      expect(at, `${row.job} missing from page`).toBeGreaterThan(-1);
      expect(at, `${row.job} out of order on page`).toBeGreaterThan(previous);
      previous = at;
    }
  });
});
