'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Shield, LockKeyhole } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';

type Session = { authenticated: boolean; mode: 'local-review' | 'server-test'; insecureTransport?: boolean; synthetic?: boolean };
function parseSession(value: unknown): Session {
  const data = value as Partial<Session> | null;
  if (!data || typeof data.authenticated !== 'boolean' || !['server-test', 'local-review'].includes(data.mode ?? '')) throw Error('The server returned an invalid session response.');
  return data as Session;
}
const SessionContext = createContext<{ mode: Session['mode']; synthetic?: boolean; logout: () => Promise<void> }>({ mode: 'local-review', logout: async () => {} });
export const useSession = () => useContext(SessionContext);
export function SessionGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null), [password, setPassword] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function check() {
    setError('');
    try {
      const response = await fetch('/session-api/status', { cache: 'no-store' });
      if (!response.ok) throw Error('The sign-in service is unavailable.');
      const data = parseSession(await response.json());
      setSession(data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Connection failed.'); }
  }
  useEffect(() => {
    void check();
    const expired = () => { setSession(s => s ? { ...s, authenticated: false } : s); setError('Your session expired. Sign in again. Unsaved edits may need to be re-entered.'); };
    window.addEventListener('super-pi-hole-session-expired', expired);
    return () => window.removeEventListener('super-pi-hole-session-expired', expired);
  }, []);
  async function logout() {
    try {
      const response = await fetch('/session-api/logout', { method: 'POST' });
      if (!response.ok) throw Error('Sign-out failed. Please retry.');
      setSession(s => s ? { ...s, authenticated: false } : s);
    } catch { setError('Sign-out failed. Please retry or close this browser session.'); }
  }
  if (session?.authenticated) return <SessionContext.Provider value={{ mode: session.mode, synthetic: session.synthetic, logout }}>{error && <p role="alert" className="pc-error">{error}</p>}{children}</SessionContext.Provider>;
  return <main className="sph-login"><section className="panel sph-login-card">
    <Shield size={36} /><p className="eyebrow">SUPER PI HOLE</p><h1>Network administrator</h1>
    <p>Sign in to view live DNS activity and manage your Pi-hole.</p>
    {session?.insecureTransport && <p className="pc-error">LAN test over HTTP: sign-in and traffic data are not encrypted. Use HTTPS for ongoing use. Never port-forward this interface.</p>}
    {error && <p className="pc-error" role="alert">{error}</p>}
    {!session ? <Button onClick={check}>Retry connection</Button> : <form onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError('');
      try {
        const response = await fetch('/session-api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
        const data = await response.json() as { error?: string };
        if (!response.ok) throw Error(data.error ?? 'Sign-in failed.');
        setPassword(''); setSession(parseSession(data));
      } catch (e) { setError(e instanceof Error ? e.message : 'Sign-in failed.'); }
      finally { setBusy(false); }
    }}>
      <label htmlFor="sph-password">Administrator password</label>
      <Input id="sph-password" type="password" autoComplete="current-password" maxLength={256} required value={password} onChange={e => setPassword(e.target.value)} />
      <Button type="submit" disabled={busy}><LockKeyhole />{busy ? 'Signing in…' : 'Sign in'}</Button>
    </form>}
    <small>The password is set in your server configuration. It is separate from your Pi-hole password.</small>
  </section></main>;
}
