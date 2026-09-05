'use client';
import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { liveApi, useData } from './live-pihole';
export function GravityControl() {
  const [revision, refresh] = useState(0), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const status = useData<{ writeEnabled: boolean }>('status', 0), job = useData<{ state: string; output: string; startedAt: string | null; finishedAt: string | null }>('gravity', revision);
  useEffect(() => { const timer = setInterval(() => { if (!document.hidden) refresh(r => r + 1); }, 5000); return () => clearInterval(timer); }, []);
  return <section className="panel"><h2>Refresh Gravity</h2><p>Download your subscribed list data and rebuild the blocking database. This never upgrades Pi-hole or Super Pi Hole application code. Review individual list failures before relying on coverage.</p>
    <Button disabled={busy || !status.data?.writeEnabled || job.data?.state === 'running'} onClick={async () => {
      if (!window.confirm('Download subscribed blocklist data and rebuild Gravity now?')) return;
      setBusy(true); setError('');
      try { await liveApi('action', undefined, { action: 'gravity-update', confirmed: true }); refresh(r => r + 1); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }}>Update Gravity</Button>
    {(error || job.error) && <p role="alert">{error || job.error}</p>}
    <p role="status">{job.data?.state ?? 'Reading job status…'}</p>
    {job.data?.output && <pre style={{ maxHeight: 280, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{job.data.output}</pre>}
    <small>Job status belongs to this controller session. After a controller restart, check list status before starting another update.</small>
  </section>;
}
