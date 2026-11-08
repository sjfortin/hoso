import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { SessionError } from './session-error.ts';

type Pending = { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout };
type Approval = { id: string; turnId: string; title: string; details: string; canApprove: boolean };

// Own one isolated app-server process. Protocol state never comes from output text.
export class CodexAgent {
  private child: ChildProcessWithoutNullStreams;
  private pending = new Map<number, Pending>();
  private approvals = new Map<string, { wireId: string | number; view: Approval }>();
  private items = new Map<string, unknown>();
  private sequence = 0;
  private threadId = '';
  private turnId: string | null = null;
  private stopped = false;
  private output = '';
  private buffer = '';
  private cwd: string;
  private completedTurnId: string | null = null;
  private activity = 'Ready';
  constructor(executable: string, cwd: string) {
    this.cwd = cwd;
    this.child = spawn(executable, ['app-server', '--listen', 'stdio://'], { cwd, detached: true, stdio: 'pipe' });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => {
      this.buffer += chunk;
      if (this.buffer.length > 2 * 1024 * 1024) { this.fail('Codex sent an oversized protocol message.'); return; }
      let newline: number;
      while ((newline = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, newline); this.buffer = this.buffer.slice(newline + 1);
        if (!line.trim()) continue;
        try { this.receive(JSON.parse(line)); } catch { this.fail('Codex sent an invalid protocol message.'); return; }
      }
    });
    // Drain diagnostics without exposing local configuration or credentials to clients.
    this.child.stderr.on('data', () => {});
    this.child.stdin.on('error', () => this.fail('Codex connection closed.'));
    this.child.on('error', () => this.fail('Codex could not start.'));
    this.child.on('exit', () => this.fail('Codex process exited.'));
  }
  private append(text: string) { this.output = (this.output + text).slice(-150_000); }
  private write(value: unknown) {
    if (this.stopped) throw new SessionError('Codex is no longer connected. End this session and start another.', 409);
    this.child.stdin.write(JSON.stringify(value) + '\n');
  }
  private request(method: string, params: unknown): Promise<any> {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.fail('Codex did not confirm the request. The session was stopped to prevent uncertain state.');
        reject(new SessionError('Codex did not confirm the request. Start a new session.', 503));
      }, 5000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.write({ id, method, params }); } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  async start() {
    await this.request('initialize', { clientInfo: { name: 'hoso', title: 'Hoso', version: '0.1.0' } });
    this.write({ method: 'initialized', params: {} });
    // Inherit installed Codex authentication, model, sandbox and approval settings.
    const result = await this.request('thread/start', { cwd: this.cwd });
    this.threadId = result.thread.id;
  }
  static async create(executable: string, cwd: string) {
    const agent = new CodexAgent(executable, cwd);
    try { await agent.start(); return agent; } catch (error) { agent.close(); throw error; }
  }
  snapshot() {
    return { state: this.stopped ? 'exited' : 'running', program: 'Codex app-server', output: this.output,
      retention: 'Most recent 150,000 characters; earlier activity may be unavailable.',
      agent: { activity: this.approvals.size ? 'Awaiting approval' : this.activity, turnId: this.turnId, approvals: [...this.approvals.values()].map(entry => entry.view) } };
  }
  async action(body: Record<string, unknown>) {
    if (this.stopped) throw new SessionError('Codex has exited. End this session and start another.', 409);
    if (body.action === 'submit') {
      if (this.turnId) throw new SessionError('Codex is working. Use Steer work or Interrupt.', 409);
      this.activity = 'Starting';
      try {
        const result = await this.request('turn/start', { threadId: this.threadId, input: [{ type: 'text', text: body.text, text_elements: [] }] });
        // turn/started is authoritative; do not resurrect a turn already completed.
        if (result.turn.status === 'inProgress' && this.completedTurnId !== result.turn.id) { this.turnId = result.turn.id; this.activity = 'Working'; }
      } catch (error) { if (!this.stopped) this.activity = 'Ready'; throw error; }
    } else if (body.action === 'steer' || body.action === 'interrupt') {
      if (!this.turnId || body.turnId !== this.turnId) throw new SessionError('The active turn changed. Refresh before trying again.', 409);
      if (body.action === 'steer') {
        await this.request('turn/steer', { threadId: this.threadId, expectedTurnId: this.turnId, input: [{ type: 'text', text: body.text, text_elements: [] }] });
        this.append(`\nYou (steering): ${body.text}\n`);
      } else await this.request('turn/interrupt', { threadId: this.threadId, turnId: this.turnId });
    } else if (body.action === 'approval') {
      const entry = this.approvals.get(String(body.approvalId));
      if (!entry || entry.view.turnId !== this.turnId) throw new SessionError('That approval is no longer pending. Refresh.', 409);
      if (body.decision !== 'accept' && body.decision !== 'decline') throw new SessionError('Choose Approve once or Decline.');
      if (body.decision === 'accept' && !entry.view.canApprove) throw new SessionError('This approval cannot be safely displayed. Decline it and use terminal mode.');
      this.write({ id: entry.wireId, result: { decision: body.decision } });
      this.approvals.delete(entry.view.id);
    } else throw new SessionError('Use the agent controls for this session.');
  }
  private receive(message: any) {
    if (!message.method && typeof message.id === 'number') {
      const request = this.pending.get(message.id); if (!request) return;
      clearTimeout(request.timer); this.pending.delete(message.id);
      if (message.error) request.reject(new SessionError(String(message.error.message ?? 'Codex rejected the request.').slice(0, 2000), 409));
      else request.resolve(message.result);
      return;
    }
    const p = message.params ?? {};
    if (p.threadId && p.threadId !== this.threadId) return;
    if (message.id !== undefined) {
      if (['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(message.method) && p.turnId === this.turnId) {
        if (this.approvals.size >= 100) { this.fail('Codex exceeded the pending approval limit.'); return; }
        const id = randomUUID();
        const proposedItem = this.items.get(p.itemId) as any;
        const fileChange = message.method === 'item/fileChange/requestApproval';
        const details = [
          p.command ? `Command: ${p.command}` : '',
          p.cwd ? `Folder: ${p.cwd}` : '',
          p.reason ? `Reason: ${p.reason}` : '',
          p.networkApprovalContext ? `Network access: ${JSON.stringify(p.networkApprovalContext, null, 2)}` : '',
          p.additionalPermissions ? `Additional permissions: ${JSON.stringify(p.additionalPermissions, null, 2)}` : '',
          p.grantRoot ? `Requested write access: ${p.grantRoot}` : '',
          fileChange && proposedItem ? `Proposed changes:\n${JSON.stringify(proposedItem.changes, null, 2)}` : '',
        ].filter(Boolean).join('\n\n') || 'No action details supplied by Codex.';
        const canApprove = details.length <= 50_000 && (fileChange || !!p.command || !!p.networkApprovalContext) && (message.method !== 'item/fileChange/requestApproval' || this.items.has(p.itemId)) && (!p.availableDecisions || p.availableDecisions.includes('accept'));
        this.approvals.set(id, { wireId: message.id, view: { id, turnId: p.turnId, title: fileChange ? 'Review file changes' : p.networkApprovalContext ? 'Review network access' : 'Review command', details: details.slice(0, 50_000), canApprove } });
      } else {
        this.write({ id: message.id, error: { code: -32601, message: 'Hoso does not support this request. Use terminal mode.' } });
        this.append(`\nUnsupported Codex request: ${message.method}. Interrupt and use terminal mode if needed.\n`);
      }
      return;
    }
    if (message.method === 'turn/started') { this.turnId = p.turn.id; this.activity = 'Working'; }
    if (message.method === 'turn/completed' && p.turn.id === this.turnId) {
      this.completedTurnId = p.turn.id; this.turnId = null; this.approvals.clear(); this.items.clear();
      this.activity = p.turn.status === 'completed' ? 'Ready' : p.turn.status === 'interrupted' ? 'Interrupted' : 'Failed';
      if (p.turn.error) this.append(`\nCodex: ${p.turn.error.message}\n`);
    }
    if (message.method === 'serverRequest/resolved') {
      for (const [id, entry] of this.approvals) if (entry.wireId === p.requestId) this.approvals.delete(id);
    }
    if (message.method === 'item/started') {
      const item = p.item;
      if (['commandExecution', 'fileChange'].includes(item.type)) {
        if (this.items.size < 100 && JSON.stringify(item).length <= 50_000) this.items.set(item.id, item);
        this.append(`\n${item.type === 'commandExecution' ? item.command : JSON.stringify(item.changes)}\n`);
      }
      if (item.type === 'userMessage') this.append(`\nYou: ${(item.content ?? []).filter((input: any) => input.type === 'text').map((input: any) => input.text).join('\n')}\n`);
      if (item.type === 'agentMessage') this.append('\nCodex: ');
    }
    if (message.method === 'item/completed') this.items.delete(p.item.id);
    if (['item/agentMessage/delta', 'item/commandExecution/outputDelta'].includes(message.method)) this.append(p.delta ?? '');
    if (message.method === 'error') this.append(`\nCodex: ${p.error?.message ?? 'An error occurred.'}\n`);
  }
  private fail(reason: string) {
    if (this.stopped) return;
    this.stopped = true; this.activity = 'Disconnected'; this.turnId = null; this.approvals.clear();
    this.append(`\n${reason}\n`);
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new SessionError(reason, 503)); }
    this.pending.clear(); this.terminate();
  }
  private terminate() {
    const pid = this.child.pid; if (!pid) return;
    try { process.kill(-pid, 'SIGTERM'); } catch { /* Already gone. */ }
    setTimeout(() => { try { process.kill(-pid, 'SIGKILL'); } catch { /* Already gone. */ } }, 1000).unref();
  }
  close() { this.fail('Session ended.'); }
}
