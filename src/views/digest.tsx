import type { DigestRow, Night } from '../digest/types.js';

const dash = '—';

// Retries of 3 or more, or a failed last run, get flagged. The word is in the markup so the
// flag survives a screenshot, an agent's fetch and a stylesheet-less reader alike.
function flag(row: DigestRow): string | null {
  if (row.lastStatus === 'fail') return 'fail';
  if (row.retries >= 3) return 'retries';
  return null;
}

export function DigestPage({ digest }: { digest: Night }) {
  return (
    <>
      <h1>digest {digest.night}</h1>
      {digest.badLines > 0 && (
        <p class="warn">
          {digest.badLines} {digest.badLines === 1 ? 'line' : 'lines'} in the log could not be read
        </p>
      )}
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => {
              const marked = flag(row);
              return (
                <tr class={marked ? 'warn' : undefined} data-flag={marked ?? undefined}>
                  <td>{row.job}{marked && ` ⚠ ${marked}`}</td>
                  <td>{row.owner ?? dash}</td>
                  <td>{row.runs}</td>
                  <td>{row.retries}</td>
                  <td>{row.lastStatus}</td>
                  <td>{row.lastError ?? dash}</td>
                  <td>{row.firstAt || dash}</td>
                  <td>{row.lastAt || dash}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

export function DigestNotFound({ night }: { night: string }) {
  return (
    <>
      <h1>digest {night}</h1>
      <p class="mute">no run log for this night</p>
    </>
  );
}
