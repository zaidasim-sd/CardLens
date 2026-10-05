import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Send,
  X,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  ZoomIn,
  Mail,
  Phone,
  MapPin,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { submitContact } from "@/lib/api/contacts";
import { checkDuplicateContact } from "@/lib/duplicateChecker";
import { getExhibitions, type ExhibitionOption } from "@/lib/api/exhibitions";
import DuplicateWarningModal from "./DuplicateWarningModal";
import ViewCardModal from "@/components/verified/ViewCardModal";
import type { OCRData, ContactRecord } from "@/types";
import pilot from "@/config/pilot";

/**
 * Approved Version 1 Fields Schema:
 * - Exhibition name (metAtLocation)
 * - Contact name (fullName)
 * - Company name (companyName)
 * - Job title (jobTitle)
 * - Email address (email)
 * - Phone number (phone)
 * - Short notes (notes)
 */
const schema = z.object({
  fullName: z.string().optional(),
  companyName: z.string().optional(),
  jobTitle: z.string().optional(),
  email: z.string().optional().or(z.literal("")).superRefine((val, ctx) => {
    if (!val || val.trim() === "") return;
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(val)) {
      if (val.includes("@") && !val.split("@")[1]?.includes(".")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Missing domain extension (e.g. name@company.com)",
        });
      } else {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Please enter a valid email format",
        });
      }
    }
  }),
  phone: z.string().optional(),
  metAtLocation: z.string().trim().min(1, "Please select an exhibition / source."),
  whereMet: z.string().optional(),
  notes: z.string().optional(),
}).superRefine((data, ctx) => {
  if (!data.fullName?.trim() && !data.companyName?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Either Contact Name or Company Name is required",
      path: ["fullName"],
    });
  }
  if (!data.email?.trim() && !data.phone?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Either Email or Phone is required",
      path: ["email"],
    });
  }
});

type FormData = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
  ocrData: OCRData | null;
  rawText: string;
  originalImage: Blob | null;
  imageUrl: string;
  isDemo?: boolean;
  onSuccess: () => void;
}

export default function OCRReviewModal({
  isOpen,
  setIsOpen,
  ocrData,
  rawText,
  originalImage,
  imageUrl,
  isDemo = false,
  onSuccess,
}: Props) {
  const navigate = useNavigate();

  const [isSaving, setIsSaving] = useState(false);
  const [savedRecord, setSavedRecord] = useState<ContactRecord | null>(null);
  const [exhibitionOptions, setExhibitionOptions] = useState<ExhibitionOption[]>([
    { label: "Select exhibition", value: "" },
  ]);

  const [duplicateMatch, setDuplicateMatch] = useState<{
    record: ContactRecord;
    reason: string;
    pendingVerifiedData: OCRData;
  } | null>(null);
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [isExistingContactOpen, setIsExistingContactOpen] = useState(false);
  const [isZoomImageOpen, setIsZoomImageOpen] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, dirtyFields },
    reset,
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: ocrData?.fullName || "",
      jobTitle: ocrData?.jobTitle || "",
      companyName: ocrData?.companyName || "",
      email: ocrData?.email || "",
      phone: ocrData?.phone || "",
      metAtLocation: ocrData?.meetingContext?.metAtLocation || "",
      whereMet: ocrData?.meetingContext?.whereMet || "",
      notes: ocrData?.notes || "",
    },
  });

  const formValues = watch();

  // Load exhibition options
  useEffect(() => {
    void getExhibitions().then((options) => {
      if (options && options.length > 0) setExhibitionOptions(options);
    });
  }, []);

  useEffect(() => {
    if (isOpen && ocrData) {
      reset({
        fullName: ocrData.fullName || "",
        jobTitle: ocrData.jobTitle || "",
        companyName: ocrData.companyName || "",
        email: ocrData.email || "",
        phone: ocrData.phone || "",
        metAtLocation: ocrData.meetingContext?.metAtLocation || "",
        whereMet: ocrData.meetingContext?.whereMet || "",
        notes: ocrData.notes || "",
      });
      setSavedRecord(null);
      setDuplicateMatch(null);
    }
  }, [isOpen, ocrData, reset]);

  const saveRecordToDB = async (verifiedData: OCRData, allowDuplicate = false) => {
    setIsSaving(true);
    try {
      const isManual = !originalImage;
      const fileName = originalImage instanceof File ? originalImage.name : undefined;
      const record = await submitContact({
        originalImage: originalImage || undefined,
        originalFileName: fileName,
        rawOCRText: rawText,
        ocrData: ocrData || verifiedData,
        verifiedData,
        isDemo,
        source: isManual ? "manual" : "ocr",
        allowDuplicate,
      });
      setSavedRecord(record);
      if (["failed", "pending", "not_configured"].includes(record.sheetStatus || "")) {
        toast.warning(`Contact recorded. ${record.sheetError?.message || "Delivery to Aventure’s review register is pending; do not submit another copy."}`);
      } else {
        toast.success("Contact submitted for review");
      }
    } catch (error: any) {
      if (error.code === "DUPLICATE_FOUND" && error.duplicate) {
        setDuplicateMatch({ record: error.duplicate, reason: error.duplicate.matchReason || "A possible matching record was found while saving.", pendingVerifiedData: verifiedData });
        setIsDuplicateModalOpen(true);
        return;
      }
      toast.error(error.message || "Failed to submit contact for review. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const onSubmit = async (data: FormData) => {
    const verifiedData: OCRData = {
      fullName: data.fullName?.trim() || "",
      companyName: data.companyName?.trim() || "",
      jobTitle: data.jobTitle?.trim() || "",
      email: data.email?.trim().toLowerCase() || "",
      phone: data.phone?.trim() || "",
      alternatePhone: "",
      website: "",
      address: "",
      city: "",
      country: "",
      notes: data.notes?.trim() || "",
      meetingContext: {
        metAtLocation: data.metAtLocation?.trim() || "",
        whereMet: pilot.historicFieldsEnabled ? data.whereMet?.trim() || "" : ocrData?.meetingContext?.whereMet || "",
        notes: data.notes?.trim() || "",
      },
    };

    // Duplicate Check
    let dupResult;
    try {
      dupResult = await checkDuplicateContact(verifiedData);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Duplicate checking failed. Please try again before submitting.");
      return;
    }
    if (dupResult.isDuplicate && dupResult.matchedRecord) {
      setDuplicateMatch({
        record: dupResult.matchedRecord,
        reason: dupResult.matchReason || "Duplicate found",
        pendingVerifiedData: verifiedData,
      });
      setIsDuplicateModalOpen(true);
      return;
    }

    await saveRecordToDB(verifiedData);
  };

  const shouldFlagForVerification = (name: keyof FormData, value: string | undefined): boolean => {
    if (!value || !value.trim()) return false;
    const val = value.trim();

    if (name === "fullName") {
      if (!val.includes(" ") && val.length <= 5 && /^[A-Z0-9]+$/i.test(val)) return true;
      if (/[•@#$%&*_+=[\]{}|\\<>/0-9]/.test(val)) return true;
      const companyTerms = ["infra", "corp", "inc", "ltd", "limited", "solutions", "tech", "technologies", "systems", "group", "llc"];
      if (companyTerms.some((term) => val.toLowerCase().includes(term))) return true;
    }

    if (name === "companyName") {
      if (/^[•\-/:.,#]/.test(val)) return true;
    }

    if (name === "email") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(val)) return true;
    }

    if (name === "phone") {
      const digits = val.replace(/\D/g, "");
      if (digits.length > 0 && digits.length < 7) return true;
    }

    return false;
  };

  const renderField = (
    label: string,
    name: keyof FormData,
    type = "text",
    placeholder = ""
  ) => {
    const isEdited = Boolean(dirtyFields[name]);
    const currentValue = (formValues as any)[name];
    const needsVerification = shouldFlagForVerification(name, currentValue);

    return (
      <div key={name} className="min-w-0 space-y-1.5">
        <div className="flex justify-between items-center flex-wrap gap-1">
          <Label htmlFor={name} className="font-semibold text-slate-900 dark:text-slate-100 text-xs sm:text-sm">
            {label}
          </Label>

          {/* Clean, Quiet Verification Status Badge */}
          <div className="text-[10px] font-semibold flex items-center gap-1">
            {isEdited ? (
              <span className="text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200/80">
                ✏ Edited
              </span>
            ) : needsVerification ? (
              <span className="text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md flex items-center gap-1 border border-amber-200">
                <AlertCircle className="w-3 h-3 text-amber-600" /> Please verify
              </span>
            ) : currentValue ? (
              <span className="text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200/60 flex items-center gap-1">
                Extracted
              </span>
            ) : null}
          </div>
        </div>

        <Input
          id={name}
          type={type}
          {...register(name)}
          className={`h-11 min-w-0 text-base sm:text-sm rounded-xl ${errors[name]
            ? "border-red-500 focus-visible:ring-red-500"
            : isEdited
              ? "border-amber-300 focus-visible:ring-amber-300 font-medium"
              : needsVerification
                ? "border-amber-300 dark:border-amber-900/60 bg-amber-50/20"
                : "border-slate-200 dark:border-slate-800"
            }`}
          placeholder={placeholder || `Enter ${label.toLowerCase()}`}
        />
        {errors[name] && (
          <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-1">
            {errors[name]?.message}
          </p>
        )}
      </div>
    );
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent
          className={
            savedRecord
              ? "max-w-md w-[92vw] sm:max-w-[460px] p-5 sm:p-7 rounded-2xl border border-slate-200 shadow-xl bg-background overflow-hidden dark:border-slate-800"
              : "w-[95vw] max-w-[95vw] sm:max-w-[90vw] lg:max-w-5xl max-h-[92dvh] sm:max-h-[90dvh] p-0 overflow-hidden flex flex-col bg-background rounded-2xl border border-slate-200 shadow-xl dark:border-slate-800"
          }
        >
          {/* ── SUCCESS STATE VIEW ──────────────────────────────────── */}
          {savedRecord ? (
            <div className="flex flex-col items-center text-center py-2 sm:py-3 px-1">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 flex items-center justify-center mb-3 border border-emerald-200">
                <CheckCircle2 className="w-6 h-6" />
              </div>

              <div className="space-y-1 max-w-sm mx-auto">
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
                  Contact submitted for review
                </h3>
                {savedRecord.recordId?.startsWith("L71-") && <p className="text-xs font-medium text-[#248da3] tabular-nums">Reference: {savedRecord.recordId}</p>}
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Your contact will appear in Aventure’s review register. Capture date, time, and user account have been recorded automatically.
                </p>
              </div>

              {/* Submitted Contact Summary Card */}
              <div className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/60 text-left space-y-2.5 my-4 text-xs">
                <div className="space-y-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-semibold text-sm text-slate-900 dark:text-white">
                      {savedRecord.verifiedData.fullName || savedRecord.verifiedData.companyName || "Submitted Contact"}
                    </h4>
                    {savedRecord.isDemo && (
                      <span className="shrink-0 text-[10px] font-semibold bg-slate-900 text-white px-2 py-0.5 rounded-md">
                        Demo
                      </span>
                    )}
                  </div>
                  {savedRecord.verifiedData.jobTitle && (
                    <p className="text-slate-600 dark:text-slate-300 font-medium">
                      {savedRecord.verifiedData.jobTitle}
                    </p>
                  )}
                  {savedRecord.verifiedData.companyName && (
                    <p className="text-slate-500 dark:text-slate-400">
                      {savedRecord.verifiedData.companyName}
                    </p>
                  )}
                </div>

                {(savedRecord.verifiedData.email || savedRecord.verifiedData.phone) && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1 text-slate-600 dark:text-slate-400">
                    {savedRecord.verifiedData.email && (
                      <div className="flex items-center gap-1.5 truncate">
                        <Mail className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                        <span className="truncate">{savedRecord.verifiedData.email}</span>
                      </div>
                    )}
                    {savedRecord.verifiedData.phone && (
                      <div className="flex items-center gap-1.5 truncate">
                        <Phone className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                        <span>{savedRecord.verifiedData.phone}</span>
                      </div>
                    )}
                  </div>
                )}

                {savedRecord.verifiedData.meetingContext?.metAtLocation && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 shrink-0 text-blue-600" />
                    <span>Exhibition: {savedRecord.verifiedData.meetingContext.metAtLocation}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2 w-full">
                <Button
                  size="default"
                  className="w-full font-semibold text-xs h-10 rounded-xl bg-blue-600 text-white hover:bg-blue-700 shadow-sm cursor-pointer"
                  onClick={onSuccess}
                >
                  Scan Another Card
                </Button>

                {/* SUBMISSION-ONLY PILOT: preserve the queue action for restoration. */}
                {!pilot.submissionOnlyEnabled && <Button
                  variant="outline"
                  size="default"
                  className="w-full font-semibold text-xs h-10 rounded-xl gap-1.5 border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                  onClick={() => {
                    setIsOpen(false);
                    onSuccess();
                    navigate("/submissions");
                  }}
                >
                  View Review Queue <ArrowRight className="w-3.5 h-3.5" />
                </Button>}
              </div>
            </div>
          ) : (
            /* ── REVIEW FORM VIEW ────────────────────────────────────── */
            <>
              {/* Header */}
              <DialogHeader className="shrink-0 border-b border-slate-200 bg-slate-50/70 p-4 pb-3 dark:bg-slate-900/50 dark:border-slate-800 sm:p-5 sm:pb-3.5">
                <div className="pr-8 flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <DialogTitle className="text-lg md:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                      Review Contact
                    </DialogTitle>
                    {isDemo && (
                      <span className="text-[10px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                        Demo
                      </span>
                    )}
                  </div>
                  <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
                    Check your contact details, then submit for review. Your contact will appear in Aventure’s review register.
                  </DialogDescription>
                </div>
              </DialogHeader>

              {/* Modal Body: Split view on Desktop */}
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-50/40 lg:flex-row lg:overflow-hidden">
                {/* Left: Card Preview Panel */}
                {originalImage && imageUrl && (
                  <div className="group relative h-[180px] min-h-[180px] shrink-0 overflow-hidden border-b border-slate-200 bg-slate-100/80 p-3 dark:bg-slate-900/40 dark:border-slate-800 sm:h-[220px] sm:min-h-[220px] sm:p-4 lg:h-auto lg:min-h-0 lg:w-5/12 lg:border-b-0 lg:border-r">
                    <div className="absolute inset-3 flex items-center justify-center sm:inset-4 lg:inset-6">
                      <img
                        src={imageUrl}
                        alt="Business Card Preview"
                        className="h-full w-full rounded-xl border border-slate-200 object-contain shadow-xs bg-white dark:border-slate-800 dark:bg-slate-950"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsZoomImageOpen(true)}
                      className="absolute right-4 top-4 flex items-center gap-1 rounded-lg border border-slate-200 bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-700 shadow-xs backdrop-blur-xs hover:bg-white cursor-pointer dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-300"
                    >
                      <ZoomIn className="w-3.5 h-3.5 text-blue-600" /> Full View
                    </button>
                  </div>

                )}
                {/* Right: Approved Version 1 Form Fields Panel */}
                <div className="min-w-0 shrink-0 bg-white p-4 sm:p-5 md:p-6 lg:flex-1 lg:shrink lg:overflow-y-auto dark:bg-slate-950">
                  <form
                    id="ocr-review-form"
                    onSubmit={handleSubmit(onSubmit)}
                    className="space-y-4"
                    noValidate
                  >
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 text-xs text-slate-600 dark:text-slate-400">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">Form requirement:</p>
                      <p className="mt-0.5">Enter either the contact name or company name, and at least one contact method: email or phone.</p>
                    </div>
                    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                      {/* 1. Exhibition Name (Approved Field) */}
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="metAtLocation" className="font-semibold text-slate-900 dark:text-slate-100 text-xs sm:text-sm">
                          Exhibition / Source <span className="text-red-600" aria-hidden="true">*</span>
                        </Label>
                        <select
                          id="metAtLocation"
                          {...register("metAtLocation")}
                          aria-required="true"
                          aria-invalid={Boolean(errors.metAtLocation)}
                          aria-describedby={errors.metAtLocation ? "exhibition-error" : undefined}
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base sm:text-sm text-slate-900 shadow-2xs focus:border-blue-600 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                        >
                          {exhibitionOptions.map((opt) => (
                            <option key={opt.value} value={opt.value} disabled={!opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        {errors.metAtLocation && (
                          <p id="exhibition-error" role="alert" className="text-xs text-red-600">
                            {errors.metAtLocation.message}
                          </p>
                        )}
                      </div>

                      {/* 2. Contact Name */}
                      {renderField("Contact name", "fullName", "text", "")}

                      {/* 3. Company Name */}
                      {renderField("Company name", "companyName", "text", "")}

                      {/* 4. Job Title */}
                      {renderField("Job title", "jobTitle", "text", "")}

                      {/* 5. Email Address */}
                      {renderField("Email address", "email", "email", "")}

                      {/* 6. Phone Number */}
                      <div className="sm:col-span-2">
                        {renderField("Phone number", "phone", "tel", "")}
                      </div>

                      {/* 7. Short Notes */}
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="notes" className="font-semibold text-slate-900 dark:text-slate-100 text-xs sm:text-sm">
                          Short notes
                        </Label>
                        <textarea
                          id="notes"
                          {...register("notes")}
                          rows={2}
                          placeholder="Optional notes or discussion points"
                          className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-base sm:text-sm text-slate-900 shadow-2xs focus:border-blue-600 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                        />
                      </div>
                    </div>
                  </form>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/90 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xs dark:bg-slate-900/90 dark:border-slate-800 sm:gap-3 sm:p-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsOpen(false)}
                  disabled={isSaving}
                  className="h-10 rounded-xl border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
                >
                  <X className="w-4 h-4 mr-1 text-slate-500" /> Cancel
                </Button>

                <Button
                  type="submit"
                  form="ocr-review-form"
                  disabled={isSaving}
                  className="h-10 rounded-xl bg-blue-600 hover:bg-blue-700 px-5 text-xs font-semibold text-white shadow-sm cursor-pointer"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> Submitting…
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-1.5" /> Submit for review
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Duplicate Warning Modal */}
      {duplicateMatch && (
        <DuplicateWarningModal
          isOpen={isDuplicateModalOpen}
          onClose={() => setIsDuplicateModalOpen(false)}
          existingContact={duplicateMatch.record}
          matchReason={duplicateMatch.reason}
          onSaveAnyway={() => {
            setIsDuplicateModalOpen(false);
            saveRecordToDB(duplicateMatch.pendingVerifiedData, true);
          }}
          onViewExisting={() => {
            setIsDuplicateModalOpen(false);
            setIsExistingContactOpen(true);
          }}
        />
      )}

      {/* High-Resolution View Card Modal */}
      <ViewCardModal
        isOpen={isExistingContactOpen}
        setIsOpen={(open) => {
          setIsExistingContactOpen(open);
          if (!open) setIsDuplicateModalOpen(true);
        }}
        record={duplicateMatch?.record || null}
        onViewQueue={pilot.submissionOnlyEnabled ? undefined : () => {
          setIsExistingContactOpen(false);
          setIsOpen(false);
          onSuccess();
          navigate("/submissions");
        }}
      />

      {/* Zoom Image Dialog */}
      <Dialog open={isZoomImageOpen} onOpenChange={setIsZoomImageOpen}>
        <DialogContent className="max-w-4xl p-2 bg-background border-slate-200 dark:border-slate-800">
          <div className="relative flex items-center justify-center max-h-[85vh] overflow-hidden">
            <img
              src={imageUrl}
              alt="Business card high res"
              className="max-h-[80vh] w-auto object-contain rounded-lg"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
