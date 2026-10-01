import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { Send, AlertCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { updateContact } from "@/lib/api/contacts";
import { getExhibitions, type ExhibitionOption } from "@/lib/api/exhibitions";
import type { ContactRecord, OCRData } from "@/types";

interface Props {
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
  record: ContactRecord | null;
  onSuccess?: (updated?: ContactRecord) => void;
}

interface EditFormData {
  fullName: string;
  companyName: string;
  jobTitle: string;
  email: string;
  phone: string;
  metAtLocation: string;
  whereMet: string;
  notes: string;
}

export default function EditContactModal({ isOpen, setIsOpen, record, onSuccess }: Props) {
  const [isSaving, setIsSaving] = useState(false);
  const [exhibitionOptions, setExhibitionOptions] = useState<ExhibitionOption[]>([
    { label: "Select exhibition", value: "" },
  ]);

  const { register, handleSubmit, reset } = useForm<EditFormData>({
    defaultValues: {
      fullName: "",
      companyName: "",
      jobTitle: "",
      email: "",
      phone: "",
      metAtLocation: "",
      whereMet: "",
      notes: "",
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
        whereMet: record.verifiedData.meetingContext?.whereMet || "",
        notes: record.verifiedData.notes || "",
      });
    }
  }, [isOpen, record, reset]);

  if (!record) return null;

  const onSubmit = async (data: EditFormData) => {
    setIsSaving(true);
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
          ...record.verifiedData.meetingContext,
          metAtLocation: data.metAtLocation?.trim() || "",
          whereMet: data.whereMet?.trim() || "",
          notes: data.notes?.trim() || "",
        },
      };

      // Resubmit back to "submitted" so it re-enters the reviewer's Pending Review queue
      const nextStatus = record.status === "correction_requested" ? "submitted" : record.status;
      const updated = await updateContact(record.id, updatedVerifiedData, nextStatus);

      toast.success(
        record.status === "correction_requested"
          ? "Contact corrected and resubmitted for review!"
          : "Contact details updated successfully."
      );
      setIsOpen(false);
      if (onSuccess) onSuccess(updated as unknown as ContactRecord);
    } catch (error: any) {
      toast.error(error.message || "Failed to update contact. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-lg w-[95vw] p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xl bg-background dark:border-slate-800 max-h-[92vh] overflow-y-auto">
        <DialogHeader className="text-left space-y-1 pb-2 border-b border-slate-200 dark:border-slate-800">
          <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white">
            {record.status === "correction_requested" ? "Correct & Resubmit Contact" : "Correct Contact Details"}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
            {record.status === "correction_requested"
              ? "Review the reviewer feedback below, update the required fields, and resubmit for review."
              : "Update the approved contact information for review."}
          </DialogDescription>
        </DialogHeader>

        {/* Reviewer Feedback notice if returned for correction */}
        {record.reviewerComment && (
          <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <span className="font-semibold block">Reviewer Feedback:</span>
              <p className="mt-0.5 text-amber-800 dark:text-amber-300">{record.reviewerComment}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5 pt-2">
          {/* Exhibition Name */}
          <div className="space-y-1">
            <Label htmlFor="edit-metAtLocation" className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Exhibition / Source <span className="text-red-600" aria-hidden="true">*</span>
            </Label>
            <select
              id="edit-metAtLocation"
              {...register("metAtLocation")}
              required
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base sm:text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
            >
              {exhibitionOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
              <div className="min-w-0 space-y-1">
                <Label htmlFor="edit-whereMet">Where met / Location</Label>
                <Input id="edit-whereMet" {...register("whereMet")} placeholder="e.g. Hall 2, Booth 14 (optional)" className="text-base sm:text-sm" />
              </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Contact Name */}
            <div className="space-y-1">
              <Label htmlFor="edit-fullName" className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Contact name
              </Label>
              <Input
                id="edit-fullName"
                {...register("fullName")}
                className="h-10 text-xs sm:text-sm rounded-xl"
                placeholder="Full name"
              />
            </div>

            {/* Company Name */}
            <div className="space-y-1">
              <Label htmlFor="edit-companyName" className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Company name
              </Label>
              <Input
                id="edit-companyName"
                {...register("companyName")}
                className="h-10 text-xs sm:text-sm rounded-xl"
                placeholder="Company name"
              />
            </div>

            {/* Job Title */}
            <div className="space-y-1">
              <Label htmlFor="edit-jobTitle" className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Job title
              </Label>
              <Input
                id="edit-jobTitle"
                {...register("jobTitle")}
                className="h-10 text-xs sm:text-sm rounded-xl"
                placeholder="Job title"
              />
            </div>

            {/* Email Address */}
            <div className="space-y-1">
              <Label htmlFor="edit-email" className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Email address
              </Label>
              <Input
                id="edit-email"
                type="email"
                {...register("email")}
                className="h-10 text-xs sm:text-sm rounded-xl"
                placeholder="email@example.com"
              />
            </div>
          </div>

          {/* Phone Number */}
          <div className="space-y-1">
            <Label htmlFor="edit-phone" className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Phone number
            </Label>
            <Input
              id="edit-phone"
              type="tel"
              {...register("phone")}
              className="h-10 text-xs sm:text-sm rounded-xl"
              placeholder="+1 555-0199"
            />
          </div>

          {/* Short Notes */}
          <div className="space-y-1">
            <Label htmlFor="edit-notes" className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Short notes
            </Label>
            <textarea
              id="edit-notes"
              {...register("notes")}
              rows={2}
              className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-base sm:text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              placeholder="Discussion notes"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsOpen(false)}
              disabled={isSaving}
              className="h-9 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSaving}
              className="h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {isSaving
                  ? "Submitting…"
                  : record.status === "correction_requested"
                  ? "Resubmit for Review"
                  : "Save Changes"}
              </span>
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
