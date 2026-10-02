import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface Report { ok: boolean; code?: string; message: string; tabIdMatches?: boolean; checks: { sheetIdConfigured: boolean; emailConfigured: boolean; privateKeyConfigured: boolean; localCredentialFileConfigured: boolean; productionTargetApproved: boolean; tab: string } }
export function GoogleSheetStatus() {
  const [report, setReport] = useState<Report>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retryResult, setRetryResult] = useState("");
  async function check() {
    setBusy(true); setError("");
    try { setReport(await apiFetch<Report>("/api/storage-health?action=sheet_health")); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "The diagnostic check failed."); }
    finally { setBusy(false); }
  }
  async function retry() {
    setBusy(true); setError(""); setRetryResult("");
    try {
      const result = await apiFetch<{ synced: number; failed: number }>("/api/storage-health?action=sheet_retry", { method: "POST" });
      setRetryResult(`${result.synced} records synchronized. ${result.failed} still need attention. Each run checks up to 5 failed records.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Retry failed."); }
    finally { setBusy(false); }
  }
  return <section className="rounded-3xl border bg-white p-6 dark:bg-slate-900 space-y-3">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h2 className="font-bold">Google Sheet connection</h2><p className="text-sm text-slate-500 mt-1">Check the configuration used by this deployment.</p></div><Button variant="outline" disabled={busy} onClick={() => void check()}>{busy ? "Checking…" : "Check Google Sheet"}</Button></div>
    {report && <div role="status" className={`rounded-xl border p-4 text-sm ${report.ok ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
      <p className="font-medium">{report.ok ? "Connection checks passed" : report.code}</p><p className="mt-2">{report.message}</p>
      <ul className="mt-3 space-y-1 text-xs"><li>Spreadsheet ID: {report.checks.sheetIdConfigured ? "Set" : "Missing"}</li><li>Service-account email: {report.checks.emailConfigured ? "Set" : "Missing"}</li><li>Private key: {report.checks.privateKeyConfigured ? "Set" : "Missing"}</li><li>Credential file path: {report.checks.localCredentialFileConfigured ? "Set (remove local paths on Vercel)" : "Not set"}</li><li>Production target approved: {report.checks.productionTargetApproved ? "Yes" : "No"}</li><li>Tab: {report.checks.tab}</li></ul>
      {report.tabIdMatches === false && <p className="mt-2">GOOGLE_SHEET_TAB_ID does not match this tab. Correct it before configuring protected ranges.</p>}
    </div>}
    {report?.ok && <Button variant="outline" disabled={busy} onClick={() => void retry()}>Retry failed Sheet sync</Button>}
    {retryResult && <p role="status" className="text-sm">{retryResult}</p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </section>;
}
