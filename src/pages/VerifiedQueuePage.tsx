import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ListChecks,
  Scan,
  Download,
  MapPin,
  Building2,
  AlertCircle,
  RefreshCw,
  ClipboardCheck,
  RotateCcw,
  User,
} from "lucide-react";
import { cardApi } from "@/lib/cardApi";
import { exportApprovedContacts } from "@/lib/api/export";
import { useAuth } from "@/auth/AuthContext";
import type { ContactRecord } from "@/types";
import { Button } from "@/components/ui/button";
import EditContactModal from "@/components/verified/EditContactModal";
import ReviewContactModal from "@/components/verified/ReviewContactModal";
import { toast } from "sonner";

type TabType = "all" | "pending" | "correction" | "approved" | "rejected";

export default function VerifiedQueuePage() {
  const { user } = useAuth();
  const [records, setRecords] = useState<ContactRecord[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<ContactRecord | null>(null);
  const [reviewRecord, setReviewRecord] = useState<ContactRecord | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("all");

  const canReview = user?.role === "aventure_reviewer" || user?.role === "vision71_administrator";

  // In-memory tracking of viewed correction IDs during session (zero local persistent storage)
  const [viewedCorrections, setViewedCorrections] = useState<string[]>([]);

  const load = useCallback(async (isBackground = false) => {
    if (!isBackground) setIsLoading(true);
    setError("");
    try {
      const data = await cardApi.list();
      setRecords(data);
    } catch (caught: any) {
      if (!isBackground) {
        setError(caught?.message || "The review queue could not be loaded.");
      }
    } finally {
      if (!isBackground) setIsLoading(false);
    }
  }, []);

  // Real-time synchronization: Auto-poll every 3.5 seconds + refresh on visibility focus
  useEffect(() => {
    void load();

    const interval = setInterval(() => {
      void load(true);
    }, 3500);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [load]);

  const markCorrectionsAsViewed = useCallback(() => {
    if (!records) return;
    const correctionIds = records
      .filter((r) => r.status === "correction_requested")
      .map((r) => r.id);
    if (correctionIds.length === 0) return;

    setViewedCorrections((prev) => Array.from(new Set([...prev, ...correctionIds])));
  }, [records]);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    if (tab === "correction") {
      markCorrectionsAsViewed();
    }
  };

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      await exportApprovedContacts("lead71-approved-contacts.csv");
      toast.success("Approved contacts exported to CSV.");
    } catch (err: any) {
      toast.error(err.message || "Failed to export approved contacts.");
    } finally {
      setIsExporting(false);
    }
  };

  // Helper to format status according to the approved 4 Version 1 statuses
  const getStatusBadge = (status: ContactRecord["status"]) => {
    switch (status) {
      case "approved":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/40 dark:border-emerald-800/80 dark:text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Approved
          </span>
        );
      case "correction_requested":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200/80 dark:bg-amber-950/40 dark:border-amber-800/80 dark:text-amber-300">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Return for Correction
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 border border-rose-200/80 dark:bg-rose-950/40 dark:border-rose-800/80 dark:text-rose-300">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            Rejected
          </span>
        );
      case "submitted":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200/80 dark:bg-blue-950/40 dark:border-blue-800/80 dark:text-blue-300">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            Pending Review
          </span>
        );
    }
  };

  // Counts for tabs
  const allCount = records?.length || 0;
  const pendingCount =
    records?.filter((r) => r.status === "submitted" || (!["approved", "rejected", "correction_requested"].includes(r.status)))
      .length || 0;
  const correctionCount =
    records?.filter((r) => r.status === "correction_requested").length || 0;
  const approvedCount =
    records?.filter((r) => r.status === "approved").length || 0;
  const rejectedCount =
    records?.filter((r) => r.status === "rejected").length || 0;

  // Unread badge count for capturer on "Return for Correction"
  const unreadCorrectionsCount =
    records?.filter(
      (r) => r.status === "correction_requested" && !viewedCorrections.includes(r.id)
    ).length || 0;

  // Filtered list based on active tab
  const filteredRecords = records?.filter((r) => {
    if (activeTab === "pending") {
      return r.status === "submitted" || (!["approved", "rejected", "correction_requested"].includes(r.status));
    }
    if (activeTab === "correction") {
      return r.status === "correction_requested";
    }
    if (activeTab === "approved") {
      return r.status === "approved";
    }
    if (activeTab === "rejected") {
      return r.status === "rejected";
    }
    return true; // "all"
  });

  return (
    <section className="mx-auto w-full max-w-4xl py-4 sm:py-8 space-y-5">
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
            Submitted contacts awaiting or completed through the review workflow.
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

      {/* Navigation Tabs - Modern, Calm & Professional Segmented Control */}
      <nav
        aria-label="Review Queue Filter Tabs"
        className="flex items-center gap-1 p-1 bg-slate-100/90 dark:bg-slate-800/70 rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-x-auto scrollbar-none w-full"
      >
        <button
          type="button"
          onClick={() => handleTabChange("all")}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer shrink-0 ${
            activeTab === "all"
              ? "bg-white text-slate-900 shadow-xs font-semibold dark:bg-slate-900 dark:text-white"
              : "text-slate-600 hover:text-slate-900 hover:bg-white/50 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-700/50"
          }`}
        >
          <span>All</span>
          <span
            className={`text-[11px] px-1.5 py-0.2 rounded-md font-medium ${
              activeTab === "all"
                ? "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                : "bg-slate-200/60 text-slate-500 dark:bg-slate-700/60 dark:text-slate-400"
            }`}
          >
            {allCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("pending")}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer shrink-0 ${
            activeTab === "pending"
              ? "bg-white text-slate-900 shadow-xs font-semibold dark:bg-slate-900 dark:text-white"
              : "text-slate-600 hover:text-slate-900 hover:bg-white/50 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-700/50"
          }`}
        >
          {activeTab === "pending" && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
          <span>Pending Review</span>
          <span
            className={`text-[11px] px-1.5 py-0.2 rounded-md font-medium ${
              activeTab === "pending"
                ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                : "bg-slate-200/60 text-slate-500 dark:bg-slate-700/60 dark:text-slate-400"
            }`}
          >
            {pendingCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("correction")}
          className={`relative inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer shrink-0 ${
            activeTab === "correction"
              ? "bg-white text-slate-900 shadow-xs font-semibold dark:bg-slate-900 dark:text-white"
              : "text-slate-600 hover:text-slate-900 hover:bg-white/50 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-700/50"
          }`}
        >
          {activeTab === "correction" && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
          <span>Needs Correction</span>
          <span
            className={`text-[11px] px-1.5 py-0.2 rounded-md font-medium ${
              activeTab === "correction"
                ? "bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                : "bg-slate-200/60 text-slate-500 dark:bg-slate-700/60 dark:text-slate-400"
            }`}
          >
            {correctionCount}
          </span>
          {/* Subtle calm dot indicator for capturer when corrections are pending */}
          {unreadCorrectionsCount > 0 && (
            <span
              className="w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-slate-900 shrink-0"
              title={`${unreadCorrectionsCount} unread cards returned for correction`}
            />
          )}
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("approved")}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer shrink-0 ${
            activeTab === "approved"
              ? "bg-white text-slate-900 shadow-xs font-semibold dark:bg-slate-900 dark:text-white"
              : "text-slate-600 hover:text-slate-900 hover:bg-white/50 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-700/50"
          }`}
        >
          {activeTab === "approved" && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
          <span>Approved</span>
          <span
            className={`text-[11px] px-1.5 py-0.2 rounded-md font-medium ${
              activeTab === "approved"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                : "bg-slate-200/60 text-slate-500 dark:bg-slate-700/60 dark:text-slate-400"
            }`}
          >
            {approvedCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("rejected")}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer shrink-0 ${
            activeTab === "rejected"
              ? "bg-white text-slate-900 shadow-xs font-semibold dark:bg-slate-900 dark:text-white"
              : "text-slate-600 hover:text-slate-900 hover:bg-white/50 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-700/50"
          }`}
        >
          {activeTab === "rejected" && <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />}
          <span>Rejected</span>
          <span
            className={`text-[11px] px-1.5 py-0.2 rounded-md font-medium ${
              activeTab === "rejected"
                ? "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                : "bg-slate-200/60 text-slate-500 dark:bg-slate-700/60 dark:text-slate-400"
            }`}
          >
            {rejectedCount}
          </span>
        </button>
      </nav>

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
      {!isLoading && filteredRecords?.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center dark:border-slate-800 dark:bg-slate-900 sm:px-8 sm:py-14 shadow-2xs">
          <ListChecks className="mx-auto mb-4 h-8 w-8 text-slate-400" aria-hidden="true" />
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
            {activeTab === "correction"
              ? "No contacts need correction."
              : activeTab === "pending"
              ? "No contacts currently pending review."
              : activeTab === "approved"
              ? "No contacts approved yet."
              : activeTab === "rejected"
              ? "No rejected contacts."
              : "No contacts submitted yet."}
          </h2>
          <p className="mt-1.5 text-xs sm:text-sm text-slate-500 max-w-sm mx-auto">
            {activeTab === "all"
              ? "Scan a business card to capture details and submit the contact for review."
              : "Contacts in this state will appear here as decisions are made."}
          </p>
          {activeTab === "all" && (
            <div className="mt-6 flex justify-center">
              <Link
                to="/"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-blue-700 shadow-sm"
              >
                <Scan className="h-4 w-4" /> Scan a business card
              </Link>
            </div>
          )}
        </div>
      )}

      {/* List of Contacts */}
      <ul className="space-y-3" aria-label="Submitted exhibition contacts">
        {filteredRecords?.map((record) => {
          const v = record.verifiedData;
          const capturedDate = record.createdAt ? new Date(record.createdAt) : null;
          const exhibition = v.meetingContext?.metAtLocation;
          const capturerName = record.capturedByName || "Zaid";
          const isCorrection = record.status === "correction_requested";

          return (
            <li
              key={record.id}
              className={`rounded-2xl border p-4 sm:p-5 shadow-2xs transition-colors dark:bg-slate-900 ${
                isCorrection
                  ? "border-amber-300/90 bg-amber-50/20 dark:border-amber-800/80"
                  : "border-slate-200/90 bg-white hover:border-slate-300 dark:border-slate-800"
              }`}
            >
              {/* Header row: Name, Company, and Status Badge */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                      {v.fullName || v.companyName || "Unnamed contact"}
                    </h2>
                    {record.duplicateReview?.state === "pending" && <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"><AlertCircle className="h-3 w-3" />Possible duplicate</span>}
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
                  {getStatusBadge(record.status)}
                  {record.status === "approved" && <p className="mt-2 text-xs max-w-xs break-words">Constant Contact: {{ not_started: "Not transferred", pending: "Pending transfer", failed: "Transfer failed", reconciliation_required: "Transfer needs checking", transferred: "Transferred", existing_contact: "Existing contact preserved" }[record.transferStatus || "not_started"]}{record.transferError && <span className="block text-amber-700 dark:text-amber-400">{record.transferError}</span>}</p>}
                </div>
              </div>

              {/* Contact info & exhibition meta */}
              <div className="mt-2.5 sm:mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5 pt-2.5 sm:pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-600 dark:text-slate-400">
                <div className="min-w-0">
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Email</span>
                  <span className="block font-medium text-slate-800 dark:text-slate-200 break-words [overflow-wrap:anywhere]">{v.email || "—"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Phone</span>
                  <span className="block font-medium text-slate-800 dark:text-slate-200 break-words [overflow-wrap:anywhere]">{v.phone || "—"}</span>
                </div>
                <div className="col-span-2 sm:col-span-1 min-w-0">
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Exhibition</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200 flex items-start gap-1 break-words [overflow-wrap:anywhere]">
                    <MapPin className="w-3 h-3 text-blue-600 shrink-0" />
                    {exhibition || "Not specified"}
                  </span>
                </div>
              </div>

              {/* Prominent Reviewer Comment for Returned Cards */}
              {record.reviewerComment && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                  <div>
                    <span className="font-semibold block">Reviewer Feedback:</span>
                    <p className="mt-0.5 text-amber-800 dark:text-amber-300">{record.reviewerComment}</p>
                  </div>
                </div>
              )}

              {/* Footer row: Attribution & Actions */}
              {record.sheetStatus === "failed" && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">Saved in Lead71. {record.sheetError?.message || "Google Sheet synchronization failed and needs attention."}</p>}
              <div className="mt-2.5 sm:mt-3 pt-2 sm:pt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 border-t border-slate-100/80 dark:border-slate-800/60">
                <span className="flex items-center gap-1.5">
                  <span>
                    Captured {capturedDate ? `${capturedDate.toLocaleDateString()} at ${capturedDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "—"}
                  </span>
                  {user?.role !== "exhibition_assistant" && <>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <span className="font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1">
                    <User className="w-3 h-3 text-slate-400" />
                    Provided by <strong className="text-slate-800 dark:text-slate-200 font-semibold">{capturerName}</strong>
                  </span>
                  </>}
                </span>

                <div className="flex items-center gap-2">
                  {/* Reviewer Action */}
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

                  {/* Capturer Action when correction requested - never shown to reviewer */}
                  {!canReview && isCorrection && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setSelected(record);
                        markCorrectionsAsViewed();
                      }}
                      className="h-8 px-3 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 text-white cursor-pointer shadow-xs flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Correct & Resubmit</span>
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
        onSuccess={(updated) => {
          if (updated && updated.id) {
            setRecords((prev) =>
              prev ? prev.map((r) => (r.id === updated.id ? { ...r, ...updated, status: updated.status } : r)) : prev
            );
          }
          setReviewRecord(null);
          void load(true);
        }}
      />

      {/* Edit modal when capturer corrects details and resubmits */}
      <EditContactModal
        isOpen={Boolean(selected)}
        setIsOpen={(open) => {
          if (!open) setSelected(null);
        }}
        record={selected}
        onSuccess={(updated) => {
          if (updated && updated.id) {
            setRecords((prev) =>
              prev ? prev.map((r) => (r.id === updated.id ? { ...r, ...updated, status: updated.status } : r)) : prev
            );
          }
          setSelected(null);
          void load(true);
        }}
      />
    </section>
  );
}
