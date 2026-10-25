import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, realpath, stat, rm, access } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join, isAbsolute, delimiter, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';

const exec = promisify(execFile);
export class SessionError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
const keys: Record<string, string> = { enter: 'Enter', interrupt: 'C-c', escape: 'Escape', tab: 'Tab', up: 'Up', down: 'Down' };
type Session = { id: string; folder: string; startedAt: string; launcher: 'shell' | 'codex' };

// A private tmux server: never discover, attach to, or kill the user's existing sessions.
export class Sessions {
  private directory?: string;
  private session?: Session;
  private queue = Promise.resolve();
  private receipts = new Map<string, string>();
  private async tmux(...args: string[]) {
    if (!this.directory) throw new SessionError('Start a session first.', 409);
    try {
      return (await exec('tmux', ['-S', join(this.directory, 'socket'), '-f', '/dev/null', ...args], { timeout: 4000, maxBuffer: 2 * 1024 * 1024 })).stdout;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new SessionError('Install tmux on your computer to enable sessions.', 503);
      throw new SessionError('The session could not be reached. Refresh before trying again.', 503);
    }
  }
  async exclusive<T>(action: () => Promise<T>): Promise<T> {
    const result = this.queue.then(action);
    this.queue = result.then(() => {}, () => {});
    return result;
  }
  async snapshot() {
    if (!this.session) return { session: null };
    const target = `=${this.session.id}:0.0`;
    const info = (await this.tmux('display-message', '-p', '-t', target, '#{pane_dead}\t#{pane_current_command}')).trim().split('\t');
    const output = await this.tmux('capture-pane', '-p', '-J', '-S', '-1000', '-t', target);
    return { session: { ...this.session, state: info[0] === '1' ? 'exited' : 'running', program: info[1], output: output.slice(-150_000), retention: 'Most recent 1,000 lines; earlier output may be unavailable.' } };
  }
  async create(folder: unknown, launcher: unknown = 'shell') {
    if (this.session) throw new SessionError('End the current session before starting another.', 409);
    if (typeof folder !== 'string' || folder.length > 4096 || (folder && !isAbsolute(folder))) throw new SessionError('Enter an absolute folder path, or leave it empty for your home folder.');
    let path: string;
    try { path = await realpath(folder || homedir()); if (!(await stat(path)).isDirectory()) throw Error(); }
    catch { throw new SessionError('That folder is not available on your computer.'); }
    if (launcher !== 'shell' && launcher !== 'codex') throw new SessionError('Choose Codex or Plain terminal.');
    const command: string[] = [];
    if (launcher === 'codex') {
      let executable: string | undefined;
      for (const entry of (process.env.PATH ?? '').split(delimiter)) {
        const candidate = resolve(entry, 'codex');
        try { await access(candidate, constants.X_OK); if ((await stat(candidate)).isFile()) { executable = candidate; break; } } catch { /* Try the next PATH entry. */ }
      }
      if (!executable) throw new SessionError('Codex is not installed or is not on Hoso’s PATH. Install and sign in to Codex on your computer, then restart Hoso.', 503);
      command.push(executable, '--no-alt-screen');
    }
    this.directory ??= await mkdtemp(join(tmpdir(), 'hoso-'));
    const id = `hoso-${randomUUID()}`;
    // Keep the exited pane so the final output remains readable.
    await this.tmux('new-session', '-d', '-s', id, '-c', path, '-x', '100', '-y', '32', ...command, ';', 'set-option', '-w', '-t', `=${id}:0`, 'remain-on-exit', 'on', ';', 'set-option', '-w', '-t', `=${id}:0`, 'history-limit', '1000');
    this.session = { id, folder: path, startedAt: new Date().toISOString(), launcher };
    this.receipts.clear();
    return this.snapshot();
  }
  async action(body: Record<string, unknown>) {
    if (!this.session || body.sessionId !== this.session.id) throw new SessionError('This session changed. Refresh before sending input.', 409);
    if (typeof body.requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(body.requestId)) throw new SessionError('A unique input identifier is required.');
    const signature = JSON.stringify([body.sessionId, body.action, body.text]);
    if (this.receipts.has(body.requestId)) {
      if (this.receipts.get(body.requestId) !== signature) throw new SessionError('This input identifier has already been used.', 409);
      return { ok: true, duplicate: true };
    }
    if (this.receipts.size >= 10000) throw new SessionError('This session reached its input limit. Start a new session.', 409);
    const target = `=${this.session.id}:0.0`;
    if (body.action === 'text' || body.action === 'submit') {
      // Text cannot contain terminal control characters or implicit Enter presses.
      if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 2000 || /[\x00-\x1f\x7f-\x9f]/.test(body.text)) throw new SessionError('Send one line of up to 2,000 characters. Use Enter separately.');
    } else if (body.action !== 'end' && !(typeof body.action === 'string' && Object.hasOwn(keys, body.action))) throw new SessionError('That control is not available.');
    if (body.action === 'submit' && this.session.launcher !== 'codex') throw new SessionError('Use Insert text and Enter separately in a plain terminal.');
    const dead = (await this.tmux('display-message', '-p', '-t', target, '#{pane_dead}')).trim() === '1';
    if (dead && body.action !== 'end') throw new SessionError('The program has exited. End this session and start a new one.', 409);
    // Record before attempting delivery. An uncertain operation must never be replayed.
    this.receipts.set(body.requestId, signature);
    if (body.action === 'end') {
      await this.tmux('kill-session', '-t', `=${this.session.id}`);
      this.session = undefined;
    } else if (body.action === 'text' || body.action === 'submit') {
      await this.tmux('send-keys', '-t', target, '-H', ...Array.from(Buffer.from(body.text as string), byte => byte.toString(16).padStart(2, '0')));
      if (body.action === 'submit') {
        // Codex treats Enter arriving inside a paste burst as a newline. Let the
        // burst settle before submitting; retain the session lock throughout.
        await new Promise(resolve => setTimeout(resolve, 300));
        await this.tmux('send-keys', '-t', target, 'Enter');
      }
    } else {
      await this.tmux('send-keys', '-t', target, keys[body.action as string]);
    }
    return { ok: true };
  }
  async close() {
    await this.exclusive(async () => {
      if (!this.directory) return;
      try { await this.tmux('kill-server'); } catch { /* It may already have exited. */ }
      await rm(this.directory, { recursive: true, force: true });
      this.directory = undefined; this.session = undefined;
    });
  }
}
