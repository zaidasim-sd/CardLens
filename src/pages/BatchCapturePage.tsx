import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  FileEdit,
  FileSpreadsheet,
  ImagePlus,
  Loader2,
  Move,
  Plus,
  RefreshCw,
  RotateCcw,
  ScanLine,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getBatchApiBaseLabel, isBatchCaptureEnabled, isStagingBatchOcrAllowed } from "@/config/features";
import { ocrCard } from "@/lib/api/ocr";
import { submitContact } from "@/lib/api/contacts";
import { getExhibitions, type ExhibitionOption } from "@/lib/api/exhibitions";
import { apiFetch } from "@/lib/api/client";
import { BatchCameraModal, type BatchCaptureResult } from "@/components/scanner/BatchCameraModal";
import {
  MAX_BATCH_CARDS,
  type BatchImageMetadata,
  type BatchQualityIssue,
  type BatchRegion,
  clampRegion,
  cropRegionToFile,
  emptyOcrData,
  getSimulatedOcr,
  hasHeavyOverlap,
  makeManualRegion,
  prepareBatchImage,
  renumberRegions,
  validateContact,
} from "@/lib/batchCapture";
import type { OCRData } from "@/types";
import "./batchCapture.css";

type BatchStep = "landing" | "regions" | "processing" | "review" | "complete";
type BatchCardStatus = "queued" | "processing" | "needs_review" | "reviewed" | "failed" | "skipped";
type BatchOcrMode = "mock" | "staging";
type ContactField = keyof OCRData;

interface SourceImageState {
  file: File;
  url: string;
  metadata: BatchImageMetadata;
  qualityIssues: BatchQualityIssue[];
}

interface BatchCardRecord {
  id: string;
  number: number;
  region: BatchRegion;
  cropFile: File;
  cropUrl: string;
  status: BatchCardStatus;
  data: OCRData;
  rawText: string;
  provider: string;
  extractedFields: ContactField[];
  editedFields: ContactField[];
  errors: Partial<Record<ContactField, string>>;
  retryCount: number;
  failureMessage: string;
  forcedFailure: boolean;
  processingMs?: number;
}

const FIELD_LABELS: Array<{ key: ContactField; label: string; multiline?: boolean }> = [
  { key: "fullName", label: "Full Name" },
  { key: "jobTitle", label: "Job Title" },
  { key: "companyName", label: "Company Name" },
  { key: "phone", label: "Phone Number" },
  { key: "email", label: "Email Address" },
  { key: "notes", label: "Short Notes", multiline: true },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function readableStatus(status: BatchCardStatus): string {
  if (status === "needs_review") return "Needs review";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getExtractedFields(data: OCRData): ContactField[] {
  return FIELD_LABELS.map((field) => field.key).filter((key) => {
    const value = data[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

function isContactField(key: ContactField): key is ContactField {
  return key !== "meetingContext";
}

function copyOcrData(data: OCRData): OCRData {
  return {
    fullName: data.fullName || "",
    jobTitle: data.jobTitle || "",
    companyName: data.companyName || "",
    email: data.email || "",
    phone: data.phone || "",
    alternatePhone: data.alternatePhone || "",
    website: data.website || "",
    address: data.address || "",
    city: data.city || "",
    country: data.country || "",
    notes: data.notes || "",
    meetingContext: data.meetingContext,
  };
}

function BatchFeatureDisabled() {
  return (
    <section className="batch-empty-state" aria-labelledby="batch-disabled-title">
      <ShieldAlert className="h-9 w-9 text-amber-600" aria-hidden="true" />
      <h1 id="batch-disabled-title">Batch Capture is disabled</h1>
      <p>
        This staging-only workflow is behind a local feature flag. Enable it with
        <code> VITE_ENABLE_BATCH_CAPTURE=true </code>
        or set <code>localStorage.lead71.batchCapture = "enabled"</code> for local testing.
      </p>
    </section>
  );
}

function RegionEditor({
  source,
  regions,
  selectedId,
  onSelect,
  onChange,
}: {
  source: SourceImageState;
  regions: BatchRegion[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (regions: BatchRegion[]) => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const manualCounterRef = useRef(0);
  const interaction = useRef<
    | null
    | {
      mode: "draw" | "move" | "resize";
      id: string;
      startX: number;
      startY: number;
      startRegion: BatchRegion;
    }
  >(null);

  const toImagePoint = useCallback(
    (clientX: number, clientY: number) => {
      const rect = overlayRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: ((clientX - rect.left) / rect.width) * source.metadata.width,
        y: ((clientY - rect.top) / rect.height) * source.metadata.height,
      };
    },
    [source.metadata.height, source.metadata.width]
  );

  const updateRegion = useCallback(
    (updated: BatchRegion) => {
      onChange(renumberRegions(regions.map((region) => (region.id === updated.id ? updated : region))));
    },
    [onChange, regions]
  );

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (regions.length >= MAX_BATCH_CARDS) {
      toast.info("A batch can contain up to 10 card regions.");
      return;
    }
    const point = toImagePoint(event.clientX, event.clientY);
    manualCounterRef.current += 1;
    const draft: BatchRegion = {
      id: `manual-drag-${manualCounterRef.current}`,
      number: regions.length + 1,
      x: point.x,
      y: point.y,
      width: 20,
      height: 20,
      source: "manual",
    };
    interaction.current = {
      mode: "draw",
      id: draft.id,
      startX: point.x,
      startY: point.y,
      startRegion: draft,
    };
    onSelect(draft.id);
    onChange([...regions, draft]);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = interaction.current;
    if (!current) return;
    const point = toImagePoint(event.clientX, event.clientY);
    if (current.mode === "draw") {
      const next = clampRegion(
        {
          ...current.startRegion,
          x: Math.min(current.startX, point.x),
          y: Math.min(current.startY, point.y),
          width: Math.abs(point.x - current.startX),
          height: Math.abs(point.y - current.startY),
        },
        source.metadata.width,
        source.metadata.height
      );
      updateRegion(next);
      return;
    }
    if (current.mode === "move") {
      const next = clampRegion(
        {
          ...current.startRegion,
          x: current.startRegion.x + point.x - current.startX,
          y: current.startRegion.y + point.y - current.startY,
          source: current.startRegion.source === "auto" ? "corrected" : current.startRegion.source,
        },
        source.metadata.width,
        source.metadata.height
      );
      updateRegion(next);
      return;
    }
    const next = clampRegion(
      {
        ...current.startRegion,
        width: Math.max(40, current.startRegion.width + point.x - current.startX),
        height: Math.max(30, current.startRegion.height + point.y - current.startY),
        source: current.startRegion.source === "auto" ? "corrected" : current.startRegion.source,
      },
      source.metadata.width,
      source.metadata.height
    );
    updateRegion(next);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = interaction.current;
    interaction.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (!current) return;
    const region = regions.find((item) => item.id === current.id);
    if (region && (region.width < source.metadata.width * 0.05 || region.height < source.metadata.height * 0.04)) {
      onChange(renumberRegions(regions.filter((item) => item.id !== region.id)));
      onSelect(null);
    }
  };

  return (
    <div
      ref={overlayRef}
      className="batch-region-canvas"
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <img src={source.url} alt="Batch source with selected card regions" draggable={false} />
      {regions.map((region) => {
        const selected = selectedId === region.id;
        const style = {
          left: `${(region.x / source.metadata.width) * 100}%`,
          top: `${(region.y / source.metadata.height) * 100}%`,
          width: `${(region.width / source.metadata.width) * 100}%`,
          height: `${(region.height / source.metadata.height) * 100}%`,
        };
        return (
          <button
            key={region.id}
            type="button"
            className={`batch-region-box ${selected ? "is-selected" : ""} ${region.source}`}
            style={style}
            onPointerDown={(event) => {
              event.stopPropagation();
              const point = toImagePoint(event.clientX, event.clientY);
              interaction.current = {
                mode: "move",
                id: region.id,
                startX: point.x,
                startY: point.y,
                startRegion: region,
              };
              onSelect(region.id);
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            aria-label={`Card region ${region.number}, ${region.source}`}
          >
            <span>{region.number}</span>
            <i>{region.source === "auto" ? "Auto" : region.source === "corrected" ? "Corrected" : "Manual"}</i>
            <b
              aria-hidden="true"
              onPointerDown={(event) => {
                event.stopPropagation();
                const point = toImagePoint(event.clientX, event.clientY);
                interaction.current = {
                  mode: "resize",
                  id: region.id,
                  startX: point.x,
                  startY: point.y,
                  startRegion: region,
                };
                onSelect(region.id);
                event.currentTarget.parentElement?.setPointerCapture(event.pointerId);
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

export default function BatchCapturePage() {
  const [step, setStep] = useState<BatchStep>("landing");
  const [source, setSource] = useState<SourceImageState | null>(null);
  const [regions, setRegions] = useState<BatchRegion[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [records, setRecords] = useState<BatchCardRecord[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [processingStartedAt, setProcessingStartedAt] = useState<number | null>(null);
  const [processingFinishedAt, setProcessingFinishedAt] = useState<number | null>(null);
  const [ocrMode, setOcrMode] = useState<BatchOcrMode>("staging");
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [exhibitionOptions, setExhibitionOptions] = useState<ExhibitionOption[]>([]);
  const [selectedExhibition, setSelectedExhibition] = useState("Morocco Airshow 2026");
  const [isSubmittingToSheet, setIsSubmittingToSheet] = useState(false);
  const [isReclassifying, setIsReclassifying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingRun = useRef(0);
  const sourceRef = useRef<SourceImageState | null>(null);
  const recordsRef = useRef<BatchCardRecord[]>([]);
  const stagingOcrAllowed = isStagingBatchOcrAllowed();
  const batchEnabled = isBatchCaptureEnabled();

  // Load exhibition options on mount
  useEffect(() => {
    void getExhibitions().then((options) => {
      if (options && options.length > 0) {
        setExhibitionOptions(options);
        setSelectedExhibition(options[0]?.value || "Morocco Airshow 2026");
      }
    });
  }, []);

  const cleanupRecords = useCallback((items: BatchCardRecord[]) => {
    for (const item of items) URL.revokeObjectURL(item.cropUrl);
  }, []);

  const resetBatch = useCallback(() => {
    if (source) URL.revokeObjectURL(source.url);
    cleanupRecords(records);
    processingRun.current += 1;
    setStep("landing");
    setSource(null);
    setRegions([]);
    setSelectedRegionId(null);
    setRecords([]);
    setSelectedRecordId(null);
    setProcessingStartedAt(null);
    setProcessingFinishedAt(null);
    setSimulateFailure(false);
  }, [cleanupRecords, records, source]);

  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  useEffect(() => {
    return () => {
      if (sourceRef.current) URL.revokeObjectURL(sourceRef.current.url);
      cleanupRecords(recordsRef.current);
    };
  }, [cleanupRecords]);

  const summary = useMemo(() => {
    const failed = records.filter((record) => record.status === "failed").length;
    const skipped = records.filter((record) => record.status === "skipped").length;
    const reviewed = records.filter((record) => record.status === "reviewed").length;
    const needsReview = records.filter((record) => record.status === "needs_review").length;
    const processing = records.filter((record) => record.status === "processing").length;
    const complete = records.filter((record) => ["needs_review", "reviewed", "failed", "skipped"].includes(record.status)).length;
    return { failed, skipped, reviewed, needsReview, processing, complete, total: records.length };
  }, [records]);

  const selectedRecord = records.find((record) => record.id === selectedRecordId) || records[0] || null;
  const selectedRegion = regions.find((region) => region.id === selectedRegionId) || regions[0] || null;
  const hasOverlaps = regions.some((region) => hasHeavyOverlap(region, regions));
  const canProcess = Boolean(source && regions.length > 0 && regions.length <= MAX_BATCH_CARDS && !hasOverlaps);
  const progressValue = summary.total ? Math.round((summary.complete / summary.total) * 100) : 0;

  const handleFile = async (file: File | undefined) => {
    if (!file || isPreparing) return;
    setIsPreparing(true);
    try {
      resetBatch();
      const prepared = await prepareBatchImage(file);
      const nextSource = {
        file: prepared.file,
        url: prepared.url,
        metadata: prepared.metadata,
        qualityIssues: prepared.qualityIssues,
      };
      setSource(nextSource);

      // Call AI multi-card detection endpoint
      let activeRegions = prepared.autoRegions;
      try {
        const formData = new FormData();
        formData.append("image", file);
        const result = await apiFetch<{
          cards: Array<{ id: string; number: number; x: number; y: number; width: number; height: number; source: "auto" }>;
          imageWidth: number | null;
          imageHeight: number | null;
          count: number;
        }>("/api/detect-cards", { method: "POST", body: formData });

        if (result?.cards && result.cards.length > 0) {
          let scaleX = 1;
          let scaleY = 1;
          if (result.imageWidth && result.imageHeight) {
            scaleX = prepared.metadata.width / result.imageWidth;
            scaleY = prepared.metadata.height / result.imageHeight;
          }
          activeRegions = result.cards.map((c, i) => ({
            id: c.id || `card-${i + 1}`,
            number: i + 1,
            x: Math.round(c.x * scaleX),
            y: Math.round(c.y * scaleY),
            width: Math.round(c.width * scaleX),
            height: Math.round(c.height * scaleY),
            source: "auto" as const,
          }));
        }
      } catch (detectErr) {
        console.warn("AI card detection unavailable, falling back to local contours:", detectErr);
      }

      setRegions(activeRegions);
      setSelectedRegionId(activeRegions[0]?.id || null);

      // Skip Step 1 — go directly to processing if we have regions
      if (activeRegions.length > 0) {
        setIsPreparing(false);
        await startProcessing(nextSource, activeRegions);
        return;
      }

      // Fallback: no regions detected, show region editor
      setStep("regions");
      toast.info("No clear card regions were detected. Add regions manually by dragging on the image.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to prepare this image.");
    } finally {
      setIsPreparing(false);
    }
  };

  /**
   * Called by BatchCameraModal when the user confirms their adjusted regions.
   * We still run prepareBatchImage so quality issues and metadata are populated,
   * but we override autoRegions with the user-adjusted boxes from the camera.
   */
  const handleBatchCamera = async (result: BatchCaptureResult) => {
    setIsCameraOpen(false);
    if (isPreparing) return;
    setIsPreparing(true);
    try {
      resetBatch();
      const prepared = await prepareBatchImage(result.file);
      const nextSource = {
        file: prepared.file,
        url: prepared.url,
        metadata: prepared.metadata,
        qualityIssues: prepared.qualityIssues,
      };
      setSource(nextSource);
      // Use the camera-adjusted regions, renumbered to match image coords.
      // The regions from the modal are already in full-res video pixel space.
      const userRegions = result.regions.length > 0 ? result.regions : prepared.autoRegions;
      setRegions(userRegions);
      setSelectedRegionId(userRegions[0]?.id || null);

      // Skip Step 1 — go directly to processing if we have regions
      if (userRegions.length > 0) {
        setIsPreparing(false);
        await startProcessing(nextSource, userRegions);
        return;
      }

      // Fallback: no regions detected, show region editor
      setStep("regions");
      toast.info("No card regions detected. Add them manually by dragging on the image.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to prepare this image.");
    } finally {
      setIsPreparing(false);
    }
  };

  const addManualRegion = () => {
    if (!source || regions.length >= MAX_BATCH_CARDS) return;
    const next = makeManualRegion(regions.length + 1, source.metadata.width, source.metadata.height);
    setRegions(renumberRegions([...regions, next]));
    setSelectedRegionId(next.id);
  };

  const removeSelectedRegion = () => {
    if (!selectedRegion) return;
    const next = renumberRegions(regions.filter((region) => region.id !== selectedRegion.id));
    setRegions(next);
    setSelectedRegionId(next[0]?.id || null);
  };

  const updateRegionField = (field: "x" | "y" | "width" | "height", value: number) => {
    if (!source || !selectedRegion) return;
    const next = clampRegion(
      {
        ...selectedRegion,
        [field]: value,
        source: selectedRegion.source === "auto" ? "corrected" : selectedRegion.source,
      },
      source.metadata.width,
      source.metadata.height
    );
    setRegions(renumberRegions(regions.map((region) => (region.id === selectedRegion.id ? next : region))));
  };

  const processOneCard = useCallback(
    async (record: BatchCardRecord): Promise<BatchCardRecord> => {
      const started = performance.now();
      if (record.forcedFailure && record.retryCount === 0) {
        await new Promise((resolve) => window.setTimeout(resolve, 650));
        return {
          ...record,
          status: "failed",
          failureMessage: "Simulated card failure. Retry this card to confirm recovery without restarting the batch.",
          processingMs: Math.round(performance.now() - started),
        };
      }

      if (ocrMode === "staging") {
        const result = await ocrCard(record.cropFile, "ai");
        const parsed = copyOcrData(result.parsed);
        return {
          ...record,
          status: "needs_review",
          data: parsed,
          rawText: result.rawText,
          provider: result.provider || "gemini-ai",
          extractedFields: getExtractedFields(parsed),
          errors: validateContact(parsed),
          failureMessage: "",
          processingMs: Math.round(performance.now() - started),
        };
      }

      await new Promise((resolve) => window.setTimeout(resolve, 500 + record.number * 90));
      const result = getSimulatedOcr(record.number - 1);
      const parsed = copyOcrData(result.parsed);
      return {
        ...record,
        status: "needs_review",
        data: parsed,
        rawText: result.rawText,
        provider: result.provider,
        extractedFields: getExtractedFields(parsed),
        errors: validateContact(parsed),
        failureMessage: "",
        processingMs: Math.round(performance.now() - started),
      };
    },
    [ocrMode]
  );

  const startProcessing = async (targetSource?: SourceImageState | null, targetRegions?: BatchRegion[]) => {
    const useSource = targetSource || source;
    const useRegions = targetRegions || regions;
    if (!useSource || useRegions.length === 0 || useRegions.length > MAX_BATCH_CARDS) return;
    const runId = processingRun.current + 1;
    processingRun.current = runId;
    setProcessingStartedAt(performance.now());
    setProcessingFinishedAt(null);
    setStep("processing");

    try {
      const cropped = await Promise.all(
        useRegions.map(async (region, index) => {
          const crop = await cropRegionToFile(useSource.file, region);
          return {
            id: `card-${region.id}`,
            number: index + 1,
            region: { ...region, number: index + 1 },
            cropFile: crop.file,
            cropUrl: crop.url,
            status: "queued" as BatchCardStatus,
            data: emptyOcrData(),
            rawText: "",
            provider: "",
            extractedFields: [],
            editedFields: [],
            errors: {},
            retryCount: 0,
            failureMessage: "",
            forcedFailure: simulateFailure && index === useRegions.length - 1,
          };
        })
      );
      cleanupRecords(records);
      setRecords(cropped);
      setSelectedRecordId(cropped[0]?.id || null);

      let cursor = 0;
      const worker = async () => {
        while (cursor < cropped.length && processingRun.current === runId) {
          const index = cursor;
          cursor += 1;
          setRecords((current) => current.map((record) => (record.id === cropped[index].id ? { ...record, status: "processing" } : record)));
          try {
            const processed = await processOneCard(cropped[index]);
            setRecords((current) => current.map((record) => (record.id === processed.id ? processed : record)));
          } catch (error) {
            const message = error instanceof Error ? error.message : "This card could not be processed.";
            setRecords((current) =>
              current.map((record) =>
                record.id === cropped[index].id
                  ? { ...record, status: "failed", failureMessage: message, processingMs: undefined }
                  : record
              )
            );
          }
        }
      };
      await Promise.all([worker(), worker()]);
      if (processingRun.current !== runId) return;
      setProcessingFinishedAt(performance.now());
      setStep("review");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to crop the selected regions.");
      setStep("regions");
    }
  };

  const retryRecord = async (recordId: string) => {
    const current = records.find((record) => record.id === recordId);
    if (!current || current.status === "processing") return;
    setRecords((items) =>
      items.map((item) =>
        item.id === recordId
          ? { ...item, status: "processing", retryCount: item.retryCount + 1, failureMessage: "", forcedFailure: false }
          : item
      )
    );
    try {
      const processed = await processOneCard({ ...current, retryCount: current.retryCount + 1, forcedFailure: false });
      setRecords((items) => items.map((item) => (item.id === recordId ? processed : item)));
      toast.success(`Card ${current.number} recovered.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "This card could not be processed.";
      setRecords((items) => items.map((item) => (item.id === recordId ? { ...item, status: "failed", failureMessage: message } : item)));
    }
  };

  const reclassifyWithGemini = async (recordId: string) => {
    const target = records.find((r) => r.id === recordId);
    if (!target) return;
    setIsReclassifying(true);
    try {
      const result = await ocrCard(target.cropFile, "ai");
      const parsed = copyOcrData(result.parsed);
      setRecords((items) =>
        items.map((item) =>
          item.id === recordId
            ? {
              ...item,
              data: parsed,
              rawText: result.rawText,
              provider: result.provider || "gemini-ai",
              extractedFields: getExtractedFields(parsed),
              errors: validateContact(parsed),
              status: "needs_review",
              failureMessage: "",
            }
            : item
        )
      );
      toast.success(`Card ${target.number} re-classified with Gemini AI.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gemini classification failed.");
    } finally {
      setIsReclassifying(false);
    }
  };

  const updateRecordField = (recordId: string, field: ContactField, value: string) => {
    if (!isContactField(field)) return;
    setRecords((items) =>
      items.map((record) => {
        if (record.id !== recordId) return record;
        const data = { ...record.data, [field]: value };
        const editedFields = record.editedFields.includes(field) ? record.editedFields : [...record.editedFields, field];
        return { ...record, data, editedFields, errors: validateContact(data), status: record.status === "failed" ? "needs_review" : record.status };
      })
    );
  };

  const setRecordStatus = (recordId: string, status: BatchCardStatus) => {
    setRecords((items) =>
      items.map((record) => (record.id === recordId ? { ...record, status, errors: status === "reviewed" ? validateContact(record.data) : record.errors } : record))
    );
  };

  const handleSubmitAllToSheet = async () => {
    // Validate all active (non-skipped, non-failed) records
    const activeRecords = records.filter((r) => r.status !== "failed" && r.status !== "skipped");
    if (activeRecords.length === 0) {
      toast.error("No valid records to submit.");
      return;
    }

    // Check validation on each record
    for (const record of activeRecords) {
      const errors = validateContact(record.data);
      if (Object.keys(errors).length > 0) {
        setSelectedRecordId(record.id);
        toast.error(`Card ${record.number} has validation errors: ${Object.values(errors).join(", ")}`);
        return;
      }
    }

    setIsSubmittingToSheet(true);
    let successCount = 0;
    let failCount = 0;

    for (const record of activeRecords) {
      try {
        await submitContact({
          submissionId: crypto.randomUUID(),
          rawOCRText: record.rawText,
          ocrData: record.data,
          verifiedData: {
            ...record.data,
            meetingContext: { metAtLocation: selectedExhibition },
          },
          source: "ocr",
        });
        successCount++;
        setRecords((items) =>
          items.map((item) => (item.id === record.id ? { ...item, status: "reviewed" as BatchCardStatus } : item))
        );
      } catch (error) {
        failCount++;
        const message = error instanceof Error ? error.message : "Submission failed";
        toast.error(`Card ${record.number}: ${message}`);
        setRecords((items) =>
          items.map((item) => (item.id === record.id ? { ...item, failureMessage: message } : item))
        );
      }
    }

    setIsSubmittingToSheet(false);

    if (failCount === 0) {
      toast.success(`All ${successCount} records submitted to Google Sheets successfully!`);
      setStep("complete");
    } else {
      toast.warning(`${successCount} submitted, ${failCount} failed. Review errors and retry.`);
    }
  };

  if (!batchEnabled) return <BatchFeatureDisabled />;

  return (
    <div className="batch-page" aria-live="polite">
      {/* Batch camera modal — portaled to body, completely separate from CameraModal */}
      {isCameraOpen && (
        <BatchCameraModal
          onCapture={handleBatchCamera}
          onClose={() => setIsCameraOpen(false)}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => {
          void handleFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {step === "landing" && (
        <section className="batch-landing" onDrop={(event) => { event.preventDefault(); void handleFile(event.dataTransfer.files[0]); }} onDragOver={(event) => event.preventDefault()}>
          <div className="batch-hero-copy">
            <span className="batch-pill">Staging-only prototype</span>
            <h1>Batch Capture</h1>
            <p>
              Capture or upload one photo containing up to 10 separated business cards. Review every crop and contact record before reaching the mock review stage.
            </p>
            <div className="batch-actions">
              <Button
                disabled={isPreparing}
                onClick={() => setIsCameraOpen(true)}
                className="batch-primary"
              >
                {isPreparing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
                Capture a Card
              </Button>
              <Button
                variant="outline"
                disabled={isPreparing}
                onClick={() => fileInputRef.current?.click()}
                className="batch-secondary-btn"
              >
                <ImagePlus className="h-4 w-4" />
                Upload Image
              </Button>
            </div>
            {/* <div className="batch-safe-note">
              <ShieldAlert className="h-4 w-4" aria-hidden="true" />
              Default mode is simulated. No Google Sheet write, email, deployment, or Constant Contact action occurs in this workflow.
            </div> */}
          </div>
          <div className="batch-guidance-panel">
            <h2>Photo guidance</h2>
            <ul>
              <li>Place cards on a flat, contrasting surface.</li>
              <li>Keep space between cards so outlines can be detected.</li>
              <li>Avoid glare, shadows, blur, and overlapping cards.</li>
              <li>Make all card text readable before processing.</li>
              <li>Maximum: 10 cards per image.</li>
            </ul>
            <div className="batch-next-card">
              <ImagePlus className="h-5 w-5" aria-hidden="true" />
              <span>Next: confirm card regions, crop each card, then review each contact independently.</span>
            </div>
          </div>
        </section>
      )}

      {step === "regions" && source && (
        <section className="batch-workspace">
          <header className="batch-section-header">
            <div>
              <span className="batch-pill">Step 1 of 3</span>
              <h1>Confirm card regions</h1>
              <p>Automatic outlines are labelled Auto. Drag on the image to add a manual region, or select a box to move, resize, or remove it.</p>
            </div>
            <Button variant="outline" onClick={resetBatch}>
              <X className="h-4 w-4" /> Start over
            </Button>
          </header>

          <div className="batch-region-layout">
            <div className="batch-panel">
              <RegionEditor source={source} regions={regions} selectedId={selectedRegionId} onSelect={setSelectedRegionId} onChange={setRegions} />
              <div className="batch-image-meta">
                <span>{source.metadata.width} x {source.metadata.height}</span>
                <span>{formatBytes(source.metadata.size)}</span>
                <span>{regions.length} / {MAX_BATCH_CARDS} regions</span>
              </div>
            </div>

            <aside className="batch-side-panel">
              <div className="batch-card">
                <h2>Detection status</h2>
                <p>{regions.filter((region) => region.source === "auto").length} automatic, {regions.filter((region) => region.source !== "auto").length} manual or corrected.</p>
                {source.qualityIssues.length > 0 && (
                  <div className="batch-warning-list">
                    {source.qualityIssues.map((issue) => (
                      <p key={issue.message} className={issue.level}>
                        <AlertTriangle className="h-4 w-4" /> {issue.message}
                      </p>
                    ))}
                  </div>
                )}
                {hasOverlaps && (
                  <p className="batch-inline-error"><AlertTriangle className="h-4 w-4" /> One or more regions overlap heavily. Adjust before processing.</p>
                )}
              </div>

              <div className="batch-card">
                <h2>Selected region</h2>
                {selectedRegion ? (
                  <div className="batch-region-controls">
                    <label>
                      X
                      <Input type="number" value={Math.round(selectedRegion.x)} onChange={(event) => updateRegionField("x", Number(event.target.value))} />
                    </label>
                    <label>
                      Y
                      <Input type="number" value={Math.round(selectedRegion.y)} onChange={(event) => updateRegionField("y", Number(event.target.value))} />
                    </label>
                    <label>
                      Width
                      <Input type="number" value={Math.round(selectedRegion.width)} onChange={(event) => updateRegionField("width", Number(event.target.value))} />
                    </label>
                    <label>
                      Height
                      <Input type="number" value={Math.round(selectedRegion.height)} onChange={(event) => updateRegionField("height", Number(event.target.value))} />
                    </label>
                  </div>
                ) : (
                  <p className="batch-muted">Select or add a region to edit coordinates.</p>
                )}
                <div className="batch-button-grid">
                  <Button variant="outline" onClick={addManualRegion} disabled={regions.length >= MAX_BATCH_CARDS}>
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                  <Button variant="outline" onClick={removeSelectedRegion} disabled={!selectedRegion}>
                    <Trash2 className="h-4 w-4" /> Remove
                  </Button>
                </div>
              </div>

              <div className="batch-card">
                <h2>Processing mode</h2>
                <div className="batch-segmented" role="group" aria-label="OCR processing mode">
                  <button type="button" className={ocrMode === "mock" ? "active" : ""} onClick={() => setOcrMode("mock")}>Simulated</button>
                  <button type="button" className={ocrMode === "staging" ? "active" : ""} disabled={!stagingOcrAllowed} onClick={() => setOcrMode("staging")}>Staging OCR</button>
                </div>
                <p className="batch-muted">
                  Backend: {getBatchApiBaseLabel()}. Staging OCR calls are disabled unless explicitly enabled by local env.
                </p>
                <label className="batch-checkbox">
                  <input type="checkbox" checked={simulateFailure} onChange={(event) => setSimulateFailure(event.target.checked)} />
                  Simulate one failed card for recovery testing
                </label>
              </div>

              <Button onClick={() => void startProcessing()} disabled={!canProcess} className="batch-primary batch-full">
                <ScanLine className="h-4 w-4" /> Crop and process {regions.length || ""} cards
              </Button>
            </aside>
          </div>
        </section>
      )}

      {step === "processing" && (
        <section className="batch-processing">
          <div className="batch-processing-header">
            {/* <span className="batch-pill-processing">
              <Sparkles className="h-3.5 w-3.5 animate-pulse text-teal-600 dark:text-teal-400" />
              Gemini AI Processing
            </span> */}
            <h1>Processing batch</h1>
            <p>{summary.complete} of {summary.total} card crops have finished. Concurrency is limited to 2 cards at a time.</p>
          </div>
          <div className="batch-progress-bar"><span style={{ width: `${progressValue}%` }} /></div>
          <div className="batch-processing-grid">
            {records.map((record) => (
              <article key={record.id} className={`batch-mini-card ${record.status}`}>
                <img src={record.cropUrl} alt={`Crop preview for card ${record.number}`} />
                <div>
                  <strong>Card {record.number}</strong>
                  <span>{readableStatus(record.status)}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {step === "review" && selectedRecord && (
        <section className="batch-workspace">
          <header className="batch-section-header">
            <div>
              <span className="batch-pill">Step 2 of 3</span>
              <h1>Review extracted contacts</h1>
              <p>Each crop has independent state. Edit fields, recover failed cards, and mark clean records reviewed.</p>
            </div>
            <Button variant="outline" onClick={() => setStep("regions")}>
              <Move className="h-4 w-4" /> Adjust regions
            </Button>
          </header>

          {/* <div className="batch-summary-strip">
            <span>Total <b>{summary.total}</b></span>
            <span>Needs review <b>{summary.needsReview}</b></span>
            <span>Reviewed <b>{summary.reviewed}</b></span>
            <span>Failed <b>{summary.failed}</b></span>
            <span>Skipped <b>{summary.skipped}</b></span>
          </div> */}

          <div className="batch-review-layout">
            <aside className="batch-record-list">
              {records.map((record) => (
                <button
                  type="button"
                  key={record.id}
                  className={selectedRecord.id === record.id ? "active" : ""}
                  onClick={() => setSelectedRecordId(record.id)}
                >
                  <img src={record.cropUrl} alt="" />
                  <span>
                    <strong>Card {record.number}</strong>
                    <small>{readableStatus(record.status)}</small>
                  </span>
                </button>
              ))}
            </aside>

            <article className="batch-review-card">
              <div className="batch-crop-preview">
                <img src={selectedRecord.cropUrl} alt={`Selected crop for card ${selectedRecord.number}`} />
                <span className={`batch-status-badge ${selectedRecord.status}`}>{readableStatus(selectedRecord.status)}</span>
              </div>

              <div className="batch-card-header-bar">
                <div className="batch-card-title-group">
                  <h3>Card {selectedRecord.number} of {records.length}</h3>
                  {/* <span className="batch-ai-badge">
                    <Sparkles className="h-3 w-3 text-teal-600 dark:text-teal-400" />
                    Gemini AI
                  </span> */}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void reclassifyWithGemini(selectedRecord.id)}
                  disabled={isReclassifying || selectedRecord.status === "processing"}
                  className="batch-reclassify-btn"
                >
                  {isReclassifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-amber-500" />}
                  {isReclassifying ? "Classifying..." : "Re-classify with Gemini"}
                </Button>
              </div>

              {selectedRecord.status === "failed" ? (
                <div className="batch-failure-panel">
                  <AlertTriangle className="h-7 w-7" />
                  <h2>Card {selectedRecord.number} needs recovery</h2>
                  <p>{selectedRecord.failureMessage || "This card could not be processed."}</p>
                  <div className="batch-button-row">
                    <Button onClick={() => void retryRecord(selectedRecord.id)}>
                      <RefreshCw className="h-4 w-4" /> Retry card
                    </Button>
                    <Button variant="outline" onClick={() => setRecordStatus(selectedRecord.id, "skipped")}>
                      Skip card
                    </Button>
                    <Button variant="outline" onClick={() => setRecordStatus(selectedRecord.id, "needs_review")}>
                      <FileEdit className="h-4 w-4" /> Enter manually
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="batch-form-grid">
                  {FIELD_LABELS.map((field) => {
                    const value = selectedRecord.data[field.key];
                    const stringValue = typeof value === "string" ? value : "";
                    const extracted = selectedRecord.extractedFields.includes(field.key);
                    const edited = selectedRecord.editedFields.includes(field.key);
                    const error = selectedRecord.errors[field.key];
                    return (
                      <label key={field.key} className={field.multiline ? "wide" : ""}>
                        <span>
                          {field.label}
                          {extracted && <em>OCR</em>}
                          {edited && <em>Edited</em>}
                        </span>
                        {field.multiline ? (
                          <Textarea value={stringValue} onChange={(event) => updateRecordField(selectedRecord.id, field.key, event.target.value)} />
                        ) : (
                          <Input value={stringValue} onChange={(event) => updateRecordField(selectedRecord.id, field.key, event.target.value)} />
                        )}
                        {error && <small role="alert">{error}</small>}
                      </label>
                    );
                  })}
                </div>
              )}

              <div className="batch-review-actions">
                <Button
                  variant="outline"
                  onClick={() => {
                    const index = records.findIndex((record) => record.id === selectedRecord.id);
                    setSelectedRecordId(records[Math.max(0, index - 1)]?.id || selectedRecord.id);
                  }}
                >
                  <ArrowLeft className="h-4 w-4" /> Previous
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    const index = records.findIndex((record) => record.id === selectedRecord.id);
                    setSelectedRecordId(records[Math.min(records.length - 1, index + 1)]?.id || selectedRecord.id);
                  }}
                >
                  Next <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </article>
          </div>

          <div className="batch-exhibition-bar">
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
              Exhibition:
              <select
                value={selectedExhibition}
                onChange={(e) => setSelectedExhibition(e.target.value)}
                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
              >
                {exhibitionOptions.length > 0 ? (
                  exhibitionOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))
                ) : (
                  <option value="Morocco Airshow 2026">Morocco Airshow 2026</option>
                )}
              </select>
            </label>
            <Button
              onClick={() => void handleSubmitAllToSheet()}
              disabled={isSubmittingToSheet || records.filter((r) => r.status !== "failed" && r.status !== "skipped").length === 0}
              className="batch-submit-sheet-btn"
            >
              {isSubmittingToSheet ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              {isSubmittingToSheet ? "Submitting..." : `Submit all ${records.filter((r) => r.status !== "failed" && r.status !== "skipped").length} records to Google Sheets`}
            </Button>
          </div>
        </section>
      )}

      {step === "complete" && (
        <section className="batch-complete">
          <CheckCircle2 className="h-12 w-12 text-emerald-600" aria-hidden="true" />
          <h1>Batch submitted to Google Sheets</h1>
          <p>All valid records have been submitted to the staging Google Sheet.</p>
          <div className="batch-summary-strip">
            <span>Total <b>{summary.total}</b></span>
            <span>Submitted <b>{summary.reviewed}</b></span>
            <span>Failed <b>{summary.failed}</b></span>
            <span>Skipped <b>{summary.skipped}</b></span>
          </div>
          <div className="batch-complete-list">
            {records.map((record) => (
              <article key={record.id}>
                <img src={record.cropUrl} alt="" />
                <div>
                  <strong>Card {record.number}: {record.data.fullName || "Unnamed contact"}</strong>
                  <span>{record.data.companyName || "Company not entered"} - {readableStatus(record.status)}</span>
                </div>
              </article>
            ))}
          </div>
          <div className="batch-metrics">
            <span>OCR provider: {ocrMode === "mock" ? "Simulated" : "Gemini AI Classification"}</span>
            <span>OCR call count: {records.filter((record) => record.provider).length}</span>
            <span>
              Processing time:{" "}
              {processingStartedAt && processingFinishedAt ? `${Math.round(processingFinishedAt - processingStartedAt)} ms` : "not measured"}
            </span>
            <span>Exhibition: {selectedExhibition}</span>
          </div>
          <Button onClick={resetBatch} className="batch-primary">
            <RotateCcw className="h-4 w-4" /> Start another batch
          </Button>
        </section>
      )}
    </div>
  );
}
