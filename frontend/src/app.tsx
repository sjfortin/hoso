import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowUp, ArrowUpRight, Check, ChevronDown, CircleStop, CornerDownLeft, FolderOpen, Keyboard, LoaderCircle, Mic, Monitor, ShieldCheck, Smartphone, SquareTerminal, Unplug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { api, desktop, initialPairingToken, message, RequestError } from '@/lib/api';
import { useSession } from '@/lib/use-session';
import { useDictation } from '@/lib/use-dictation';

interface Computer { name: string; publicOrigin?: string; devices?: { id: string; name: string; connectedAt: string }[] }
function Notice({ children }: { children: ReactNode }) { return children ? <p className="error-message" role="alert">{children}</p> : null; }
function Badge({ online, children }: { online: boolean; children: ReactNode }) { return <span className={`status-badge ${online ? 'is-online' : ''}`}><span className="status-dot" />{children}</span>; }

function Confirm({ trigger, title, description, action, disabled, destructive = false, onConfirm }: {
  trigger: ReactNode; title: string; description: string; action: string; disabled?: boolean; destructive?: boolean; onConfirm: () => Promise<boolean> | void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [confirmationError, setConfirmationError] = useState('');
  const cancel = useRef<HTMLButtonElement>(null);
  return <AlertDialog open={open} onOpenChange={value => { if (!pending) { setOpen(value); setConfirmationError(''); } }}>
    <AlertDialogTrigger render={<Button type="button" variant={destructive ? 'destructive' : 'secondary'} disabled={disabled} />}>{trigger}</AlertDialogTrigger>
    <AlertDialogContent initialFocus={cancel} className="confirm-dialog">
      <AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader>
      <Notice>{confirmationError}</Notice>
      <AlertDialogFooter>
        <AlertDialogCancel ref={cancel} disabled={pending}>Cancel</AlertDialogCancel>
        <AlertDialogAction type="button" variant={destructive ? 'destructive' : 'default'} disabled={pending || disabled} onClick={async () => {
          if (pending) return; setPending(true); setConfirmationError('');
          try { const result = await onConfirm(); if (result !== false) setOpen(false); else setConfirmationError('The request was not confirmed. Cancel and check the connection before trying again.'); }
          catch { setConfirmationError('The request could not be confirmed. Cancel and check the connection.'); }
          finally { setPending(false); }
        }}>{pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}{action}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}

function Workspace({ onRevoked }: { onRevoked: () => void }) {
  const { session, online, busy, error, delivery, run, setError } = useSession(true, onRevoked);
  const [folder, setFolder] = useState('');
  const [launcher, setLauncher] = useState('codex');
  const [draft, setDraft] = useState('');
  const [tools, setTools] = useState(false);
  const [wide, setWide] = useState(() => matchMedia('(min-width: 768px)').matches);
  const output = useRef<HTMLPreElement>(null);
  const following = useRef(true);
  const previousSession = useRef<string | undefined>(undefined);
  const speech = useDictation(online && !busy && session?.state === 'running', text => setDraft(current => [current, text].filter(Boolean).join(' ').slice(0, 2000)));
  const disabled = !online || busy || speech.listening;
  const exited = session?.state === 'exited';
  const agent = session?.launcher === 'codex';
  useEffect(() => {
    const query = matchMedia('(min-width: 768px)'); const update = () => setWide(query.matches);
    query.addEventListener('change', update); return () => query.removeEventListener('change', update);
  }, []);
  useLayoutEffect(() => {
    if (previousSession.current !== session?.id) { following.current = true; previousSession.current = session?.id; setTools(false); setDraft(''); }
    if (following.current && output.current) output.current.scrollTop = output.current.scrollHeight;
  }, [session?.output, session?.id]);
  const submit = async () => {
    if (!draft.trim() || disabled || exited) return;
    if (/[\x00-\x1f\x7f-\x9f]/.test(draft)) { setError('Send one line at a time. Use Confirm / Enter separately for terminal prompts.'); return; }
    const text = draft;
    if (await run(agent ? 'submit' : 'text', { text })) setDraft(current => current === text ? '' : current);
  };
  const key = async (action: string) => { await run(action); };
  return <section className="workspace" aria-label="Workspace">
    <div className="workspace-heading"><div><p className="eyebrow">YOUR WORKSPACE</p><h1>{session ? agent ? 'A little closer to your work.' : 'Your terminal, with you.' : 'Start something.'}</h1></div>
      <div role="status"><Badge online={online}>{!online ? 'Reconnecting' : exited ? 'Program exited' : session ? 'Connected' : 'Ready'}</Badge></div>
    </div>
    {!session ? <form className="setup-form panel" onSubmit={async event => { event.preventDefault(); await run('create', { folder: folder.trim(), launcher }); }}>
      <div className="setup-icon"><SquareTerminal aria-hidden="true" /></div><h2>Where shall we begin?</h2><p className="muted">Start a session on your computer. Pick it up here, or on your phone.</p>
      <label htmlFor="launcher">Start with</label><div className="select-wrapper"><select id="launcher" value={launcher} onChange={e => setLauncher(e.target.value)} disabled={disabled}><option value="codex">Codex agent</option><option value="shell">Plain terminal</option></select><ChevronDown aria-hidden="true" /></div>
      <label htmlFor="folder">Working folder on your computer</label><Input id="folder" value={folder} onChange={e => setFolder(e.target.value)} placeholder="Leave empty for your home folder" disabled={disabled} autoComplete="off" aria-describedby="folder-help" />
      <p className="help" id="folder-help">{launcher === 'codex' ? 'Uses Codex installed on your computer, with its existing sign-in and permission settings.' : 'Starts a shell. No agent is launched in this mode.'} The working folder is not a sandbox.</p>
      <Button type="submit" disabled={disabled}>{busy ? <LoaderCircle className="animate-spin" /> : <ArrowUpRight />}Start session</Button>
    </form> : <>
      <div className="session-meta"><span className="folder-path"><FolderOpen aria-hidden="true" />{session.folder}</span><span>{agent ? 'Codex' : 'Plain terminal'}</span></div>
      <div className="activity-panel"><div className="activity-heading"><span><SquareTerminal aria-hidden="true" />Live output</span><Button type="button" variant="ghost" className="latest-button" onClick={() => { following.current = true; output.current?.scrollTo({ top: output.current.scrollHeight }); output.current?.focus({ preventScroll: true }); }}><ArrowDownToLine aria-hidden="true" />Latest</Button></div>
        <pre ref={output} className="terminal-output" tabIndex={0} aria-label="Terminal output" onScroll={() => { const el = output.current!; following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}>{session.output}</pre>
        <div className="activity-footer"><span>Recent output · 100 columns</span><span>{exited ? 'Program exited' : session.program}</span></div>
      </div>
      <div className="primary-controls"><Button type="button" variant="secondary" disabled={disabled || exited} onClick={() => void key('interrupt')}><CircleStop aria-hidden="true" />Interrupt</Button>
        <Button type="button" variant="outline" disabled={disabled || exited} onClick={() => void key('enter')}><CornerDownLeft aria-hidden="true" />Confirm / Enter</Button>
        <Sheet open={tools} onOpenChange={setTools}>
          <SheetTrigger render={<Button type="button" variant="ghost" className="tools-trigger" aria-label="More controls" />}><Keyboard aria-hidden="true" /><span>More controls</span></SheetTrigger>
          <SheetContent side={wide ? 'right' : 'bottom'} className="controls-sheet">
            <SheetHeader><SheetTitle>Session controls</SheetTitle><SheetDescription>Use these keys to answer setup and approval prompts shown in the output. Opening this panel never sends a key.</SheetDescription></SheetHeader>
            <div className="sheet-body"><p className="eyebrow">KEYBOARD</p><div className="key-grid">{([['escape', 'Esc / Back'], ['tab', 'Tab'], ['up', '↑ Up'], ['down', '↓ Down'], ['enter', 'Confirm / Enter']] as const).map(([action, label]) => <Button type="button" key={action} variant="outline" disabled={disabled || exited} onClick={() => void key(action)}>{label}</Button>)}</div>
              <p className="help">Confirm / Enter selects the highlighted choice. Only approve an action you intend to allow. These controls go directly to the current program.</p>
              <div className="end-session"><h3>Finished for now?</h3><p className="help">Closing your phone leaves work running. Ending the session stops its programs.</p>
                <Confirm key={session.id} trigger="End session" title="End this session?" description={`Stop the programs running in ${session.folder}. This cannot be undone.`} action="End session" destructive disabled={disabled} onConfirm={() => run('end', { sessionId: session.id })} />
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
      <p className="help prompt-help">{exited ? 'The program has exited. You can read its output or end this session to start another.' : agent ? 'Answer any setup or approval prompts above before giving Codex a task.' : 'Plain terminal: text goes to a shell. Use Confirm / Enter to execute it.'}</p>
      <form className={`message-composer ${speech.listening ? 'is-listening' : ''}`} onSubmit={event => { event.preventDefault(); void submit(); }}>
        <label htmlFor="message" className="sr-only">{agent ? 'Message Codex' : 'Terminal text'}</label>
        <Textarea id="message" value={draft} onChange={event => setDraft(event.target.value)} disabled={disabled || exited} placeholder={agent ? 'What would you like to work on?' : 'Type text or a command…'} rows={3} maxLength={2000} aria-describedby="input-note" onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); } }} />
        <div className="composer-actions">{speech.listening ? <Button type="button" variant="secondary" onClick={speech.stop}><CircleStop aria-hidden="true" />Stop dictation</Button> : <Confirm trigger={<><Mic aria-hidden="true" />Dictate</>} title="Use browser dictation?" description="Your browser may send microphone audio to its speech provider. Dictation adds text here for review; it will not be sent until you choose Send." action="Start dictation" disabled={disabled || exited || !speech.supported} onConfirm={speech.start} />}
          <span className="composer-hint">{draft.length ? `${draft.length}/2000` : 'Text or voice. Your computer.'}</span>
          <Button type="submit" disabled={disabled || exited || !draft.trim()} aria-label={agent ? 'Send to Codex' : 'Insert text'}>{busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}<span>{agent ? 'Send' : 'Insert text'}</span></Button>
        </div>
      </form>
      <p className="help" id="input-note">{agent ? 'Send submits to Codex. Input is never queued or automatically resent.' : 'Insert text types into the terminal. Confirm / Enter is separate.'}</p>
      <p className="help" role="status">{speech.status || (!speech.supported ? 'Browser dictation unavailable. You can use your keyboard’s microphone.' : '')}</p>
    </>}
    {!online && <p className="offline-message" role="status">Cannot reach your session. Your work may still be running. Reconnecting…</p>}
    <p className="delivery-status" role="status">{delivery}</p><Notice>{error}</Notice>
  </section>;
}

export function App() {
  const [mode, setMode] = useState<'loading' | 'pair' | 'unpaired' | 'connected'>(initialPairingToken ? 'pair' : 'loading');
  const [pairToken, setPairToken] = useState(initialPairingToken);
  const [computer, setComputer] = useState<Computer | null>(null);
  const [online, setOnline] = useState(false);
  const [phoneName, setPhoneName] = useState('My phone');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState<{ qr: string; expiresAt: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const authEpoch = useRef(0);
  const authPolling = useRef<number | null>(null);
  const revoke = useCallback(() => { authEpoch.current++; setOnline(false); setMode('unpaired'); }, []);
  const refresh = useCallback(async () => {
    if (busyRef.current || document.hidden || pairToken || authPolling.current === authEpoch.current) return;
    const version = authEpoch.current; authPolling.current = version;
    try {
      const data = await api<Computer>(desktop ? '/api/admin/status' : '/api/status');
      if (authEpoch.current !== version) return;
      setComputer(data); setOnline(true); setMode('connected');
      if (data.devices?.length) setCode(null);
    } catch (failure) {
      if (authEpoch.current !== version) return;
      setOnline(false);
      if (failure instanceof RequestError && failure.status === 401) { setMode('unpaired'); setComputer(null); }
      else { setMode(current => current === 'loading' ? 'unpaired' : current); }
    } finally { if (authPolling.current === version) authPolling.current = null; }
  }, [pairToken]);
  useEffect(() => {
    void refresh(); const interval = setInterval(refresh, 5000);
    const visible = () => { if (!document.hidden) void refresh(); };
    const offline = () => { authEpoch.current++; setOnline(false); };
    document.addEventListener('visibilitychange', visible); window.addEventListener('online', refresh); window.addEventListener('offline', offline);
    return () => { authEpoch.current++; clearInterval(interval); document.removeEventListener('visibilitychange', visible); window.removeEventListener('online', refresh); window.removeEventListener('offline', offline); };
  }, [refresh]);
  useEffect(() => { if (!code) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [code]);
  const adminAction = async (action: 'pair' | 'revoke') => {
    if (busyRef.current) return false;
    busyRef.current = true; authEpoch.current++; setBusy(true); setError('');
    try {
      if (action === 'pair') { const result = await api<{ qr: string; expiresAt: number }>('/api/admin/pair', {}); setNow(Date.now()); setCode(result); }
      else { await api('/api/admin/revoke', {}); setCode(null); }
      return true;
    } catch (failure) { setError(message(failure, 'The request could not be confirmed. Refresh before trying again.')); return false; }
    finally { busyRef.current = false; setBusy(false); void refresh(); }
  };
  const seconds = code ? Math.max(0, Math.ceil((code.expiresAt - now) / 1000)) : 0;
  return <div className={`app-shell ${desktop ? 'desktop-shell' : 'phone-shell'}`}>
    <header className="brand-header"><a className="brand" href={desktop ? '/desktop' : '/'} aria-label="Hoso home">hoso<span aria-hidden="true">●</span></a><span className="eyebrow">YOUR COMPUTER, WITH YOU</span></header>
    {mode === 'loading' && <div className="loading-state" role="status"><LoaderCircle className="animate-spin" />Connecting to your computer…</div>}
    {mode === 'pair' && <section className="pairing-page"><div className="setup-icon"><Smartphone aria-hidden="true" /></div><p className="eyebrow">ONE SMALL CONNECTION</p><h1>Your computer.<br />Wherever you are.</h1><p className="muted">Connect this phone to continue your work from anywhere.</p><form className="pair-form" onSubmit={async event => {
      event.preventDefault(); if (busyRef.current) return; busyRef.current = true; authEpoch.current++; setBusy(true); setError('');
      try { const result = await api<Computer>('/api/pair', { token: pairToken, name: phoneName }); setComputer(result); setPairToken(null); setOnline(true); setMode('connected'); }
      catch (failure) { setError(message(failure, 'Could not reach your computer. Try again when connected.')); }
      finally { busyRef.current = false; setBusy(false); }
    }}><label htmlFor="phone-name">Give your phone a name</label><Input id="phone-name" required maxLength={80} value={phoneName} onChange={e => setPhoneName(e.target.value)} disabled={busy} /><Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : <ArrowUpRight />}Connect my phone</Button></form><Notice>{error}</Notice></section>}
    {mode === 'unpaired' && <section className="pairing-page"><div className="setup-icon"><Unplug aria-hidden="true" /></div><h1>{desktop ? 'Open your setup link.' : 'Let’s get connected.'}</h1><p className="muted">{desktop ? 'Use the full desktop setup link printed when Hoso starts. It gives this tab access to your computer.' : 'Open Hoso on your computer and scan a fresh connection code with this phone.'}</p><Button type="button" variant="secondary" onClick={() => void refresh()}>Try connection again</Button></section>}
    {mode === 'connected' && <>
      <div className="computer-bar"><div className="computer-avatar"><Monitor aria-hidden="true" /></div><div><strong>{computer?.name}</strong><p>{desktop ? 'This computer' : 'Your private workspace'}</p></div><Badge online={online}>{online ? 'Online' : 'Offline'}</Badge></div>
      <div className="workspace-layout"><Workspace onRevoked={revoke} />
        {desktop && <aside className="phone-setup panel" aria-label="Phone connection"><div className="aside-heading"><Smartphone aria-hidden="true" /><span className="eyebrow">TAKE IT WITH YOU</span></div><h2>{computer?.devices?.length ? 'Your phone is connected.' : 'Connect your phone.'}</h2><p className="muted">The same session, wherever you are. Scan a code to pick up work on your phone.</p>
          {computer?.devices?.length ? <><div className="device-row"><Check aria-hidden="true" /><span>{computer.devices[0].name}</span></div><Confirm trigger="Remove phone access" title="Remove this phone’s access?" description="The phone will no longer be able to read output or send input. Work on your computer will keep running." action="Remove access" destructive disabled={busy || !online} onConfirm={() => adminAction('revoke')} /></> : <>
            {code && seconds > 0 && <div className="qr-code"><img src={code.qr} width="260" height="260" alt="Scan to connect your phone" /><p className="help" role="status">Code expires in {seconds} seconds.</p></div>}
            {code && !seconds && <p className="help" role="status">Code expired. Create a new one.</p>}
            <Button type="button" disabled={busy || !online} onClick={() => void adminAction('pair')}>{busy ? <LoaderCircle className="animate-spin" /> : <ArrowUpRight />}Create connection code</Button>
          </>}
          {computer?.publicOrigin?.startsWith('http:') && <p className="help">This code opens on this computer only. Configure your private HTTPS address to connect a phone.</p>}
          <Notice>{error}</Notice><div className="privacy-note"><ShieldCheck aria-hidden="true" />A private connection to your computer.</div>
        </aside>}
      </div>
    </>}
    <footer>Made for a little more freedom.<span>Your work stays on your computer.</span></footer>
  </div>;
}
