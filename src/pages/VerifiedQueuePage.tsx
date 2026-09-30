import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ListChecks, Scan } from "lucide-react";
import { cardApi } from "@/lib/cardApi";
import type { ContactRecord } from "@/types";
import { Button } from "@/components/ui/button";
import EditContactModal from "@/components/verified/EditContactModal";

export default function VerifiedQueuePage() {
  const [records, setRecords] = useState<ContactRecord[] | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<ContactRecord | null>(null);
  const load = useCallback(async () => {
    try { setRecords(await cardApi.list()); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The queue could not be loaded."); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function changeState(record: ContactRecord, status: ContactRecord["status"]) {
    try { await cardApi.update(record.id, record.verifiedData, status); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The record could not be changed."); }
  }

  return (
    <section className="mx-auto w-full max-w-4xl py-6 sm:py-12">
      <header className="mb-7 space-y-3">
        <p className="text-xs font-medium uppercase tracking-widest text-slate-500">Contact review</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">Review Queue</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">Contacts submitted for Aventure review.</p>
      </header>
      {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
      {records === null && !error ? <p role="status" className="py-10 text-center text-sm text-muted-foreground">Loading review queue</p> : null}
      {records?.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center dark:border-slate-800 dark:bg-slate-950 sm:px-8 sm:py-12">
          <ListChecks className="mx-auto mb-5 h-7 w-7 text-slate-500" aria-hidden="true" />
          <h2 className="text-lg font-medium">No contacts have been submitted.</h2>
          <Link to="/" className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white"><Scan className="h-4 w-4" />Return home</Link>
        </div>
      ) : null}
      <ul className="space-y-3">{records?.map((record) => <li key={record.id} className="rounded-xl border bg-white p-5 dark:bg-slate-950">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{record.verifiedData.fullName || "Unnamed contact"}</h2><p className="text-sm text-muted-foreground">{record.verifiedData.companyName || "Company not provided"}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs capitalize">{record.status.replaceAll("_", " ")}</span></div>
        <div className="mt-3 grid gap-1 text-sm sm:grid-cols-2"><p>{record.verifiedData.email}</p><p>{record.verifiedData.phone}</p></div>
        {record.imageExpiredAt ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">The card image has expired. The contact fields remain available.</p> : null}
        {record.status === "submitted" || record.status === "correction_requested" ? <div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setSelected(record)}>Correct details</Button><Button type="button" variant="outline" onClick={() => void changeState(record, "correction_requested")}>Request correction</Button><Button type="button" variant="outline" onClick={() => void changeState(record, "rejected")}>Reject</Button><Button type="button" onClick={() => void changeState(record, "approved")}>Approve</Button></div> : null}
      </li>)}</ul>
      <EditContactModal isOpen={Boolean(selected)} setIsOpen={(open) => { if (!open) setSelected(null); }} record={selected} onSuccess={() => { setSelected(null); void load(); }} />
    </section>
  );
}
