import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ListChecks, Scan, Download, MapPin, Building2, AlertCircle, RefreshCw, ClipboardCheck } from "lucide-react";
import { cardApi } from "@/lib/cardApi";
import { exportApprovedContacts } from "@/lib/api/export";
import { useAuth } from "@/auth/AuthContext";
import type { ContactRecord } from "@/types";
import { Button } from "@/components/ui/button";
import EditContactModal from "@/components/verified/EditContactModal";
import ReviewContactModal from "@/components/verified/ReviewContactModal";
import { toast } from "sonner";

export default function VerifiedQueuePage() {
  const { user } = useAuth();
  const [records, setRecords] = useState<ContactRecord[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<ContactRecord | null>(null);
  const [reviewRecord, setReviewRecord] = useState<ContactRecord | null>(null);

  const canReview = user?.role === "aventure_reviewer" || user?.role === "vision71_administrator";

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const data = await cardApi.list();
      setRecords(data);
    } catch (caught: any) {
      setError(caught?.message || "The review queue could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      await exportApprovedContacts("cardsnap-approved-contacts.csv");
      toast.success("Approved contacts exported to CSV.");
    } catch (err: any) {
      toast.error(err.message || "Failed to export approved contacts.");
    } finally {
      setIsExporting(false);
    }
  };

  /**
   * Helper to format status according to the approved 4 Version 1 statuses:
   * - Pending Review (blue)
   * - Approved (green)
   * - Return for Correction (amber)
   * - Rejected (red)
   */
  const getStatusBadge = (status: ContactRecord["status"], sheetStatus?: string) => {
    // If backend sheet has confirmed status, map accordingly
    const effectiveStatus = (sheetStatus || status).toLowerCase();

    if (effectiveStatus.includes("approved")) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-300">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
          Approved
        </span>
      );
    }
    if (effectiveStatus.includes("correction") || effectiveStatus.includes("return")) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:border-amber-800 dark:text-amber-300">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
          Return for Correction
        </span>
      );
    }
    if (effectiveStatus.includes("rejected")) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:border-rose-800 dark:text-rose-300">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
          Rejected
        </span>
      );
    }

    // Default / Pending Review
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:border-blue-800 dark:text-blue-300">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
        Pending Review
      </span>
    );
  };

  const approvedCount = records?.filter((r) =>
    r.status === "approved" || r.sheetStatus?.toLowerCase().includes("approved")
  ).length || 0;

  return (
    <section className="mx-auto w-full max-w-4xl py-4 sm:py-8 space-y-6">
      {/* Header with Title and Export Button */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-5 dark:border-slate-800">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            Exhibition Contact Register
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mt-0.5">
            Review Queue
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Submitted contacts awaiting or completed through the approved review workflow.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={isLoading}
            className="h-9 px-3 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
            title="Refresh queue"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </Button>

          <Button
            type="button"
            onClick={handleExportCsv}
            disabled={isExporting || approvedCount === 0}
            className="h-9 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title={approvedCount === 0 ? "No approved contacts to export yet" : "Export approved contacts as CSV"}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Approved ({approvedCount})</span>
          </Button>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs sm:text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && records === null && !error && (
        <div className="py-12 text-center text-xs sm:text-sm text-slate-500">
          <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin text-blue-600" />
          Loading review queue…
        </div>
      )}

      {/* Empty State */}
      {!isLoading && records?.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center dark:border-slate-800 dark:bg-slate-900 sm:px-8 sm:py-14 shadow-2xs">
          <ListChecks className="mx-auto mb-4 h-8 w-8 text-slate-400" aria-hidden="true" />
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
            No contacts submitted yet.
          </h2>
          <p className="mt-1.5 text-xs sm:text-sm text-slate-500 max-w-sm mx-auto">
            Scan a business card to capture details and submit the contact for review.
          </p>
          <div className="mt-6 flex justify-center">
            <Link
              to="/"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-blue-700 shadow-sm"
            >
              <Scan className="h-4 w-4" /> Scan a business card
            </Link>
          </div>
        </div>
      )}

      {/* Operational List of Contacts */}
      <ul className="space-y-3" aria-label="Submitted exhibition contacts">
        {records?.map((record) => {
          const v = record.verifiedData;
          const capturedDate = record.createdAt ? new Date(record.createdAt) : null;
          const exhibition = v.meetingContext?.metAtLocation;

          return (
            <li
              key={record.id}
              className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-2xs hover:border-slate-300 transition-colors dark:border-slate-800 dark:bg-slate-900"
            >
              {/* Header row: Name, Company, and Status Badge */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                      {v.fullName || v.companyName || "Unnamed contact"}
                    </h2>
                    {record.isDemo && (
                      <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md dark:bg-slate-800 dark:text-slate-300">
                        Demo
                      </span>
                    )}
                  </div>
                  {v.jobTitle && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                      {v.jobTitle}
                    </p>
                  )}
                  {v.companyName && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 pt-0.5">
                      <Building2 className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{v.companyName}</span>
                    </div>
                  )}
                </div>

                <div
                  className={`shrink-0 self-start sm:self-auto ${canReview ? "cursor-pointer hover:opacity-90 transition-opacity" : ""}`}
                  onClick={() => canReview && setReviewRecord(record)}
                  title={canReview ? "Click to review contact" : undefined}
                >
                  {getStatusBadge(record.status, record.sheetStatus)}
                </div>
              </div>

              {/* Contact info & exhibition meta */}
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-600 dark:text-slate-400">
                <div className="truncate">
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Email</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{v.email || "—"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Phone</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{v.phone || "—"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Exhibition</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200 truncate flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-blue-600 shrink-0" />
                    {exhibition || "Not specified"}
                  </span>
                </div>
              </div>

              {/* Reviewer Comment / Return for Correction Notice */}
              {record.reviewerComment && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                  <div>
                    <span className="font-semibold">Reviewer comment: </span>
                    <span>{record.reviewerComment}</span>
                  </div>
                </div>
              )}

              {/* Footer row: Timestamps & Action */}
              <div className="mt-3 pt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                <span>
                  Captured {capturedDate ? `${capturedDate.toLocaleDateString()} at ${capturedDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "—"}
                  {record.reviewedByName ? ` · Reviewed by ${record.reviewedByName}` : ""}
                </span>

                <div className="flex items-center gap-2">
                  {canReview && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setReviewRecord(record)}
                      className="h-8 px-3 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white cursor-pointer shadow-xs flex items-center gap-1.5"
                    >
                      <ClipboardCheck className="w-3.5 h-3.5" />
                      <span>Review Details</span>
                    </Button>
                  )}

                  {!canReview && record.status === "correction_requested" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSelected(record)}
                      className="h-8 text-xs font-semibold rounded-lg border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 cursor-pointer"
                    >
                      Correct details
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Review modal for Reviewers to inspect and change status */}
      <ReviewContactModal
        isOpen={Boolean(reviewRecord)}
        setIsOpen={(open) => {
          if (!open) setReviewRecord(null);
        }}
        record={reviewRecord}
        onSuccess={() => {
          setReviewRecord(null);
          void load();
        }}
      />

      {/* Edit modal when assistant corrects details */}
      <EditContactModal
        isOpen={Boolean(selected)}
        setIsOpen={(open) => {
          if (!open) setSelected(null);
        }}
        record={selected}
        onSuccess={() => {
          setSelected(null);
          void load();
        }}
      />
    </section>
  );
}
