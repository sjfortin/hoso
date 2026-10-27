(() => {
  const el = id => document.getElementById(id);
  const desktop = location.pathname === '/desktop';
  const endpoint = desktop ? '/api/admin/session' : '/api/session';
  let session = null, busy = false, online = false, polling = false, recognizing = false, connectionError = false;
  const controls = () => {
    for (const button of el('session-panel').querySelectorAll('button')) button.disabled = busy || !online || recognizing;
    el('session-text').disabled = busy || !online || recognizing;
    if (recognizing) el('session-dictate').disabled = false;
    if (!Recognition) el('session-dictate').disabled = true;
    if (session?.state === 'exited') {
      el('session-insert').disabled = true;
      for (const button of el('session-keys').querySelectorAll('button[data-key]')) if (button.dataset.key !== 'end') button.disabled = true;
    }
  };
  async function request(body) {
    const response = await fetch(endpoint, {
      method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(8000),
      headers: { ...(desktop ? { Authorization: `Bearer ${sessionStorage.getItem('relay_admin') ?? ''}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json();
    if (!response.ok) { const error = new Error(data.error); error.status = response.status; throw error; }
    return data;
  }
  function render(data) {
    if (connectionError) { el('session-error').textContent = ''; connectionError = false; }
    session = data.session;
    el('session-panel').hidden = false;
    el('session-create').hidden = !!session;
    el('session-work').hidden = !session;
    el('session-title').textContent = session ? 'Your session.' : 'Start something.';
    el('session-state').textContent = session ? (session.state === 'exited' ? 'Program exited' : `Connected · ${session.program}`) : 'Ready';
    if (session) {
      el('session-folder-label').textContent = session.folder;
      const agent = session.launcher === 'codex';
      el('session-mode-note').textContent = agent ? 'Codex is open in this folder. Answer setup or approval prompts with the controls below.' : 'Plain terminal: no agent is started. Text goes to a shell.';
      el('session-insert').textContent = agent ? 'Send to Codex' : 'Insert text';
      el('session-input-note').textContent = agent ? 'Send types your message and presses Enter. It goes directly to Codex; check its prompt before sending. Nothing is queued or automatically resent.' : 'Insert text types into the shell. Press Enter separately to execute. Input is never automatically resent.';
      const output = el('session-output');
      const atBottom = output.scrollHeight - output.scrollTop - output.clientHeight < 40;
      if (output.textContent !== session.output) { output.textContent = session.output; if (atBottom) output.scrollTop = output.scrollHeight; }
    } else el('session-output').textContent = '';
    controls();
  }
  async function refresh() {
    if (polling || busy || document.hidden) return;
    polling = true;
    try { const data = await request(); online = true; render(data); }
    catch (error) {
      online = false;
      if (error.status === 401) { el('session-panel').hidden = true; el('session-output').textContent = ''; session = null; }
      else { connectionError = true; el('session-state').textContent = 'Disconnected'; el('session-error').textContent = 'Cannot reach this session. Your work may still be running. Reconnecting…'; }
      controls();
    } finally { polling = false; }
  }
  async function mutate(body) {
    if (busy || !online || recognizing) return false;
    busy = true; controls(); el('session-error').textContent = ''; el('session-delivery').textContent = 'Sending…';
    try {
      await request(body);
      el('session-delivery').textContent = body.action === 'create' ? 'Session started.' : body.action === 'end' ? 'Session ended.' : body.action === 'submit' ? 'Message sent to Codex. Watch the output for its response.' : body.action === 'interrupt' ? 'Interrupt sent. Check the output before sending a follow-up.' : 'Input sent.';
      return true;
    }
    catch (error) {
      el('session-delivery').textContent = '';
      el('session-error').textContent = error.status ? error.message : 'Delivery could not be confirmed. Check the output before sending anything else. Hoso will not resend it.';
      return false;
    } finally { busy = false; controls(); void refresh(); }
  }
  el('session-create').addEventListener('submit', async event => {
    event.preventDefault(); await mutate({ action: 'create', folder: el('session-folder').value.trim(), launcher: el('session-launcher').value });
  });
  el('session-input').addEventListener('submit', async event => {
    event.preventDefault(); if (!session) return;
    const text = el('session-text').value;
    if (!text.trim()) return;
    if (/[\x00-\x1f\x7f-\x9f]/.test(text)) { el('session-error').textContent = 'Insert one line at a time. Use Enter separately.'; return; }
    if (await mutate({ action: session.launcher === 'codex' ? 'submit' : 'text', text, sessionId: session.id, requestId: crypto.randomUUID() })) el('session-text').value = '';
  });
  el('session-latest').addEventListener('click', () => { const output = el('session-output'); output.scrollTop = output.scrollHeight; output.focus({ preventScroll: true }); });
  el('session-keys').addEventListener('click', async event => {
    const action = event.target.closest('button')?.dataset.key;
    if (!action || !session) return;
    if (action === 'end' && !confirm('End this session and stop its programs? This cannot be undone.')) return;
    await mutate({ action, sessionId: session.id, requestId: crypto.randomUUID() });
  });
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition;
  el('voice-status').textContent = Recognition ? 'Dictation adds text for review. Your browser may send audio to its speech provider.' : 'Use your keyboard’s microphone for dictation. Browser dictation is unavailable here.';
  el('session-dictate').addEventListener('click', () => {
    if (recognizing) { recognition.stop(); return; }
    if (!Recognition || !online) return;
    if (!confirm('Use browser dictation? Your browser may send microphone audio to its speech provider. You can review the text before inserting it.')) return;
    recognition = new Recognition(); recognition.lang = navigator.language || 'en-US'; recognition.interimResults = false;
    recognition.onresult = event => {
      const transcript = Array.from(event.results).filter(result => result.isFinal).map(result => result[0].transcript).join(' ');
      el('session-text').value = [el('session-text').value, transcript].filter(Boolean).join(' ').slice(0, 2000);
    };
    recognition.onerror = () => { el('voice-status').textContent = 'Dictation could not finish. You can type or use your keyboard’s microphone.'; };
    recognition.onend = () => { recognizing = false; el('session-dictate').textContent = 'Dictate'; controls(); el('session-text').focus(); };
    try { recognition.start(); recognizing = true; el('session-dictate').textContent = 'Stop dictation'; el('voice-status').textContent = 'Listening… Review the transcript before inserting it.'; controls(); }
    catch { el('voice-status').textContent = 'Microphone unavailable. You can still type.'; }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && recognizing) recognition.stop(); else void refresh(); });
  window.addEventListener('online', refresh);
  window.addEventListener('offline', () => { online = false; el('session-state').textContent = 'Disconnected'; controls(); });
  void refresh(); setInterval(refresh, 1000);
})();
