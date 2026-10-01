import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import {
  CheckCircle2,
  XCircle,
  RotateCcw,
  AlertCircle,
  ExternalLink,
  Image as ImageIcon,
  User,
  Calendar,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { updateContact } from "@/lib/api/contacts";
import { getExhibitions, type ExhibitionOption } from "@/lib/api/exhibitions";
import { cardApi } from "@/lib/cardApi";
import { useAuth } from "@/auth/AuthContext";
import type { ContactRecord, OCRData, RecordStatus } from "@/types";

interface Props {
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
  record: ContactRecord | null;
  onSuccess?: (updated?: ContactRecord) => void;
}

interface ReviewFormData {
  fullName: string;
  companyName: string;
  jobTitle: string;
  email: string;
  phone: string;
  metAtLocation: string;
  notes: string;
  reviewerComment: string;
}

export default function ReviewContactModal({ isOpen, setIsOpen, record, onSuccess }: Props) {
  const { user } = useAuth();
  const [submittingAction, setSubmittingAction] = useState<RecordStatus | null>(null);
  const [exhibitionOptions, setExhibitionOptions] = useState<ExhibitionOption[]>([
    { label: "Select exhibition", value: "" },
  ]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const { register, handleSubmit, reset } = useForm<ReviewFormData>({
    defaultValues: {
      fullName: "",
      companyName: "",
      jobTitle: "",
      email: "",
      phone: "",
      metAtLocation: "",
      notes: "",
      reviewerComment: "",
    },
  });

  useEffect(() => {
    void getExhibitions().then((options) => {
      if (options && options.length > 0) setExhibitionOptions(options);
    });
  }, []);

  useEffect(() => {
    if (isOpen && record) {
      reset({
        fullName: record.verifiedData.fullName || "",
        companyName: record.verifiedData.companyName || "",
        jobTitle: record.verifiedData.jobTitle || "",
        email: record.verifiedData.email || "",
        phone: record.verifiedData.phone || "",
        metAtLocation: record.verifiedData.meetingContext?.metAtLocation || "",
        notes: record.verifiedData.notes || "",
        reviewerComment: record.reviewerComment || "",
      });

      // Load image if available
      if (record.isDemo) {
        setImageUrl("/demo-card.svg");
      } else if (record.hasImage) {
        let active = true;
        let url: string | null = null;
        void cardApi
          .image(record.id)
          .then((blob) => {
            if (!active) return;
            url = URL.createObjectURL(blob);
            setImageUrl(url);
          })
          .catch(() => setImageUrl(null));
        return () => {
          active = false;
          if (url) URL.revokeObjectURL(url);
        };
      } else {
        setImageUrl(null);
      }
    }
  }, [isOpen, record, reset]);

  if (!record) return null;

  const isSelfCaptured = Boolean(user?.id && record.capturedBy && user.id === record.capturedBy);
  const capturerDisplayName = record.capturedByName || "Zaid";
  const capturedDate = record.createdAt ? new Date(record.createdAt) : null;

  const handleDecision = async (nextStatus: RecordStatus, data: ReviewFormData) => {
    setSubmittingAction(nextStatus);
    try {
      const updatedVerifiedData: OCRData = {
        fullName: data.fullName?.trim() || "",
        companyName: data.companyName?.trim() || "",
        jobTitle: data.jobTitle?.trim() || "",
        email: data.email?.trim().toLowerCase() || "",
        phone: data.phone?.trim() || "",
        alternatePhone: record.verifiedData.alternatePhone || "",
        website: record.verifiedData.website || "",
        address: record.verifiedData.address || "",
        city: record.verifiedData.city || "",
        country: record.verifiedData.country || "",
        notes: data.notes?.trim() || "",
        meetingContext: {
          metAtLocation: data.metAtLocation?.trim() || "",
          notes: data.notes?.trim() || "",
        },
      };

      const updated = await updateContact(
        record.id,
        updatedVerifiedData,
        nextStatus,
        data.reviewerComment?.trim() || ""
      );

      const statusLabels: Record<string, string> = {
        approved: "Contact approved successfully.",
        correction_requested: "Returned for correction to capturer.",
        rejected: "Contact marked as rejected.",
      };

      toast.success(statusLabels[nextStatus] || "Status updated successfully.");
      setIsOpen(false);
      if (onSuccess) {
        onSuccess(updated as unknown as ContactRecord);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to update review status. Please try again.");
    } finally {
      setSubmittingAction(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-4xl w-[94vw] p-5 sm:p-7 rounded-2xl border border-slate-200/90 shadow-2xl bg-white dark:border-slate-800 dark:bg-slate-900 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <DialogHeader className="text-left pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                Reviewer Workspace
              </p>
              <DialogTitle className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                Review Contact Details
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Inspect captured details, verify information, and decide whether to approve, return for correction, or reject.
              </DialogDescription>
            </div>

            {/* Badges: Status + Provided By */}
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border ${
                  record.status === "approved"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-300"
                    : record.status === "correction_requested"
                    ? "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:border-amber-800 dark:text-amber-300"
                    : record.status === "rejected"
                    ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:border-rose-800 dark:text-rose-300"
                    : "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:border-blue-800 dark:text-blue-300"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    record.status === "approved"
                      ? "bg-emerald-600"
                      : record.status === "correction_requested"
                      ? "bg-amber-600"
                      : record.status === "rejected"
                      ? "bg-rose-600"
                      : "bg-blue-600"
                  }`}
                />
                {record.status === "approved"
                  ? "Approved"
                  : record.status === "correction_requested"
                  ? "Needs Correction"
                  : record.status === "rejected"
                  ? "Rejected"
                  : "Pending Review"}
              </span>

              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">
                <User className="w-3 h-3 text-slate-500" />
                Provided by <strong className="font-semibold text-slate-900 dark:text-white">{capturerDisplayName}</strong>
              </span>
            </div>
          </div>
        </DialogHeader>

        {/* Self-approval Warning */}
        {isSelfCaptured && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <span className="font-semibold">Self-approval notice: </span>
              <span>You captured this business card. Protocol requires a different reviewer to approve it. You can still return it for correction or reject it.</span>
            </div>
          </div>
        )}

        {/* Form Body - 2 Columns on Desktop */}
        <form className="pt-4 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column (5 of 12 cols): Card Reference & Capture Metadata */}
            <div className="lg:col-span-5 space-y-4">
              {/* Card Image Reference */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                    Business Card Reference
                  </span>
                  {imageUrl && (
                    <a
                      href={imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-medium text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
                    >
                      <span>Full view</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                {imageUrl ? (
                  <div className="overflow-hidden rounded-lg border border-slate-200/80 bg-white p-2 text-center dark:border-slate-800 dark:bg-slate-900">
                    <img
                      src={imageUrl}
                      alt="Scanned Business Card"
                      className="max-h-48 w-full object-contain mx-auto rounded"
                    />
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg dark:border-slate-800">
                    No card image stored
                  </div>
                )}
              </div>

              {/* Attribution & Context Card */}
              <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 text-xs space-y-2 dark:border-slate-800 dark:bg-slate-900/60 shadow-2xs">
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                  <span className="flex items-center gap-1 text-[11px]">
                    <User className="w-3 h-3 text-slate-400" />
                    Captured by:
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {capturerDisplayName}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                  <span className="flex items-center gap-1 text-[11px]">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    Captured on:
                  </span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {capturedDate ? capturedDate.toLocaleDateString() : "—"}
                  </span>
                </div>

                {record.originalFileName && (
                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-[11px]">Source file:</span>
                    <span className="font-mono text-[11px] truncate max-w-[140px] text-slate-500">
                      {record.originalFileName}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column (7 of 12 cols): Structured Details & Feedback */}
            <div className="lg:col-span-7 space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Contact Name */}
                <div className="space-y-1">
                  <Label htmlFor="rev-fullName" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Contact Name *
                  </Label>
                  <Input
                    id="rev-fullName"
                    {...register("fullName", { required: true })}
                    className="h-9 text-xs sm:text-sm rounded-xl border-slate-200 dark:border-slate-800"
                    placeholder="Full name"
                  />
                </div>

                {/* Job Title */}
                <div className="space-y-1">
                  <Label htmlFor="rev-jobTitle" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Job Title
                  </Label>
                  <Input
                    id="rev-jobTitle"
                    {...register("jobTitle")}
                    className="h-9 text-xs sm:text-sm rounded-xl border-slate-200 dark:border-slate-800"
                    placeholder="e.g. CEO, Sales Director"
                  />
                </div>

                {/* Company Name */}
                <div className="space-y-1">
                  <Label htmlFor="rev-companyName" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Company Name *
                  </Label>
                  <Input
                    id="rev-companyName"
                    {...register("companyName", { required: true })}
                    className="h-9 text-xs sm:text-sm rounded-xl border-slate-200 dark:border-slate-800"
                    placeholder="Company name"
                  />
                </div>

                {/* Exhibition Event */}
                <div className="space-y-1">
                  <Label htmlFor="rev-metAtLocation" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Exhibition Event
                  </Label>
                  <select
                    id="rev-metAtLocation"
                    {...register("metAtLocation")}
                    className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs sm:text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  >
                    {exhibitionOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Email Address */}
                <div className="space-y-1">
                  <Label htmlFor="rev-email" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Email Address
                  </Label>
                  <Input
                    id="rev-email"
                    type="email"
                    {...register("email")}
                    className="h-9 text-xs sm:text-sm rounded-xl border-slate-200 dark:border-slate-800"
                    placeholder="name@company.com"
                  />
                </div>

                {/* Phone Number */}
                <div className="space-y-1">
                  <Label htmlFor="rev-phone" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Phone Number
                  </Label>
                  <Input
                    id="rev-phone"
                    {...register("phone")}
                    className="h-9 text-xs sm:text-sm rounded-xl border-slate-200 dark:border-slate-800"
                    placeholder="+1 555-0199"
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <Label htmlFor="rev-notes" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Notes & Context
                </Label>
                <Input
                  id="rev-notes"
                  {...register("notes")}
                  className="h-9 text-xs sm:text-sm rounded-xl border-slate-200 dark:border-slate-800"
                  placeholder="Meeting context or booth discussion notes"
                />
              </div>

              {/* Reviewer Comment */}
              <div className="space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Label htmlFor="rev-reviewerComment" className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                  <span>Reviewer Feedback / Instructions</span>
                  <span className="text-[10px] text-slate-400">Required when returning for correction</span>
                </Label>
                <Textarea
                  id="rev-reviewerComment"
                  {...register("reviewerComment")}
                  rows={2}
                  className="text-xs sm:text-sm rounded-xl border-slate-200 resize-none dark:border-slate-800"
                  placeholder="e.g. Please double check phone number format or company name spelling..."
                />
              </div>
            </div>
          </div>

          {/* Action Bar Footer */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={Boolean(submittingAction)}
              className="w-full sm:w-auto h-9 px-4 rounded-xl border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 cursor-pointer text-xs"
            >
              Cancel
            </Button>

            <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full sm:w-auto">
              {/* Reject */}
              <Button
                type="button"
                onClick={handleSubmit((data) => handleDecision("rejected", data))}
                disabled={Boolean(submittingAction)}
                className="w-full sm:w-auto h-9 px-4 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 dark:bg-rose-950/50 dark:border-rose-800 dark:text-rose-300 font-semibold text-xs cursor-pointer flex items-center justify-center gap-1.5"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>{submittingAction === "rejected" ? "Rejecting…" : "Reject"}</span>
              </Button>

              {/* Return for Correction */}
              <Button
                type="button"
                onClick={handleSubmit((data) => handleDecision("correction_requested", data))}
                disabled={Boolean(submittingAction)}
                className="w-full sm:w-auto h-9 px-4 rounded-xl bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-300 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-300 font-semibold text-xs cursor-pointer flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{submittingAction === "correction_requested" ? "Returning…" : "Return for Correction"}</span>
              </Button>

              {/* Approve */}
              <Button
                type="button"
                onClick={handleSubmit((data) => handleDecision("approved", data))}
                disabled={Boolean(submittingAction) || isSelfCaptured}
                className="w-full sm:w-auto h-9 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs cursor-pointer shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                title={isSelfCaptured ? "Self-approval is forbidden by protocol" : "Approve contact"}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{submittingAction === "approved" ? "Approving…" : "Approve Contact"}</span>
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
