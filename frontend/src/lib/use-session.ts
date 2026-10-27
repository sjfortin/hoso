import { useCallback, useEffect, useRef, useState } from 'react';
import { api, message, RequestError, sessionEndpoint } from './api';

export interface Session {
  id: string; folder: string; startedAt: string; launcher: 'shell' | 'codex';
  state: 'running' | 'exited'; program: string; output: string; retention: string;
}
export function useSession(active: boolean, onRevoked: () => void) {
  const [session, setSession] = useState<Session | null>(null);
  const [online, setOnline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [delivery, setDelivery] = useState('');
  const epoch = useRef(0);
  const mounted = useRef(false);
  const sending = useRef(false);
  const polling = useRef<number | null>(null);
  const refresh = useCallback(async () => {
    if (!mounted.current || sending.current || polling.current === epoch.current || document.hidden) return;
    const version = epoch.current;
    polling.current = version;
    try {
      const data = await api<{ session: Session | null }>(sessionEndpoint);
      if (!mounted.current || epoch.current !== version) return;
      setSession(data.session); setOnline(true);
    } catch (failure) {
      if (!mounted.current || epoch.current !== version) return;
      setOnline(false);
      if (failure instanceof RequestError && failure.status === 401) {
        epoch.current++; setSession(null); setDelivery(''); onRevoked();
      }
    } finally { if (polling.current === version) polling.current = null; }
  }, [onRevoked]);
  useEffect(() => {
    mounted.current = active;
    epoch.current++;
    if (!active) { setSession(null); setOnline(false); setDelivery(''); return; }
    void refresh();
    const timer = setInterval(refresh, 1000);
    const visible = () => { if (!document.hidden) void refresh(); };
    const offline = () => { epoch.current++; setOnline(false); setDelivery(''); if (sending.current) setError('Delivery could not be confirmed. Check the output before sending again. Hoso will not resend it.'); };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', refresh); window.addEventListener('offline', offline);
    return () => { mounted.current = false; epoch.current++; clearInterval(timer); document.removeEventListener('visibilitychange', visible); window.removeEventListener('online', refresh); window.removeEventListener('offline', offline); };
  }, [active, refresh]);
  const run = async (action: string, options: { text?: string; folder?: string; launcher?: string; sessionId?: string } = {}) => {
    if (!active || !online || sending.current) return false;
    sending.current = true; const version = ++epoch.current;
    setBusy(true); setError(''); setDelivery('Sending…');
    try {
      const body = action === 'create' ? { action, folder: options.folder ?? '', launcher: options.launcher ?? 'codex' } : { action, sessionId: options.sessionId ?? session?.id, requestId: crypto.randomUUID(), ...(options.text === undefined ? {} : { text: options.text }) };
      await api(sessionEndpoint, body);
      if (!mounted.current || epoch.current !== version) return false;
      setDelivery(action === 'create' ? 'Session started.' : action === 'end' ? 'Session ended.' : action === 'submit' ? 'Message sent to Codex.' : action === 'interrupt' ? 'Interrupt sent. Check the output before continuing.' : 'Input sent.');
      return true;
    } catch (failure) {
      if (!mounted.current || epoch.current !== version) return false;
      setDelivery('');
      setError(message(failure, 'Delivery could not be confirmed. Check the output before sending again. Hoso will not resend it.'));
      if (!(failure instanceof RequestError)) setOnline(false);
      if (failure instanceof RequestError && failure.status === 401) { setOnline(false); setSession(null); onRevoked(); }
      return false;
    } finally { sending.current = false; if (mounted.current) setBusy(false); void refresh(); }
  };
  return { session, online, busy, error, delivery, run, setError };
}
