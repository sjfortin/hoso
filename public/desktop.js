const $ = id => document.getElementById(id);
const fragment = new URLSearchParams(location.hash.slice(1));
if (fragment.has('admin')) sessionStorage.setItem('relay_admin', fragment.get('admin'));
if (location.hash) history.replaceState(null, '', location.pathname);
let expiresAt = 0;
let busy = false;
async function request(path, body) {
  const response = await fetch(`/api/admin/${path}`, { method: body ? 'POST' : 'GET', cache: 'no-store', signal: AbortSignal.timeout(6000), headers: { Authorization: `Bearer ${sessionStorage.getItem('relay_admin') ?? ''}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json(); if (!response.ok) throw Error(data.error); return data;
}
async function refresh() {
  if (busy) return;
  try {
    const data = await request('status');
    $('local-warning').hidden = !data.publicOrigin.startsWith('http:');
    $('devices').hidden = !data.devices.length; $('new-code').hidden = !!data.devices.length;
    if (data.devices.length) {
      $('device-name').textContent = `${data.devices[0].name} · Connected ${new Date(data.devices[0].connectedAt).toLocaleDateString()}`;
      $('qr-area').hidden = true; $('expiry').textContent = 'Your phone is connected.'; expiresAt = 0;
    }
    $('error').textContent = '';
  } catch (error) { $('error').textContent = error.message; }
}
$('new-code').addEventListener('click', async () => {
  busy = true; $('new-code').disabled = true;
  try {
    const data = await request('pair', {}); expiresAt = data.expiresAt;
    $('qr').src = data.qr; $('qr-area').hidden = false; $('error').textContent = '';
  } catch (error) { $('error').textContent = error.message; }
  finally { busy = false; $('new-code').disabled = false; }
});
$('revoke').addEventListener('click', async () => {
  if (!confirm('Remove this phone’s access to your computer?')) return;
  busy = true; $('revoke').disabled = true;
  try { await request('revoke', {}); $('expiry').textContent = 'Phone access removed.'; }
  catch (error) { $('error').textContent = error.message; }
  finally { busy = false; $('revoke').disabled = false; await refresh(); }
});
setInterval(() => {
  if (expiresAt) {
    const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    $('expiry').textContent = seconds ? `This code expires in ${seconds} seconds.` : 'This code has expired. Create a new one.';
    if (!seconds) $('qr-area').hidden = true;
  }
}, 1000);
setInterval(refresh, 3000); refresh();
