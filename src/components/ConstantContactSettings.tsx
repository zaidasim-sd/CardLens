import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface Status { configured: boolean; connected: boolean; listName: string }
export function ConstantContactSettings() {
  const [status, setStatus] = useState<Status>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { void apiFetch<Status>("/api/constant-contact").then(setStatus).catch(() => setMessage("Could not load connection status.")); }, []);
  async function act(action: "connect" | "retry") {
    setBusy(true); setMessage("");
    try {
      const result = await apiFetch<Status & { url?: string; processed?: number }>(`/api/constant-contact?action=${action}`, { method: "POST" });
      if (result.url) window.location.assign(result.url);
      else { setStatus(result); setMessage(`Checked ${result.processed || 0} approved contacts. Transfer results appear in the review queue and Google Sheet.`); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Connection failed."); }
    finally { setBusy(false); }
  }
  return <section className="rounded-3xl border bg-white p-6 dark:bg-slate-900 space-y-3">
    <h2 className="font-bold">Constant Contact</h2>
    <p className="text-sm">Captures go to the review portal and Google Sheet. Only reviewer-approved contacts transfer to Constant Contact.</p>
    <p className="text-sm">{status?.connected ? `Connected · ${status.listName}` : "Account connection required"}</p>
    <div className="flex flex-col sm:flex-row gap-3">
      <Button disabled={busy || !status?.configured} onClick={() => void act("connect")}>{status?.connected ? "Reconnect account" : "Connect Constant Contact"}</Button>
      <Button variant="outline" disabled={busy || !status?.connected} onClick={() => void act("retry")}>Process pending transfers</Button>
    </div>
    <p className="text-xs text-slate-500">Existing Constant Contact emails are preserved and flagged. No welcome email campaign is sent.</p>
    {message && <p role="status" className="text-sm break-words">{message}</p>}
  </section>;
}
