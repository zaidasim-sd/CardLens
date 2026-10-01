import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import {
  CheckCircle2,
  XCircle,
  RotateCcw,
  AlertCircle,
  ExternalLink,
  Image as ImageIcon,
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
  onSuccess?: () => void;
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
  const [showImagePreview, setShowImagePreview] = useState(false);

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

      await updateContact(
        record.id,
        updatedVerifiedData,
        nextStatus,
        data.reviewerComment?.trim() || ""
      );

      const statusLabels: Record<string, string> = {
        approved: "Contact approved successfully.",
        correction_requested: "Returned for correction to capturer.",
        rejected: "Contact rejected.",
      };

      toast.success(statusLabels[nextStatus] || "Status updated successfully.");
      setIsOpen(false);
      if (onSuccess) onSuccess();
    } catch (error: any) {
      toast.error(error.message || "Failed to update review status. Please try again.");
    } finally {
      setSubmittingAction(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-2xl w-[95vw] p-5 sm:p-7 rounded-2xl border border-slate-200 shadow-2xl bg-white dark:border-slate-800 dark:bg-slate-900 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <DialogHeader className="text-left pb-4 border-b border-slate-100 dark:border-slate-800 space-y-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                Reviewer Workspace
              </p>
              <DialogTitle className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                Review Contact Details
              </DialogTitle>
            </div>
            <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:border-blue-800 dark:text-blue-300">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
              {record.sheetStatus || record.status}
            </span>
          </div>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
            Verify the scanned contact information, make any necessary adjustments, and decide whether to approve, return for correction, or reject.
          </DialogDescription>
        </DialogHeader>

        {/* Card Image Thumbnail if available */}
        {imageUrl && (
          <div className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                Scanned Card Reference
              </span>
              <button
                type="button"
                onClick={() => setShowImagePreview(!showImagePreview)}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1 cursor-pointer"
              >
                {showImagePreview ? "Hide Image" : "View Image"}
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
            {showImagePreview && (
              <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 text-center">
                <img
                  src={imageUrl}
                  alt="Scanned Business Card"
                  className="max-h-56 mx-auto object-contain p-2"
                />
              </div>
            )}
          </div>
        )}

        {/* Self-approval Warning */}
        {isSelfCaptured && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <span className="font-semibold">Capturer notice: </span>
              <span>You personally captured this card. CardSnap protocol requires a different reviewer to approve it. You may still return it for correction or reject it.</span>
            </div>
          </div>
        )}

        {/* Form Fields */}
        <form className="space-y-4 pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Full Name */}
            <div className="space-y-1">
              <Label htmlFor="review-fullName" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Contact Name *
              </Label>
              <Input
                id="review-fullName"
                {...register("fullName", { required: true })}
                className="h-10 text-xs sm:text-sm rounded-xl border-slate-200 dark:border-slate-800"
                placeholder="e.g. John Doe"
              />
            </div>

            {/* Job Title */}
            <div className="space-y-1">
              <Label htmlFor="review-jobTitle" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Job Title
              </Label>
              <Input
                id="review-jobTitle"
                {...register("jobTitle")}
                className="h-10 text-xs sm:text-sm rounded-xl border-slate-200 dark:border-slate-800"
                placeholder="e.g. Procurement Manager"
              />
            </div>

            {/* Company Name */}
            <div className="space-y-1">
              <Label htmlFor="review-companyName" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Company Name *
              </Label>
              <Input
                id="review-companyName"
                {...register("companyName", { required: true })}
                className="h-10 text-xs sm:text-sm rounded-xl border-slate-200 dark:border-slate-800"
                placeholder="e.g. Acme Aerospace"
              />
            </div>

            {/* Exhibition Location */}
            <div className="space-y-1">
              <Label htmlFor="review-metAtLocation" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Exhibition Event
              </Label>
              <select
                id="review-metAtLocation"
                {...register("metAtLocation")}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs sm:text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              >
                {exhibitionOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Email */}
            <div className="space-y-1">
              <Label htmlFor="review-email" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Email Address
              </Label>
              <Input
                id="review-email"
                type="email"
                {...register("email")}
                className="h-10 text-xs sm:text-sm rounded-xl border-slate-200 dark:border-slate-800"
                placeholder="e.g. john@example.com"
              />
            </div>

            {/* Phone */}
            <div className="space-y-1">
              <Label htmlFor="review-phone" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Phone Number
              </Label>
              <Input
                id="review-phone"
                {...register("phone")}
                className="h-10 text-xs sm:text-sm rounded-xl border-slate-200 dark:border-slate-800"
                placeholder="e.g. +1 555-0199"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label htmlFor="review-notes" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Meeting Context & Notes
            </Label>
            <Input
              id="review-notes"
              {...register("notes")}
              className="h-10 text-xs sm:text-sm rounded-xl border-slate-200 dark:border-slate-800"
              placeholder="e.g. Met at Booth 412, interested in engine turbine components"
            />
          </div>

          {/* Reviewer Comment */}
          <div className="space-y-1 pt-1 border-t border-slate-100 dark:border-slate-800">
            <Label htmlFor="review-reviewerComment" className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between">
              <span>Reviewer Comment / Feedback</span>
              <span className="text-[10px] font-normal text-slate-400">Recorded with decision</span>
            </Label>
            <Textarea
              id="review-reviewerComment"
              {...register("reviewerComment")}
              rows={2}
              className="text-xs sm:text-sm rounded-xl border-slate-200 resize-none dark:border-slate-800"
              placeholder="Enter feedback or explanation if returning for correction or rejecting..."
            />
          </div>

          {/* Decision Buttons */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={Boolean(submittingAction)}
              className="w-full sm:w-auto h-10 px-4 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 cursor-pointer text-xs"
            >
              Cancel
            </Button>

            <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
              {/* Reject Button */}
              <Button
                type="button"
                onClick={handleSubmit((data) => handleDecision("rejected", data))}
                disabled={Boolean(submittingAction)}
                className="w-full sm:w-auto h-10 px-4 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 dark:bg-rose-950/50 dark:border-rose-800 dark:text-rose-300 font-semibold text-xs cursor-pointer flex items-center justify-center gap-1.5"
              >
                <XCircle className="w-4 h-4" />
                <span>{submittingAction === "rejected" ? "Rejecting…" : "Reject"}</span>
              </Button>

              {/* Return for Correction */}
              <Button
                type="button"
                onClick={handleSubmit((data) => handleDecision("correction_requested", data))}
                disabled={Boolean(submittingAction)}
                className="w-full sm:w-auto h-10 px-4 rounded-xl bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-300 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-300 font-semibold text-xs cursor-pointer flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{submittingAction === "correction_requested" ? "Returning…" : "Return for Correction"}</span>
              </Button>

              {/* Approve Button */}
              <Button
                type="button"
                onClick={handleSubmit((data) => handleDecision("approved", data))}
                disabled={Boolean(submittingAction) || isSelfCaptured}
                className="w-full sm:w-auto h-10 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs cursor-pointer shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
                title={isSelfCaptured ? "You cannot approve a card you captured" : "Approve contact for CRM transfer"}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{submittingAction === "approved" ? "Approving…" : "Approve Contact"}</span>
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
