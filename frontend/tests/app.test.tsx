import { StrictMode } from 'react';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

const fixture = { id: 'session-one', folder: '/work/example', startedAt: '2026-10-27', launcher: 'codex', state: 'running', program: 'codex', output: 'Private terminal output', retention: 'Recent output' };
async function boot({ phone = false, pair = false, failure = false } = {}) {
  vi.resetModules();
  history.replaceState(null, '', phone ? pair ? '/#pair=fixture-pair-token' : '/' : '/desktop#admin=fixture-admin-token');
  let session: typeof fixture | null = { ...fixture };
  let authorized = !pair;
  let failInput = failure;
  let delayed: Promise<Response> | null = null;
  let pendingInput: Promise<Response> | null = null;
  let pendingStatus: Promise<Response> | null = null;
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const fetchMock = vi.fn(async (path: string, init: RequestInit) => {
    if (init.method === 'POST') {
      const body = JSON.parse(init.body as string); posts.push({ path, body });
      if (path === '/api/pair') { authorized = true; return response({ name: 'Home Computer' }); }
      if (failInput) throw new TypeError('Network disconnected');
      if (pendingInput) { const pending = pendingInput; pendingInput = null; return pending; }
      if (body.action === 'end') session = null;
      if (body.action === 'create') session = { ...fixture };
      return response({ ok: true });
    }
    if (path.endsWith('/status') && pendingStatus) { const pending = pendingStatus; pendingStatus = null; return pending; }
    if (path.endsWith('/status')) return authorized ? response({ name: 'Home Computer', devices: [], publicOrigin: 'https://computer.example' }) : response({ error: 'Pair first' }, 401);
    if (delayed) { const pending = delayed; delayed = null; return pending; }
    return authorized ? response({ session }) : response({ error: 'Pair first' }, 401);
  });
  vi.stubGlobal('fetch', fetchMock);
  const { App } = await import('../src/app');
  render(<StrictMode><App /></StrictMode>);
  return { posts, fetchMock, setAuthorized: (value: boolean) => { authorized = value; }, setSession: (value: typeof fixture) => { session = value; }, setStatusDelay: (value: Promise<Response>) => { pendingStatus = value; }, setInputDelay: (value: Promise<Response>) => { pendingInput = value; }, setDelay: (value: Promise<Response>) => { delayed = value; }, setFailure: (value: boolean) => { failInput = value; }, response };
}

describe('shared frontend workflows', () => {
  it('consumes a QR fragment once under StrictMode and pairs without effect-driven POSTs', async () => {
    const app = await boot({ phone: true, pair: true }); const user = userEvent.setup();
    expect(location.hash).toBe('');
    expect(app.posts).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Connect my phone' }));
    await screen.findByText('Private terminal output');
    expect(app.posts.filter(call => call.path === '/api/pair')).toEqual([{ path: '/api/pair', body: { token: 'fixture-pair-token', name: 'My phone' } }]);
    for (const [, init] of app.fetchMock.mock.calls) expect(init.headers).not.toHaveProperty('Authorization');
  });
  it('preserves uncertain input and never automatically resends it', async () => {
    const app = await boot({ failure: true }); const user = userEvent.setup();
    await screen.findByText('Private terminal output');
    const composer = screen.getByRole('textbox', { name: 'Message Codex' });
    await user.type(composer, 'Please check my work');
    await user.click(screen.getByRole('button', { name: 'Send to Codex' }));
    await screen.findByText(/Delivery could not be confirmed/);
    expect(composer).toHaveValue('Please check my work');
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send to Codex' })).toBeEnabled());
    expect(app.posts).toHaveLength(1);
    expect(app.posts[0].body).toMatchObject({ action: 'submit', text: 'Please check my work', sessionId: 'session-one' });
  });
  it('keeps modal keys local and requires explicit confirmation before ending a session', async () => {
    const app = await boot(); const user = userEvent.setup();
    await screen.findByText('Private terminal output');
    expect(location.hash).toBe(''); expect(sessionStorage.getItem('relay_admin')).toBe('fixture-admin-token');
    await user.click(screen.getByRole('button', { name: 'More controls' }));
    const sheet = await screen.findByRole('dialog', { name: 'Session controls' });
    expect(app.posts).toHaveLength(0);
    await user.click(within(sheet).getByRole('button', { name: '↓ Down' }));
    await waitFor(() => expect(within(sheet).getByRole('button', { name: 'Confirm / Enter' })).toBeEnabled());
    await user.click(within(sheet).getByRole('button', { name: 'Confirm / Enter' }));
    await waitFor(() => expect(app.posts.map(call => call.body.action)).toEqual(['down', 'enter']));
    await waitFor(() => expect(within(sheet).getByRole('button', { name: 'End session' })).toBeEnabled());
    await user.click(within(sheet).getByRole('button', { name: 'End session' }));
    let dialog = await screen.findByRole('alertdialog', { name: 'End this session?' });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus());
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(app.posts.map(call => call.body.action)).toEqual(['down', 'enter']);
    await user.click(within(sheet).getByRole('button', { name: 'End session' }));
    dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'End session' }));
    await waitFor(() => expect(app.posts.map(call => call.body.action)).toEqual(['down', 'enter', 'end']));
    await screen.findByRole('button', { name: 'Start session' });
  });
  it('does not restore revoked terminal output from a late poll response', async () => {
    const app = await boot(); await screen.findByText('Private terminal output');
    let resolve!: (response: Response) => void;
    app.setDelay(new Promise(done => { resolve = done; }));
    await act(async () => { window.dispatchEvent(new Event('online')); });
    app.setAuthorized(false);
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await screen.findByRole('heading', { name: 'Open your setup link.' });
    await act(async () => { resolve(app.response({ session: { ...fixture } })); });
    expect(screen.queryByText('Private terminal output')).not.toBeInTheDocument();
  });
  it('preserves a draft on refresh but clears it when the session changes', async () => {
    const app = await boot(); const user = userEvent.setup(); await screen.findByText('Private terminal output');
    const composer = screen.getByRole('textbox', { name: 'Message Codex' });
    await user.type(composer, 'draft for this workspace');
    await act(async () => { window.dispatchEvent(new Event('online')); });
    expect(composer).toHaveValue('draft for this workspace');
    app.setSession({ ...fixture, id: 'session-two', folder: '/work/new-project' });
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await screen.findByText('/work/new-project');
    expect(composer).toHaveValue('');
  });
});

it('uses a bottom controls sheet on a narrow phone and Escape does not send a terminal key', async () => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  try {
    const app = await boot({ phone: true }); const user = userEvent.setup(); await screen.findByText('Private terminal output');
    await user.click(screen.getByRole('button', { name: 'More controls' }));
    const sheet = await screen.findByRole('dialog', { name: 'Session controls' });
    expect(sheet).toHaveAttribute('data-side', 'bottom');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(app.posts).toHaveLength(0);
  } finally { Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 }); }
});

it('reviews dictated text before sending and ends the listening status', async () => {
  type SpeechEvent = { resultIndex: number; results: { length: number; [key: number]: { isFinal: boolean; [key: number]: { transcript: string } } } };
  let recognition!: FakeRecognition;
  class FakeRecognition {
    lang = ''; interimResults = false;
    onresult: ((event: SpeechEvent) => void) | null = null; onerror: (() => void) | null = null; onend: (() => void) | null = null;
    start() { recognition = this; } stop() { this.onend?.(); } abort() {}
  }
  vi.stubGlobal('SpeechRecognition', FakeRecognition);
  const app = await boot({ phone: true }); const user = userEvent.setup(); await screen.findByText('Private terminal output');
  await user.click(screen.getByRole('button', { name: 'Dictate' }));
  const consent = await screen.findByRole('alertdialog', { name: 'Use browser dictation?' });
  await user.click(within(consent).getByRole('button', { name: 'Start dictation' }));
  await screen.findByRole('button', { name: 'Stop dictation' });
  await act(async () => { recognition.onresult?.({ resultIndex: 0, results: { length: 1, 0: { isFinal: true, 0: { transcript: 'Please review this file' } } } }); });
  expect(screen.getByRole('textbox', { name: 'Message Codex' })).toHaveValue('Please review this file');
  expect(app.posts).toHaveLength(0);
  await user.click(screen.getByRole('button', { name: 'Stop dictation' }));
  await screen.findByText('Dictation finished. Review your text before sending.');
  await user.click(screen.getByRole('button', { name: 'Send to Codex' }));
  await waitFor(() => expect(app.posts).toHaveLength(1));
  expect(app.posts[0].body).toMatchObject({ action: 'submit', text: 'Please review this file' });
});


it('warns about uncertain delivery if the phone goes offline during a pending send', async () => {
  const app = await boot({ phone: true }); const user = userEvent.setup(); await screen.findByText('Private terminal output');
  let resolve!: (response: Response) => void;
  app.setInputDelay(new Promise(done => { resolve = done; }));
  const composer = screen.getByRole('textbox', { name: 'Message Codex' });
  await user.type(composer, 'This might already be delivered');
  await user.click(screen.getByRole('button', { name: 'Send to Codex' }));
  await act(async () => { window.dispatchEvent(new Event('offline')); });
  await screen.findByText(/Delivery could not be confirmed/);
  await act(async () => { resolve(app.response({ ok: true })); });
  await act(async () => { window.dispatchEvent(new Event('online')); });
  expect(composer).toHaveValue('This might already be delivered');
  expect(screen.getByText(/Delivery could not be confirmed/)).toBeInTheDocument();
  expect(app.posts).toHaveLength(1);
});


it('does not replace a slow status check with overlapping interval requests', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  try {
    const app = await boot({ phone: true }); await screen.findByText('Private terminal output');
    let resolve!: (response: Response) => void;
    app.setStatusDelay(new Promise(done => { resolve = done; }));
    const before = app.fetchMock.mock.calls.filter(([path]) => path === '/api/status').length;
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(app.fetchMock.mock.calls.filter(([path]) => path === '/api/status')).toHaveLength(before + 1);
    await act(async () => { resolve(app.response({ name: 'Slow Home Computer' })); });
    await screen.findByText('Slow Home Computer');
  } finally { vi.useRealTimers(); }
});
