import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Sessions } from '../src/sessions.ts';
import { join, delimiter } from 'node:path';
import { CodexAgent } from '../src/codex-agent.ts';

async function until(check: () => boolean) {
  for (let i = 0; i < 100; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 20)); }
  assert.fail('Expected Codex event did not arrive');
}
test('structured agent scopes steering and approvals, streams output, and clears stale requests', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'hoso-protocol-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const executable = join(directory, 'codex');
  await writeFile(executable, `#!/usr/bin/env node
import { createInterface } from 'node:readline';
const send = value => process.stdout.write(JSON.stringify(value) + '\\n');
const event = (method, params) => send({ method, params: { threadId: 'thread-1', ...params } });
let initialized = false;
createInterface({input:process.stdin}).on('line', line => {
  const m = JSON.parse(line);
  if (m.method === 'initialize') { initialized = true; send({id:m.id,result:{}}); }
  else if (m.method === 'initialized') {}
  else if (m.method === 'thread/start') {
    if (!initialized || m.params.cwd !== ${JSON.stringify(directory)} || m.params.approvalPolicy || m.params.sandbox) process.exit(2);
    send({id:m.id,result:{thread:{id:'thread-1'}}});
  } else if (m.method === 'turn/start') {
    event('turn/started',{turn:{id:'turn-1'}});
    if (m.params.input[0].text === 'fast') {
      event('turn/completed',{turn:{id:'turn-1',status:'completed'}});
      send({id:m.id,result:{turn:{id:'turn-1',status:'inProgress'}}}); return;
    }

    event('item/started',{item:{id:'cmd',type:'commandExecution',command:'echo example',cwd:${JSON.stringify(directory)}}});
    send({id:77,method:'item/commandExecution/requestApproval',params:{threadId:'thread-1',turnId:'turn-1',itemId:'cmd',command:'echo example'}});
    send({id:m.id,result:{turn:{id:'turn-1',status:'inProgress'}}});
  } else if (m.id === 77 && m.result) {
    event('item/agentMessage/delta',{delta:'decision:' + m.result.decision});
    event('serverRequest/resolved',{requestId:77});
  } else if (m.method === 'turn/steer') {
    event('item/agentMessage/delta',{delta:'steered:' + m.params.input[0].text});
    send({id:m.id,result:{turnId:'turn-1'}});
  } else if (m.method === 'turn/interrupt') {
    event('turn/completed',{turn:{id:'turn-1',status:'interrupted'}});
    send({id:m.id,result:{}});
  }
});
`, { mode: 0o700 });
  const agent = await CodexAgent.create(executable, directory); t.after(() => agent.close());
  assert.equal(agent.snapshot().agent.activity, 'Ready');
  await agent.action({ action: 'submit', text: 'hello' });
  await until(() => agent.snapshot().agent.approvals.length === 1);
  const approval = agent.snapshot().agent.approvals[0];
  assert.match(approval.details, /echo example/);
  assert.equal(agent.snapshot().agent.turnId, 'turn-1');
  await assert.rejects(agent.action({ action: 'steer', turnId: 'stale', text: 'wrong' }), /turn changed/);
  await assert.rejects(agent.action({ action: 'submit', text: 'second task' }), /working/);
  await assert.rejects(agent.action({ action: 'approval', approvalId: approval.id, decision: 'acceptForSession' }), /Approve once/);
  await agent.action({ action: 'approval', approvalId: approval.id, decision: 'decline' });
  await until(() => agent.snapshot().output.includes('decision:decline'));
  await assert.rejects(agent.action({ action: 'approval', approvalId: approval.id, decision: 'accept' }), /no longer pending/);
  await agent.action({ action: 'steer', turnId: 'turn-1', text: 'change direction' });
  await until(() => agent.snapshot().output.includes('steered:change direction'));
  await agent.action({ action: 'interrupt', turnId: 'turn-1' });
  assert.equal(agent.snapshot().agent.turnId, null);
  assert.equal(agent.snapshot().agent.activity, 'Interrupted');
  assert.deepEqual(agent.snapshot().agent.approvals, []);
  await agent.action({ action: 'submit', text: 'again' });
  await until(() => agent.snapshot().agent.approvals.length === 1);
  await agent.action({ action: 'approval', approvalId: agent.snapshot().agent.approvals[0].id, decision: 'accept' });
  await until(() => agent.snapshot().output.includes('decision:accept'));
  await agent.action({ action: 'interrupt', turnId: 'turn-1' });
  await agent.action({ action: 'submit', text: 'fast' });
  assert.equal(agent.snapshot().agent.turnId, null);
  assert.equal(agent.snapshot().agent.activity, 'Ready');

  agent.close();
  assert.equal(agent.snapshot().state, 'exited');
  // Exercise the same session interface used by authenticated HTTP handlers.
  const previousPath = process.env.PATH;
  process.env.PATH = directory + delimiter + previousPath;
  const sessions = new Sessions();
  t.after(async () => { await sessions.close(); process.env.PATH = previousPath; });
  const created = await sessions.create(directory, 'codex-agent');
  const sessionId = created.session!.id;
  const body = { sessionId, requestId: 'structured-input-00000001', action: 'submit', text: 'one task' };
  await sessions.exclusive(() => sessions.action(body));
  assert.deepEqual(await sessions.exclusive(() => sessions.action(body)), { ok: true, duplicate: true });
  const first = (await sessions.snapshot()).session!;
  assert.equal(first.id, sessionId);
  assert.equal('agent' in first && first.agent.turnId, 'turn-1');
  const approvals = 'agent' in first ? first.agent.approvals : [];
  assert.equal(approvals.length, 1);
  assert.deepEqual((await sessions.snapshot()).session, first);
  await assert.rejects(sessions.action({ ...body, text: 'different task' }), /already been used/);
  await assert.rejects(sessions.action({ ...body, requestId: 'structured-input-00000002', sessionId: 'stale' }), /session changed/);
  await sessions.action({ sessionId, requestId: 'structured-input-00000003', action: 'end' });
  assert.deepEqual(await sessions.snapshot(), { session: null });

});
