const $ = id => document.getElementById(id);
const fragment = new URLSearchParams(location.hash.slice(1));
let pairingToken = fragment.get('pair');
if (location.hash) history.replaceState(null, '', location.pathname);
let connected = false;
let sending = false;
let statusRequest = 0;
const show = view => { for (const id of ['pairing', 'unpaired', 'connected']) $(id).hidden = id !== view; };
async function request(path, data) {
  const response = await fetch(path, { method: data ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(6000), headers: data ? { 'Content-Type': 'application/json' } : {}, body: data ? JSON.stringify(data) : undefined });
  const result = await response.json();
  if (!response.ok) { const error = new Error(result.error); error.status = response.status; throw error; }
  return result;
}
function setOnline(online) {
  connected = online;
  $('connection-status').textContent = online ? 'Online' : 'Offline';
  $('status-dot').classList.toggle('online', online);
  $('send-button').disabled = !online || sending;
}
async function checkStatus() {
  if (pairingToken) return;
  const version = ++statusRequest;
  try {
    const result = await request('/api/status');
    if (version !== statusRequest) return;
    $('computer-name').textContent = result.name; show('connected'); setOnline(true);
    if (!sending) $('message-error').textContent = '';
  } catch (error) {
    if (version !== statusRequest) return;
    setOnline(false);
    if (error.status === 401) { show('unpaired'); }
    else if (!$('connected').hidden) $('message-error').textContent = "Hoso can't reach your computer right now. Make sure it is turned on and connected to the internet.";
    else { show('unpaired'); $('unpaired').querySelector('.subtle').textContent = "Hoso can't reach your computer right now. Make sure it is turned on and connected to the internet, then try again."; }
  }
}
$('pair-form').addEventListener('submit', async event => {
  event.preventDefault(); $('pair-button').disabled = true; $('pair-error').textContent = '';
  try {
    await request('/api/pair', { token: pairingToken, name: $('phone-name').value });
    pairingToken = null; await checkStatus();
  } catch (error) { $('pair-error').textContent = error.status ? error.message : "Couldn't reach your computer. Please try again."; }
  finally { $('pair-button').disabled = false; }
});
function addMessage(text, mine) {
  const row = document.createElement('div'); row.className = `bubble ${mine ? 'mine' : 'reply'}`;
  row.textContent = text; $('conversation').append(row); row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
$('message-form').addEventListener('submit', async event => {
  event.preventDefault(); const message = $('message').value.trim(); if (!message || !connected || sending) return;
  sending = true; $('send-button').disabled = true; $('message-error').textContent = '';
  try {
    const result = await request('/api/message', { message });
    addMessage(message, true); addMessage(result.message, false); $('message').value = ''; setOnline(true);
  } catch (error) {
    $('message-error').textContent = error.status ? error.message : "Your message couldn't reach your computer. Please try again.";
    if (!error.status || error.status === 401) setOnline(false);
  } finally { sending = false; $('send-button').disabled = !connected; }
});
if (pairingToken) show('pairing'); else checkStatus();
setInterval(checkStatus, 5000);
window.addEventListener('online', checkStatus);
window.addEventListener('offline', () => setOnline(false));
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkStatus(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
