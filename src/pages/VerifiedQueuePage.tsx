import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import { ListChecks, Scan, Download } from "lucide-react";
import { storageService } from "@/lib/db";
import { Button } from "@/components/ui/button";

export default function VerifiedQueuePage() {
  // Only expose an anonymous count: never render stored contact details or images.
  const submissionCount = useLiveQuery(async () =>
    (await storageService.getVerifiedContacts()).length, []);

  return (
    <section className="mx-auto w-full max-w-3xl py-6 sm:py-12">
      <header className="mb-7 space-y-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-slate-500">Contact capture</p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">Review Queue</h1>
          </div>
          <Button
            type="button"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-xs transition-all hover:bg-slate-800 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 cursor-pointer w-fit"
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Export Contacts</span>
          </Button>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Contacts submitted for review. All entries shown here are anonymised for this demonstration.
        </p>
      </header>

      {submissionCount === undefined ? (
        <p role="status" className="py-10 text-center text-sm text-muted-foreground">Loading review queue…</p>
      ) : submissionCount === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center dark:border-slate-800 dark:bg-slate-950 sm:px-8 sm:py-12">
          <ListChecks className="mx-auto mb-5 h-7 w-7 text-slate-500" aria-hidden="true" />
          <h2 className="text-lg font-medium text-slate-900 dark:text-white">No contacts have been submitted yet.</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Scan a card to try the demonstration.</p>
          <Link to="/" className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-900 dark:bg-white dark:text-slate-900">
            <Scan className="h-4 w-4 shrink-0" aria-hidden="true" />
            Scan a business card
          </Link>
        </div>
      ) : (
        <ul className="space-y-3" aria-label="Anonymised demonstration contacts">
          {Array.from({ length: submissionCount }, (_, index) => (
            <li key={index} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Demo contact</h2>
                <p className="text-sm text-muted-foreground">Contact details hidden for this demonstration.</p>
              </div>
              <span className="self-start rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:shrink-0">Submitted for review</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
