import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Send, X, AlertCircle, CheckCircle2, ArrowRight, RefreshCw, ZoomIn, ChevronDown, Calendar, ChevronLeft, Mail } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cardApi } from "@/lib/cardApi";
import { checkDuplicateContact } from "@/lib/duplicateChecker";
import DuplicateWarningModal from "./DuplicateWarningModal";
import ViewCardModal from "@/components/verified/ViewCardModal";
import type { OCRData, ContactRecord } from "@/types";
import { apiFetch } from "@/lib/api";

const schema = z.object({
  fullName: z.string().optional(),
  companyName: z.string().optional(),
  email: z.string().optional().or(z.literal("")).superRefine((val, ctx) => {
    if (!val || val.trim() === "") return;
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(val)) {
      if (val.includes("@") && !val.split("@")[1]?.includes(".")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Missing domain extension like .com at end (e.g. daniel.rahman@aerosyntech.com)",
        });
      } else {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid email format (dots in name are allowed, e.g. daniel.rahman@aerosyntech.com)",
        });
      }
    }
  }),
  phone: z.string().optional(),
  jobTitle: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),

  // Meeting Context fields
  metAtLocation: z.string().optional(),
}).superRefine((data, ctx) => {
  if (!data.fullName && !data.companyName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Either Full Name or Company Name is required",
      path: ["fullName"],
    });
  }
  if (!data.email && !data.phone) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Either Email or Phone is required",
      path: ["email"],
    });
  }
});

type FormData = z.infer<typeof schema>;

export function ModernContactTypeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, buttonTop: 0, left: 0, width: 0, openUp: false });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const options = [
    { label: "None", value: "", desc: "No category assigned", badgeBg: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
    { label: "Prospect", value: "Prospect", desc: "", badgeBg: "bg-slate-900/10 text-slate-900 dark:bg-white/10 dark:text-white" },
    { label: "Customer", value: "Customer", desc: "", badgeBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
    { label: "Supplier", value: "Supplier", desc: "", badgeBg: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
    { label: "Partner", value: "Partner", desc: "", badgeBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
    { label: "Other", value: "Other", desc: "", badgeBg: "bg-slate-500/10 text-slate-600 dark:text-slate-400" },
  ];

  const selected = options.find((o) => o.value === value) || options[0];

  const handleOpen = () => {
    if (buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      const panelH = options.length * 52 + 16;
      setPos({ top: r.bottom + 2, buttonTop: r.top, left: r.left, width: r.width, openUp: spaceBelow < panelH });
    }
    setIsOpen((o) => !o);
  };

  useEffect(() => {
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        panelRef.current && !panelRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleOpen}
        className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 text-sm text-slate-900 dark:text-slate-100 shadow-xs hover:border-slate-900 dark:hover:border-slate-400 transition-all cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-md ${selected.badgeBg}`}>{selected.label}</span>
          <span className="text-xs text-slate-500 font-normal hidden sm:inline">{selected.desc}</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-500 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", top: pos.openUp ? undefined : pos.top, bottom: pos.openUp ? (window.innerHeight - pos.buttonTop + 2) : undefined, left: pos.left, width: pos.width, zIndex: 99999 }}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 shadow-2xl space-y-0.5 animate-in fade-in zoom-in-95 max-h-72 overflow-y-auto"
        >
          {options.map((opt) => {
            const isSel = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange(opt.value); setIsOpen(false); }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${isSel
                  ? "bg-slate-900/10 text-slate-900 dark:bg-white/10 dark:text-white"
                  : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200"
                  }`}
              >
                <div>
                  <div className="text-xs font-medium">{opt.label}</div>
                  {opt.desc && <div className="text-[11px] text-slate-500">{opt.desc}</div>}
                </div>
                {isSel && <CheckCircle2 className="w-4 h-4 text-slate-900 dark:text-white shrink-0" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Generic reusable modern select ───────────────────────────────────────────
export function ModernFieldSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  options: { label: string; value: string; desc?: string }[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, buttonTop: 0, left: 0, width: 0, openUp: false });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const allOptions = [{ label: "None", value: "", desc: "Not specified" }, ...options];
  const selected = allOptions.find((o) => o.value === value) || allOptions[0];

  const handleOpen = () => {
    if (buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      const panelH = Math.min(allOptions.length, 6) * 52 + 16;
      setPos({ top: r.bottom + 2, buttonTop: r.top, left: r.left, width: r.width, openUp: spaceBelow < panelH });
    }
    setIsOpen((o) => !o);
  };

  useEffect(() => {
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        panelRef.current && !panelRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleOpen}
        className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 text-sm shadow-xs hover:border-slate-900 dark:hover:border-slate-400 transition-all cursor-pointer"
      >
        <span className={`text-xs font-medium truncate ${value ? "text-slate-900 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"}`}>
          {value ? selected.label : placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-500 shrink-0 ml-2 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", top: pos.openUp ? undefined : pos.top, bottom: pos.openUp ? (window.innerHeight - pos.buttonTop + 2) : undefined, left: pos.left, width: pos.width, zIndex: 99999 }}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 shadow-2xl space-y-0.5 animate-in fade-in zoom-in-95 max-h-64 overflow-y-auto"
        >
          {allOptions.map((opt) => {
            const isSel = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange(opt.value); setIsOpen(false); }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${isSel
                  ? "bg-slate-900/10 text-slate-900 dark:bg-white/10 dark:text-white"
                  : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200"
                  }`}
              >
                <div>
                  <div className="text-xs font-medium">{opt.label}</div>
                  {opt.desc && <div className="text-[11px] text-slate-500">{opt.desc}</div>}
                </div>
                {isSel && <CheckCircle2 className="w-4 h-4 text-slate-900 dark:text-white shrink-0" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

// Option lists ─────────────────────────────────────────────────────────────────
export const MET_AT_OPTIONS = [
  { label: "Event A", value: "Event A", desc: "Demonstration data" },
  { label: "Event B", value: "Event B", desc: "Demonstration data" },
  { label: "Other source", value: "Other source", desc: "Demonstration data" },
];

export const PRODUCT_INTEREST_OPTIONS = [
  { label: "Aircraft Components & Rotables", value: "Aircraft Components & Rotables" },
  { label: "Avionics & Aircraft Components", value: "Avionics & Aircraft Components" },
  { label: "Rotables & Repairables", value: "Rotables & Repairables" },
  { label: "Airframe & Engine Components", value: "Airframe & Engine Components" },

];

export const RELATIONSHIP_OWNER_OPTIONS = [
  { label: "Sales Team", value: "Sales Team" },
  { label: "Michael R.", value: "Michael R." },
  { label: "Sarah K.", value: "Sarah K." },
  { label: "Daniel H.", value: "Daniel H." },
  { label: "James P.", value: "James P." },
];
// ──────────────────────────────────────────────────────────────────────────────

export function ModernDatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const getValidDate = (val: string) => {
    if (val && typeof val === "string") {
      const parts = val.split("-");
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        if (!isNaN(y) && !isNaN(m) && !isNaN(d) && y > 1900 && y < 2100 && m >= 0 && m <= 11 && d >= 1 && d <= 31) {
          return new Date(y, m, d);
        }
      }
    }
    return new Date();
  };

  const initialDate = getValidDate(value);
  const [viewDate, setViewDate] = useState<Date>(
    () => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1)
  );

  useEffect(() => {
    if (value) {
      const d = getValidDate(value);
      setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const setPreset = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const formatted = d.toISOString().split("T")[0];
    onChange(formatted);
    setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
    setIsOpen(false);
  };

  const safeYear = !isNaN(viewDate.getFullYear()) ? viewDate.getFullYear() : new Date().getFullYear();
  const safeMonth = !isNaN(viewDate.getMonth()) ? viewDate.getMonth() : new Date().getMonth();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const daysInMonth = new Date(safeYear, safeMonth + 1, 0).getDate();
  const firstDayIndex = new Date(safeYear, safeMonth, 1).getDay();

  const prevMonth = () => setViewDate(new Date(safeYear, safeMonth - 1, 1));
  const nextMonth = () => setViewDate(new Date(safeYear, safeMonth + 1, 1));

  const formatDisplay = (val: string) => {
    if (!val) return "Select follow-up date";
    const parts = val.split("-");
    if (parts.length !== 3) return val;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return val;
    const dateObj = new Date(y, m, d);
    return dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 text-sm font-semibold text-slate-900 dark:text-slate-100 shadow-xs hover:border-slate-900 dark:hover:border-slate-400 focus:border-slate-900 transition-all cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-900 dark:text-white" />
          <span>{formatDisplay(value)}</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute bottom-full mb-2 sm:bottom-auto sm:top-full sm:mt-2 left-0 z-[9999] w-72 sm:w-80 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/98 dark:bg-slate-900/98 p-4 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95">
          {/* Quick Presets Header */}
          <div className="flex items-center justify-between gap-1 pb-3 mb-3 border-b border-slate-100 dark:border-slate-800">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Presets:</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPreset(0)}
                className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-900 hover:text-white dark:hover:bg-white dark:hover:text-slate-900 transition-all cursor-pointer"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setPreset(3)}
                className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-900/10 text-slate-900 dark:bg-white/10 dark:text-white hover:bg-slate-900 hover:text-white dark:hover:bg-white dark:hover:text-slate-900 transition-all cursor-pointer"
              >
                +3 Days
              </button>
              <button
                type="button"
                onClick={() => setPreset(7)}
                className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-900/10 text-slate-900 dark:bg-white/10 dark:text-white hover:bg-slate-900 hover:text-white dark:hover:bg-white dark:hover:text-slate-900 transition-all cursor-pointer"
              >
                +1 Wk
              </button>
              <button
                type="button"
                onClick={() => setPreset(14)}
                className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-900/10 text-slate-900 dark:bg-white/10 dark:text-white hover:bg-slate-900 hover:text-white dark:hover:bg-white dark:hover:text-slate-900 transition-all cursor-pointer"
              >
                +2 Wks
              </button>
            </div>
          </div>

          {/* Month Header */}
          <div className="flex items-center justify-between mb-3 px-1">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
              {monthNames[safeMonth]} {safeYear}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <span key={d} className="text-[10px] font-semibold text-slate-400">
                {d}
              </span>
            ))}
          </div>

          {/* Day Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {Array.from({ length: firstDayIndex }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const formattedDate = `${safeYear}-${String(safeMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
              const isSelected = value === formattedDate;
              return (
                <button
                  key={dayNum}
                  type="button"
                  onClick={() => {
                    onChange(formattedDate);
                    setIsOpen(false);
                  }}
                  className={`h-7 w-7 rounded-lg text-xs font-bold flex items-center justify-center transition-all cursor-pointer ${isSelected
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-md shadow-slate-900/30"
                    : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                    }`}
                >
                  {dayNum}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
  ocrData: OCRData;
  rawText: string;
  originalImage?: File | Blob | null;
  imageUrl: string;
  onSuccess: () => void;
  isDemo?: boolean;
}

export default function OCRReviewModal({
  isOpen,
  setIsOpen,
  ocrData,
  rawText,
  originalImage,
  imageUrl,
  onSuccess,
  isDemo = false,
}: Props) {
  const navigate = useNavigate();

  const [isSaving, setIsSaving] = useState(false);
  const [savedRecord, setSavedRecord] = useState<ContactRecord | null>(null);
  const [duplicateMatch, setDuplicateMatch] = useState<{
    record: ContactRecord;
    reason: string;
    pendingVerifiedData: OCRData;
  } | null>(null);
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [isExistingContactOpen, setIsExistingContactOpen] = useState(false);
  const [isZoomImageOpen, setIsZoomImageOpen] = useState(false);
  const [reviewers, setReviewers] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [assignedReviewerId, setAssignedReviewerId] = useState("");

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
      country: ocrData?.country || "",
      notes: ocrData?.notes || "",
      metAtLocation: "",
    },
  });

  const formValues = watch();

  useEffect(() => {
    if (isOpen && ocrData) {
      reset({
        fullName: ocrData.fullName || "",
        jobTitle: ocrData.jobTitle || "",
        companyName: ocrData.companyName || "",
        email: ocrData.email || "",
        phone: ocrData.phone || "",
        country: ocrData.country || "",
        notes: ocrData.notes || "",
        metAtLocation: "",
      });
      setSavedRecord(null);
      setDuplicateMatch(null);
    }
  }, [isOpen, ocrData, reset]);

  useEffect(() => {
    if (!isOpen) return;
    void apiFetch("/api/users?action=reviewers")
      .then((body) => {
        setReviewers(body.users || []);
        setAssignedReviewerId((current) => current || body.users?.[0]?.id || "");
      })
      .catch(() => setReviewers([]));
  }, [isOpen]);

  const saveRecordToDB = async (verifiedData: OCRData, allowDuplicate = false) => {
    setIsSaving(true);
    try {
      const isManual = !originalImage;
      const fileName = originalImage instanceof File ? originalImage.name : undefined;
      if (!assignedReviewerId) throw new Error("Choose a reviewer");
      const record = await cardApi.create({ originalImage: originalImage || undefined, originalFileName: fileName, rawOCRText: rawText, ocrData, verifiedData, assignedReviewerId, isDemo, source: isManual ? "manual" : "ocr", allowDuplicate });
      setSavedRecord(record);
      toast.success("Contact submitted for review");
    } catch (error) {
      toast.error("Failed to submit contact for review. Please try again.");
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
      country: data.country?.trim() || "",
      notes: data.notes?.trim() || "",
      meetingContext: {
        metAtLocation: data.metAtLocation?.trim() || "",
        notes: data.notes?.trim() || "",
      }
    };

    // Duplicate Check
    const dupResult = await checkDuplicateContact(verifiedData);
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
    if (!value || !value.trim()) return true;

    const val = value.trim();

    if (name === "fullName") {
      // 1. Single word without space and <= 5 letters (e.g. ATECH, TECH, CEO) -> suspicious as full name
      if (!val.includes(" ") && val.length <= 5 && /^[A-Z0-9]+$/i.test(val)) return true;
      // 2. Contains non-alphanumeric symbols like bullets, @, www, http, numbers
      if (/[•@#\$%^&\*_\+=\[\]{}|\\<>\/0-9]/.test(val)) return true;
      // 3. Contains company terms
      const companyTerms = ["infra", "corp", "inc", "ltd", "limited", "solutions", "tech", "technologies", "systems", "group", "llc"];
      if (companyTerms.some(term => val.toLowerCase().includes(term))) return true;
    }

    if (name === "companyName") {
      // Starts with bullet points or punctuation symbols
      if (/^[•\-\/:\.,#]/.test(val)) return true;
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
    type = "text"
  ) => {
    const isEdited = Boolean(dirtyFields[name]);
    const currentValue = (formValues as any)[name];
    const needsVerification = shouldFlagForVerification(name, currentValue);

    return (
      <div key={name} className="space-y-1.5">
        <div className="flex justify-between items-center flex-wrap gap-1">
          <Label htmlFor={name} className="font-semibold text-slate-900 dark:text-slate-100 text-xs sm:text-sm">
            {label}
            {["fullName", "companyName"].includes(name) && (
              <span className="text-muted-foreground font-normal ml-1 text-[11px]">(Req. if other empty)</span>
            )}
            {["email", "phone"].includes(name) && (
              <span className="text-muted-foreground font-normal ml-1 text-[11px]">(Req. if other empty)</span>
            )}
          </Label>

          {/* Confidence / Status Badge */}
          <div className="text-[10px] font-semibold flex items-center gap-1">
            {isEdited ? (
              <span className="text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full">
                ✏ Edited
              </span>
            ) : needsVerification ? (
              <span className="text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-amber-200 dark:border-amber-900/40">
                <AlertCircle className="w-3 h-3 text-amber-500" /> Please verify
              </span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                Extracted
              </span>
            )}
          </div>
        </div>

        <Input
          id={name}
          type={type}
          {...register(name)}
          className={`h-10 text-sm ${errors[name]
            ? "border-destructive focus-visible:ring-destructive"
            : isEdited
              ? "border-amber-400 focus-visible:ring-amber-400 font-medium"
              : needsVerification
                ? "border-amber-300 dark:border-amber-900/60 bg-amber-50/30 dark:bg-amber-950/20"
                : ""
            }`}
          placeholder={`Enter ${label.toLowerCase()}`}
        />
        {errors[name] && (
          <p className="text-xs text-destructive font-medium mt-1">
            {errors[name]?.message}
          </p>
        )}
      </div>
    );
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className={savedRecord ? "max-w-md w-[92vw] sm:max-w-[460px] p-5 sm:p-7 rounded-3xl border border-border shadow-2xl bg-background overflow-hidden" : "w-[95vw] max-w-[95vw] sm:max-w-[90vw] lg:max-w-6xl max-h-[92vh] sm:max-h-[90vh] p-0 overflow-hidden flex flex-col bg-background rounded-2xl border shadow-2xl"}>
          {/* ── SUCCESS STATE VIEW ──────────────────────────────────── */}
          {savedRecord ? (
            <div className="flex flex-col items-center text-center py-2 sm:py-3 px-1">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 shadow-xs">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="space-y-1.5 max-w-sm mx-auto">
                <h3 className="text-xl sm:text-2xl font-semibold text-foreground tracking-tight">
                  Contact submitted for review
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The contact is ready for Aventure’s approved review process.
                </p>
                {isDemo && (
                  <p className="pt-2 text-xs text-muted-foreground leading-relaxed">
                    Demonstration only. This contact has not been sent to Constant Contact.
                  </p>
                )}
              </div>

              {/* Compact Saved Contact Card */}
              <div className="w-full p-4 sm:p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 text-left space-y-3 my-5 shadow-xs">
                <div className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-semibold text-base text-foreground leading-snug">
                      {savedRecord.verifiedData.fullName || savedRecord.verifiedData.companyName || "Submitted contact"}
                    </h4>
                    {savedRecord.isDemo && (
                      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-2.5 py-0.5 rounded-full">
                        Demo Contact
                      </span>
                    )}
                  </div>

                  {savedRecord.verifiedData.jobTitle && (
                    <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                      {savedRecord.verifiedData.jobTitle}
                    </p>
                  )}
                  {savedRecord.verifiedData.companyName && (
                    <p className="text-xs font-normal text-slate-500 dark:text-slate-400">
                      {savedRecord.verifiedData.companyName}
                    </p>
                  )}
                </div>

                {savedRecord.verifiedData.email && (
                  <div className="pt-2.5 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <Mail className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                    <span className="truncate">{savedRecord.verifiedData.email}</span>
                  </div>
                )}

                {savedRecord.verifiedData.meetingContext?.metAtLocation && (
                  <div className="pt-2.5 border-t border-slate-200/80 dark:border-slate-800/80 text-xs text-slate-600 dark:text-slate-400 space-y-1">
                    <div className="font-semibold text-slate-900 dark:text-slate-100 text-[11px] uppercase tracking-wider">
                      Meeting Context
                    </div>
                    <div>📍 Met at: {savedRecord.verifiedData.meetingContext.metAtLocation}</div>
                    {savedRecord.verifiedData.meetingContext.contactType && (
                      <div>🏷 Type: {savedRecord.verifiedData.meetingContext.contactType}</div>
                    )}
                  </div>
                )}
              </div>

              {/* Clean Stacked Action Buttons */}
              <div className="flex flex-col gap-2.5 w-full">
                <Button
                  size="default"
                  className="w-full font-semibold text-xs h-11 rounded-xl bg-slate-900 text-white hover:bg-black dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 shadow-md shadow-slate-900/10 cursor-pointer"
                  onClick={onSuccess}
                >
                  Scan Another Card
                </Button>

                <Button
                  variant="outline"
                  size="default"
                  className="w-full font-semibold text-xs h-11 rounded-xl gap-2 border-slate-900/25 dark:border-slate-700 text-slate-900 dark:text-white bg-slate-900/5 dark:bg-slate-800/50 hover:bg-slate-900/10 dark:hover:bg-slate-800 hover:border-slate-900 transition-all cursor-pointer"
                  onClick={() => {
                    setIsOpen(false);
                    onSuccess();
                    navigate("/submissions");
                  }}
                >
                  View my submissions <ArrowRight className="w-3.5 h-3.5 text-slate-900 dark:text-white" />
                </Button>
              </div>
            </div>
          ) : (
            /* ── REVIEW FORM VIEW ────────────────────────────────────── */
            <>
              {/* Header */}
              <DialogHeader className="shrink-0 border-b bg-slate-50/50 p-4 pb-3 dark:bg-slate-900/50 sm:p-5 sm:pb-4 md:p-6 md:pb-4">
                <div className="pr-8 flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <DialogTitle className="text-xl md:text-2xl font-bold tracking-tight">
                      Review Contact
                    </DialogTitle>
                    {isDemo && (
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-900/10 text-slate-900 dark:bg-white/10 dark:text-white px-2.5 py-0.5 rounded-full border border-slate-900/20 dark:border-white/20">
                        Demo Contact
                      </span>
                    )}
                  </div>
                  <DialogDescription className="text-xs md:text-sm text-slate-600 dark:text-slate-400">
                    Check the details before submitting for review. Every detail remains editable before submission.
                  </DialogDescription>
                </div>
              </DialogHeader>

              {/* Modal Body: Split view on Desktop */}
              <div className="flex min-h-0 flex-1 touch-pan-y flex-col overflow-y-auto overscroll-contain bg-slate-50/50 lg:flex-row lg:overflow-hidden">
                {/* Left: Card Preview Panel */}
                <div className="group relative h-[190px] min-h-[190px] shrink-0 overflow-hidden border-b border-border bg-slate-100/70 p-3 dark:bg-slate-900/40 sm:h-[230px] sm:min-h-[230px] sm:p-4 lg:h-auto lg:min-h-0 lg:w-5/12 lg:border-b-0 lg:border-r lg:p-6">
                  <div className="absolute inset-3 flex items-center justify-center sm:inset-4 lg:inset-6">
                    <img
                      src={imageUrl}
                      alt="Business Card Preview"
                      className="h-full w-full rounded-xl border border-slate-200 object-contain shadow-md dark:border-slate-800"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsZoomImageOpen(true)}
                    className="absolute right-4 top-4 flex items-center gap-1.5 rounded-xl border border-border bg-background/90 p-2 text-xs font-medium text-foreground opacity-90 shadow-sm backdrop-blur-sm transition-colors hover:bg-background hover:opacity-100 cursor-pointer"
                  >
                    <ZoomIn className="w-3.5 h-3.5 text-slate-900 dark:text-white" /> Full View
                  </button>
                </div>

                {/* Right: Editable Form Panel */}
                <div className="shrink-0 bg-background p-4 sm:p-5 md:p-6 lg:w-7/12 lg:flex-1 lg:shrink lg:overflow-y-auto">
                  <form
                    id="ocr-review-form"
                    onSubmit={handleSubmit(onSubmit)}
                    className="space-y-6"
                  >
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {renderField("Name", "fullName")}
                      {renderField("Company", "companyName")}
                      {renderField("Job title", "jobTitle")}
                      {renderField("Email", "email", "email")}
                      {renderField("Phone", "phone", "tel")}
                      {renderField("Country or location", "country")}
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="metAtLocation">Event / source</Label>
                        <select
                          id="metAtLocation"
                          {...register("metAtLocation")}
                          aria-describedby="event-demo-description"
                          className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                        >
                          <option value="">Select event or source</option>
                          {MET_AT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <p id="event-demo-description" className="text-xs text-muted-foreground">
                          Demonstration options only; these are not confirmed Aventure events.
                        </p>
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="notes">Short notes</Label>
                        <textarea
                          id="notes"
                          {...register("notes")}
                          rows={3}
                          placeholder="Add a short note (optional)"
                          className="w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="assignedReviewer">Reviewer</Label>
                        <select
                          id="assignedReviewer"
                          value={assignedReviewerId}
                          onChange={(event) => setAssignedReviewerId(event.target.value)}
                          required
                          className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                        >
                          <option value="">Select reviewer</option>
                          {reviewers.map((reviewer) => <option key={reviewer.id} value={reviewer.id}>{reviewer.name} {reviewer.email}</option>)}
                        </select>
                        {!reviewers.length ? <p className="text-xs text-amber-700">An administrator must create a reviewer account before submission.</p> : null}
                      </div>
                    </div>
                  </form>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex shrink-0 items-center justify-between gap-2 border-t bg-slate-50/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md dark:bg-slate-900/95 sm:gap-3 sm:p-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsOpen(false)}
                  disabled={isSaving}
                  className="h-10 rounded-xl border-slate-900/30 dark:border-slate-700 bg-slate-900/5 dark:bg-slate-800/50 px-3 text-xs font-semibold text-slate-900 dark:text-white transition-all hover:border-slate-900 hover:bg-slate-900/10 dark:hover:bg-slate-800 sm:px-4 cursor-pointer"
                >
                  <X className="w-4 h-4 text-slate-900 dark:text-white" /> Cancel
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    type="submit"
                    form="ocr-review-form"
                    disabled={isSaving}
                    className="h-10 rounded-xl bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-slate-100 px-4 text-xs font-bold text-white dark:text-slate-900 shadow-md shadow-slate-900/20 sm:px-6 cursor-pointer"
                  >
                    {isSaving ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Submitting…
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" /> Submit for review
                      </>
                    )}
                  </Button>
                </div>
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

      <ViewCardModal
        isOpen={isExistingContactOpen}
        setIsOpen={(open) => {
          setIsExistingContactOpen(open);
          if (!open) setIsDuplicateModalOpen(true);
        }}
        record={duplicateMatch?.record || null}
        onViewQueue={() => {
          setIsExistingContactOpen(false);
          setIsOpen(false);
          onSuccess();
          navigate("/verified");
        }}
      />

      {/* Zoom Image Dialog */}
      <Dialog open={isZoomImageOpen} onOpenChange={setIsZoomImageOpen}>
        <DialogContent className="max-w-4xl p-2 bg-background border-border">
          <div className="relative flex items-center justify-center max-h-[85vh] overflow-hidden">
            <img
              src={imageUrl}
              alt="Business card high res"
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

