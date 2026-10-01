import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getContactImage, resolveDuplicateReview, type DuplicateReviewContext } from "@/lib/api/contacts";
import type { ContactRecord, OCRData } from "@/types";
import { toast } from "sonner";

const rows = [
  ["fullName", "Contact name"], ["companyName", "Company"], ["jobTitle", "Job title"],
  ["email", "Email"], ["phone", "Phone"], ["alternatePhone", "Alternate phone"],
  ["website", "Website"], ["address", "Address"], ["city", "City"], ["country", "Country"],
  ["metAtLocation", "Exhibition / Source"], ["whereMet", "Where met / Location"], ["notes", "Notes"],
] as const;
function value(data: OCRData, key: string): string {
  return String(key === "metAtLocation" || key === "whereMet" ? data.meetingContext?.[key] || "" : data[key as keyof OCRData] || "");
}

function CardReference({ record, label }: { record: ContactRecord; label: string }) {
  const [image, setImage] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setImage("");
    setLoading(Boolean(record.hasImage));
    if (record.hasImage) {
      void getContactImage(record.id).then(blob => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        if (active) setImage(objectUrl);
      }).catch(() => {}).finally(() => { if (active) setLoading(false); });
    } else if (record.isDemo) setImage("/demo-card.svg");
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [record.id, record.hasImage, record.isDemo]);
  return <section className="min-w-0 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
    <h3 className="text-sm font-semibold">{label}</h3>
    <p className="mt-1 break-words text-xs text-slate-500">{record.capturedByName || "Capturer"} · {new Date(record.createdAt).toLocaleString()} · {record.status}</p>
    <div className="mt-3 flex h-44 sm:h-56 items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-950">
      {loading ? <Loader2 className="animate-spin" aria-label="Loading card image" /> : image ? <a href={image} target="_blank" rel="noreferrer" className="h-full w-full" aria-label={`Open ${label.toLowerCase()} image`}><img src={image} alt={`${label} business card`} className="h-full w-full object-contain" /></a> : <p className="px-4 text-center text-xs text-slate-500">{record.hasImage ? "Image expired or unavailable. Contact details remain available below." : "No card image saved for this record."}</p>}
    </div>
  </section>;
}

export default function DuplicateReviewPanel({ context, reviewerId, onSuccess, onReload, onEdit }: { context: DuplicateReviewContext; reviewerId?: string; onSuccess: (record: ContactRecord) => void; onReload: () => void; onEdit: () => void }) {
  const [selectedId, setSelectedId] = useState(context.matches[0]?.id || "");
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [decision, setDecision] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const incoming = context.record;
  const existing = context.matches.find(match => match.id === selectedId);
  const selfCaptured = incoming.capturedBy === reviewerId;
  const updateDisabled = !existing || existing.capturedBy === reviewerId || existing.status === "transferred" || existing.status === "rejected" || existing.duplicateReview?.state === "pending" || selfCaptured;
  const options = [
    ["retain_existing", "Retain existing record", "Close the new submission as rejected. Keep the selected existing record unchanged."],
    ["update_existing", "Update existing record", "Apply only the fields you select below to the existing record, approve it, and close the new submission as rejected."],
    ["keep_both", "Keep both records", "Approve the new submission as a separate contact. Leave all existing records unchanged."],
    ["reject_new", "Reject new submission", "Reject the new submission. Leave all existing records unchanged."],
  ];
  const submit = async () => {
    setSaving(true); setError("");
    try {
      const updated = await resolveDuplicateReview(context, decision, existing?.id, selectedFields);
      toast.success(updated.sheetStatus === "failed" ? "Decision saved. Google Sheet sync needs attention." : "Duplicate review decision saved.");
      if (updated.status === "approved" && updated.transferError) toast.warning(updated.transferError);
      onSuccess(updated);
    } catch (err) { setError(err instanceof Error ? err.message : "Decision could not be saved."); }
    finally { setSaving(false); }
  };
  return <div className="space-y-5 pt-4">
    <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
      <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-5 w-5 shrink-0" />Possible duplicate — reviewer decision required</div>
      <p className="mt-1">{existing?.matchReason || incoming.duplicateReview?.reason || "Matching contact details"}. Compare both records before confirming a decision.</p>
    </div>
    {context.matches.length > 1 && <div className="space-y-1"><label htmlFor="duplicate-candidate" className="text-sm font-semibold">Possible existing records ({context.matches.length})</label><select id="duplicate-candidate" className="h-11 w-full rounded-lg border bg-background px-3 text-base sm:text-sm" disabled={saving} value={selectedId} onChange={e => { setSelectedId(e.target.value); setSelectedFields([]); setDecision(""); }}>
      {context.matches.map(match => <option key={match.id} value={match.id}>{match.verifiedData.fullName || match.verifiedData.companyName || "Unnamed contact"} · {match.verifiedData.email || match.verifiedData.phone} · {match.matchReason}</option>)}
    </select></div>}
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2"><CardReference record={incoming} label="New submission" />{existing ? <CardReference record={existing} label="Possible existing record" /> : <p className="p-4 text-sm">The flagged record is no longer available. You can keep or reject the new submission.</p>}</div>
    <Button type="button" variant="outline" disabled={saving} onClick={onEdit}>Edit new submission details</Button>
    <div className="overflow-hidden rounded-xl border dark:border-slate-700">
      <div className="grid grid-cols-2 bg-slate-100 p-3 text-sm font-semibold dark:bg-slate-800"><span>New submission</span><span>Existing record</span></div>
      {rows.map(([key, label]) => {
        const next = value(incoming.verifiedData, key), previous = existing ? value(existing.verifiedData, key) : "";
        if (!next && !previous) return null;
        const differs = Boolean(existing && next !== previous);
        return <div key={key} className={`border-t p-3 dark:border-slate-700 ${differs ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}`}>
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>{label}</span>{differs && <span className="text-amber-700 dark:text-amber-300">Different</span>}
            {decision === "update_existing" && differs && <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={selectedFields.includes(key)} disabled={saving} onChange={e => setSelectedFields(current => e.target.checked ? [...current, key] : current.filter(field => field !== key))} className="h-4 w-4 accent-blue-600" />Use new value{!next && " (clears existing value)"}</label>}
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm"><p className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{next || "—"}</p><p className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{previous || "—"}</p></div>
          {decision === "update_existing" && selectedFields.includes(key) && <p className="mt-2 break-words text-xs text-blue-700 dark:text-blue-300">Existing record after update: {next || "(blank)"}</p>}
        </div>;
      })}
    </div>
    <fieldset disabled={saving} className="space-y-2"><legend className="mb-2 text-sm font-semibold">Reviewer decision</legend>{options.map(([key, label, description]) => {
      const disabled = key === "update_existing" ? updateDisabled : key === "retain_existing" ? !existing : key === "keep_both" ? selfCaptured : false;
      return <label key={key} className={`flex items-start gap-3 rounded-xl border p-3 ${disabled ? "opacity-50" : "cursor-pointer"} ${decision === key ? "border-blue-600 bg-blue-50 dark:bg-blue-950/30" : "dark:border-slate-700"}`}><input type="radio" name="duplicate-decision" value={key} disabled={disabled} checked={decision === key} onChange={() => { setDecision(key); setSelectedFields([]); }} className="mt-1 h-4 w-4 shrink-0 accent-blue-600" /><span><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block text-xs text-slate-600 dark:text-slate-400">{description}</span></span></label>;
    })}</fieldset>
    {selfCaptured && <p className="text-xs text-amber-700">A different reviewer must approve a submission you captured.</p>}
    {decision === "update_existing" && <p className="text-sm text-blue-700 dark:text-blue-300">Select the fields marked “Different” above. {selectedFields.length} field(s) selected. The original card images and capture history are preserved.</p>}
    {error && <div role="alert" className="rounded-lg border border-red-200 p-3 text-sm text-red-700">{error}<Button type="button" variant="outline" onClick={onReload} disabled={saving} className="mt-2">Reload comparison</Button></div>}
    <div className="sticky bottom-0 border-t bg-background py-3"><Button type="button" onClick={submit} disabled={saving || !decision || (decision === "update_existing" && !selectedFields.length)} className="min-h-11 w-full sm:w-auto">{saving ? "Saving decision…" : "Confirm reviewer decision"}</Button></div>
  </div>;
}
