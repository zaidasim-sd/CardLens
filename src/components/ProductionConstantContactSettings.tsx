import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
type Status = { enabled: boolean; configured: boolean; connected: boolean; writesEnabled?: boolean; localTest?:boolean; hostedStaging?:boolean; listName: string; error?: string };
export function ProductionConstantContactSettings() {
  const [status, setStatus] = useState<Status>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void apiFetch<Status>('/api/constantcontact?action=status').then(setStatus).catch(() => setMessage('Constant Contact status could not be checked.')); }, []);
  if (!status?.enabled) return null;
  async function connect() {
    setBusy(true); setMessage('');
    try { const result = await apiFetch<{url: string}>('/api/constantcontact?action=connect', {method:'POST'}); window.location.assign(result.url); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Connection could not be started.'); setBusy(false); }
  }
  return <section className="space-y-3 rounded-3xl border bg-white p-6 dark:bg-slate-900">
    <h2 className="font-bold">Constant Contact</h2>
    {(status.localTest||status.hostedStaging)&&<p className="text-sm font-semibold text-amber-700">Staging delivery: staging Sheet and the approved Constant Contact list only.</p>}
    <p className="break-words text-sm">Destination: {status.listName}</p>
    <p className="text-sm">{status.connected ? 'Account connected. Delivery is shown separately after each Sheet submission.' : 'An administrator must connect the approved account before delivery.'}</p>
    {!status.writesEnabled && <p className="text-sm">Constant Contact writes are paused.</p>}
    <Button disabled={busy || !status.configured} onClick={() => void connect()}>{status.connected ? 'Reconnect Constant Contact' : 'Connect Constant Contact'}</Button>
    {(message || status.error) && <p role="status" className="text-sm">{message || status.error}</p>}
  </section>;
}
