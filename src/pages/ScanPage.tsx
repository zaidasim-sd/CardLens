import { hasReadableContact, NO_CONTACT_MESSAGE } from "../../shared/contactValidation.mjs";
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  Camera,
  UploadCloud,
  X,
  RefreshCw,
  Scan,
  CheckCircle2,
  CameraOff,
  ArrowRight,
  AlertTriangle,
  Play,
  FileEdit,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import OCRReviewModal from "@/components/scanner/OCRReviewModal";
import { SINGLE_DEMO_CARD } from "@/config/demoCards";
import type { OCRData } from "@/types";
import { cropBusinessCardImage } from "@/lib/imageCrop";
import { apiFetch } from "@/lib/api";

const OCR_FAILURE_MESSAGE = "We could not read this card. Capture the card again or enter the details manually.";

// ─── Camera Modal (rendered into document.body via portal) ───────────────────
function CameraModal({
  onCapture,
  onClose,
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardFrameRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const capturedRef = useRef(false);

  const [status, setStatus] = useState<"loading" | "live" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  // ── start / restart stream ──────────────────────────────────────────────────
  const startCamera = useCallback(
    async () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      capturedRef.current = false;
      setStatus("loading");

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
      } catch (err: unknown) {
        const e = err as DOMException;
        setStatus("error");
        if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
          setErrorMsg(
            "Camera access was denied. Please allow camera permission in your browser settings and try again."
          );
        } else if (e.name === "NotFoundError" || e.name === "DevicesNotFoundError") {
          setErrorMsg("No camera found on this device.");
        } else if (e.name === "NotReadableError" || e.name === "TrackStartError") {
          setErrorMsg(
            "Camera is currently in use by another application. Please close it and try again."
          );
        } else {
          setErrorMsg(`Camera error: ${e.message || e.name}`);
        }
        return;
      }

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;

      video.srcObject = stream;

      await new Promise<void>((resolve) => {
        const onReady = () => {
          video.removeEventListener("loadedmetadata", onReady);
          resolve();
        };
        if (video.readyState >= 1) {
          resolve();
        } else {
          video.addEventListener("loadedmetadata", onReady);
        }
      });

      try {
        await video.play();
      } catch {
        // play() can throw on unmount race — silently ignore
      }

      setStatus("live");
    },
    []
  );

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doCapture = useCallback(async () => {
    if (capturedRef.current) return;

    const video = videoRef.current;
    const cardFrame = cardFrameRef.current;
    if (!video || !video.videoWidth || !cardFrame) return;

    capturedRef.current = true;

    const videoRect = video.getBoundingClientRect();
    const frameRect = cardFrame.getBoundingClientRect();
    const coverScale = Math.max(
      videoRect.width / video.videoWidth,
      videoRect.height / video.videoHeight
    );
    const renderedWidth = video.videoWidth * coverScale;
    const renderedHeight = video.videoHeight * coverScale;
    const renderedOffsetX = (videoRect.width - renderedWidth) / 2;
    const renderedOffsetY = (videoRect.height - renderedHeight) / 2;

    const requestedX =
      (frameRect.left - videoRect.left - renderedOffsetX) / coverScale;
    const requestedY =
      (frameRect.top - videoRect.top - renderedOffsetY) / coverScale;
    const sourceX = Math.max(0, requestedX);
    const sourceY = Math.max(0, requestedY);
    const sourceWidth = Math.min(
      frameRect.width / coverScale,
      video.videoWidth - sourceX
    );
    const sourceHeight = Math.min(
      frameRect.height / coverScale,
      video.videoHeight - sourceY
    );

    const cap = document.createElement("canvas");
    cap.width = Math.max(1, Math.round(sourceWidth));
    cap.height = Math.max(1, Math.round(sourceHeight));
    const ctx = cap.getContext("2d")!;
    ctx.drawImage(
      video,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      cap.width,
      cap.height
    );

    cap.toBlob(
      async (blob) => {
        if (!blob) {
          capturedRef.current = false;
          return;
        }
        const capturedFile = new File([blob], `card-${Date.now()}-cropped.jpg`, {
          type: "image/jpeg",
        });

        streamRef.current?.getTracks().forEach((track) => track.stop());
        onCapture(capturedFile);
      },
      "image/jpeg",
      0.95
    );
  }, [onCapture]);

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#090D16",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Full-screen video ── */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: status === "live" ? "block" : "none",
        }}
      />

      {status === "live" && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center px-5 pb-16 z-10">
          <div
            ref={cardFrameRef}
            aria-label="Business card capture frame"
            className="relative aspect-[1.75/1] rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]"
            style={{ width: "min(100%, 28rem, calc((100dvh - 15rem) * 1.75))" }}
          />
        </div>
      )}

      {/* ── Loading state ── */}
      {status === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70 z-10">
          <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          <p className="text-sm font-medium">Initializing camera…</p>
        </div>
      )}

      {/* ── Error state ── */}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center z-10">
          <div className="bg-red-500/20 p-4 rounded-full">
            <CameraOff className="w-10 h-10 text-red-400" />
          </div>
          <p className="text-white font-bold text-lg">Camera Unavailable</p>
          <p className="text-white/60 text-sm leading-relaxed max-w-xs">{errorMsg}</p>
          <button
            onClick={() => startCamera()}
            className="mt-2 px-6 py-2.5 rounded-full border border-white/20 text-white text-xs font-semibold hover:bg-white/10 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {/* ── Top Bar ── */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-white/90 hover:text-white transition-colors text-xs font-semibold min-h-11 py-2 px-4 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/10"
        >
          <X className="w-4 h-4" />
          Cancel
        </button>

      </div>

      {status === "live" && (
        <div className="absolute bottom-0 inset-x-0 z-20 flex flex-col items-center gap-5 px-5 pt-6 pb-[max(env(safe-area-inset-bottom,0px),24px)] bg-gradient-to-t from-black/90 to-transparent">
          <p className="max-w-sm text-center text-sm leading-relaxed text-white">
            Position the business card within the frame and take a clear photo.
          </p>
          <button
            onClick={doCapture}
            className="flex min-h-14 w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-white px-6 py-4 text-base font-semibold text-slate-950 shadow-lg transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            <Camera className="h-5 w-5" aria-hidden="true" />
            Capture card
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}

// ─── Main ScanPage Component ──────────────────────────────────────────────────
export default function ScanPage() {
  const navigate = useNavigate();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);

  const [ocrData, setOcrData] = useState<any>(null);
  const [rawText, setRawText] = useState("");
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast.error("Invalid file type. Please upload a JPG, PNG, or WEBP image.");
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      toast.error("File size must be less than 1.5 MB.");
      return;
    }
    try {
      const croppedFile = await cropBusinessCardImage(file, file.name);
      if (previewUrl && previewUrl !== "/demo-card.svg") URL.revokeObjectURL(previewUrl);
      setScanError(null);
      setIsDemoMode(false);
      setSelectedFile(croppedFile);
      setPreviewUrl(URL.createObjectURL(croppedFile));
    } catch {
      toast.error("We could not prepare this image. Please try another photo.");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) void processFile(e.target.files[0]);
    e.target.value = "";
  };

  const handleCameraCapture = (file: File) => {
    setIsCameraOpen(false);
    setScanError(null);
    setIsDemoMode(false);
    if (previewUrl && previewUrl !== "/demo-card.svg") URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) void processFile(file);
  };

  const handleScan = async () => {
    if (!selectedFile) return;
    setScanError(null);
    setIsReviewModalOpen(false);

    // ── Demo card shortcut: skip OCR entirely, use pre-baked data ──
    // This handles the case where the user dismisses the review popup
    // then clicks "Scan & Extract" again on the already-loaded demo file.
    if (isDemoMode || selectedFile.name === "demo-card.svg") {
      setIsScanning(true);
      setScanProgress(40);
      const timer = setInterval(() => setScanProgress((p) => (p < 90 ? p + 25 : p)), 150);
      setTimeout(() => {
        clearInterval(timer);
        setScanProgress(100);
        setIsScanning(false);
        setOcrData(SINGLE_DEMO_CARD.preparedData);
        setRawText(SINGLE_DEMO_CARD.rawOCRText);
        setIsDemoMode(true);
        setIsReviewModalOpen(true);
        setTimeout(() => setScanProgress(0), 400);
      }, 600);
      return;
    }

    setIsScanning(true);
    setScanProgress(15);

    const formData = new FormData();
    formData.append("image", selectedFile);

    const interval = setInterval(() => {
      setScanProgress((p) => (p < 90 ? p + 12 : p));
    }, 350);

    try {
      const data = await apiFetch("/api/ocr", { method: "POST", body: formData });
      clearInterval(interval);
      setScanProgress(100);
      if (!hasReadableContact(data.rawText, data.parsed)) throw new Error(NO_CONTACT_MESSAGE);
      setOcrData(data.parsed);
      setRawText(data.rawText);
      setIsReviewModalOpen(true);
    } catch (error: unknown) {
      clearInterval(interval);
      const message = OCR_FAILURE_MESSAGE;
      setScanError(message);
      toast.error(message);
    } finally {
      setIsScanning(false);
      setTimeout(() => setScanProgress(0), 500);
    }
  };

  const handleTriggerDemoCard = async () => {
    setScanError(null);

    let demoFile: File;
    try {
      const res = await fetch("/demo-card.svg");
      const blob = await res.blob();
      demoFile = new File([blob], "demo-card.svg", { type: "image/svg+xml" });
    } catch {
      demoFile = new File([new Blob(["demo-card"])], "demo-card.svg", { type: "image/png" });
    }

    setSelectedFile(demoFile);
    setPreviewUrl(SINGLE_DEMO_CARD.imagePath);
    setIsScanning(true);
    setScanProgress(35);

    const timer = setInterval(() => {
      setScanProgress((p) => (p < 90 ? p + 30 : p));
    }, 200);

    setTimeout(() => {
      clearInterval(timer);
      setScanProgress(100);
      setIsScanning(false);
      setOcrData(SINGLE_DEMO_CARD.preparedData);
      setRawText(SINGLE_DEMO_CARD.rawOCRText);
      setIsDemoMode(true);
      setIsReviewModalOpen(true);
      setTimeout(() => setScanProgress(0), 400);
    }, 800);
  };

  const handleManualEntry = () => {
    setScanError(null);
    const blankData: OCRData = {
      fullName: "",
      jobTitle: "",
      companyName: "",
      email: "",
      phone: "",
      alternatePhone: "",
      website: "",
      address: "",
      city: "",
      country: "",
      notes: "",
    };
    setSelectedFile(null);
    setPreviewUrl("/demo-card.svg");
    setOcrData(blankData);
    setRawText("");
    setIsDemoMode(false);
    setIsReviewModalOpen(true);
  };

  const clearSelection = () => {
    setScanError(null);
    setSelectedFile(null);
    if (previewUrl && previewUrl !== "/demo-card.svg") URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setIsDemoMode(false);
  };

  return (
    <>
      {isCameraOpen && (
        <CameraModal
          onCapture={handleCameraCapture}
          onClose={() => setIsCameraOpen(false)}
        />
      )}

      {/* Hidden file input always available */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10 pb-24 space-y-10">
        {!selectedFile ? (
          <section
            onDrop={handleDrop}
            onDragOver={(event) => event.preventDefault()}
            className="mx-auto flex min-h-[min(64vh,600px)] max-w-3xl flex-col items-center justify-center py-12 text-center sm:py-20"
          >
            <div className="w-full">
              <h1 className="mx-auto max-w-2xl text-balance text-4xl font-semibold leading-[1.13] tracking-tight text-slate-900 dark:text-white sm:text-5xl md:text-6xl">
                Capture exhibition contacts in seconds
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-pretty text-base leading-7 text-slate-600 dark:text-slate-300 sm:text-lg sm:leading-8">
                Take a photo of a business card, review the details, and submit the contact for approval.
              </p>
              <div className="mx-auto mt-9 flex w-full max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
                <Button
                  size="lg"
                  onClick={() => setIsCameraOpen(true)}
                  className="h-13 w-full rounded-xl bg-slate-900 px-6 text-sm font-semibold text-white shadow-lg shadow-slate-900/15 transition-transform hover:-translate-y-0.5 hover:bg-black dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 sm:w-auto sm:flex-1 cursor-pointer"
                >
                  <Camera className="size-4" /> Scan Card
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => navigate("/verified")}
                  className="h-13 w-full rounded-xl border-slate-300 bg-transparent px-6 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 sm:w-auto cursor-pointer"
                >
                  Review Queue <ArrowRight className="size-4" />
                </Button>
              </div>

              {/* Compact Trust Row */}
              <div className="mx-auto mt-6 flex max-w-xl flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200/90 bg-slate-50/80 px-4 py-2.5 text-center text-xs dark:border-slate-800 dark:bg-slate-900/50 shadow-xs sm:flex-row sm:flex-wrap sm:gap-x-2.5 sm:gap-y-1">
                <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
                  <Sparkles className="size-3.5 text-slate-700 dark:text-slate-300" aria-hidden="true" />
                  Enhanced card reading
                </span>
                <span className="hidden text-slate-300 dark:text-slate-600 sm:inline">•</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  Powered by Google Cloud Vision
                </span>
                <span className="hidden text-slate-300 dark:text-slate-600 sm:inline">•</span>
                <span className="text-slate-600 dark:text-slate-400">
                  Every detail remains editable before submission.
                </span>
                <button
                  type="button"
                  onClick={() => setIsInfoModalOpen(true)}
                  className="text-slate-600 underline underline-offset-2 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer"
                >
                  How card reading works
                </button>
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 px-3 text-sm font-medium text-slate-500 underline-offset-4 hover:text-slate-900 hover:underline dark:text-slate-400 dark:hover:text-white cursor-pointer"
              >
                <UploadCloud className="size-4" /> Have an image already? Upload a card
              </button>
              <button type="button" onClick={handleTriggerDemoCard} className="mx-auto mt-2 flex min-h-11 items-center justify-center px-3 text-sm text-slate-500 underline underline-offset-4 cursor-pointer">
                Try anonymised demo
              </button>
            </div>
          </section>
        ) : (
          /* ── 2. CARD LOADED & OCR PROCESSING WORKFLOW ── */
          <div className="rounded-3xl border border-border bg-card shadow-xl overflow-hidden">
            <div className="flex flex-col md:flex-row min-h-[320px]">
              {/* Card Image Preview with Scanning Animation */}
              <div className="md:w-72 lg:w-80 bg-slate-100/80 dark:bg-slate-900/50 border-b md:border-b-0 md:border-r border-border flex items-center justify-center p-5 sm:p-6 min-h-[220px] md:min-h-0 shrink-0 relative overflow-hidden">
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt="Business Card Preview"
                    className="max-h-full max-w-full object-contain rounded-xl shadow-md border border-slate-200 dark:border-slate-800"
                  />
                )}
                {/* Laser scan line sweep when scanning */}
                {isScanning && <div className="animate-scanline opacity-90" />}
              </div>

              {/* Status Details & Actions */}
              <div className="flex-1 p-5 sm:p-6 lg:p-7 flex flex-col justify-between gap-5 bg-background min-w-0">
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="bg-emerald-500/10 p-2 rounded-xl text-emerald-600 dark:text-emerald-400 shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-base text-foreground truncate">Card Image Loaded</h3>
                        <p className="text-xs text-muted-foreground truncate">{selectedFile.name}</p>
                      </div>
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-muted text-muted-foreground shrink-0 whitespace-nowrap">
                      {selectedFile.size > 1024 ? (selectedFile.size / 1024 / 1024).toFixed(2) : "0.48"} MB
                    </span>
                  </div>

                  {/* Processing Status Checklist */}
                  {isScanning ? (
                    <div className="space-y-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                            <RefreshCw className="size-4 animate-spin text-slate-600 dark:text-slate-400" aria-hidden="true" />
                            <span>Reading card details</span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Enhanced by Google Cloud Vision
                          </p>
                        </div>
                        <span className="text-xs font-semibold text-slate-500 tabular-nums">
                          {scanProgress}%
                        </span>
                      </div>
                      <Progress value={scanProgress} className="h-1.5 bg-slate-200/80 dark:bg-slate-800" />
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
                        <span>Every detail remains editable before submission.</span>
                        <button
                          type="button"
                          onClick={() => setIsInfoModalOpen(true)}
                          className="underline underline-offset-2 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                        >
                          How card reading works
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {scanError || (
                          <>
                            Select <strong className="text-foreground">Scan and extract</strong> to read this card. Every detail remains editable before submission.
                          </>
                        )}
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsInfoModalOpen(true)}
                        className="inline-flex items-center text-xs text-slate-500 underline underline-offset-2 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer"
                      >
                        How card reading works
                      </button>
                    </div>
                  )}
                  {scanError && !isScanning && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
                      <p className="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
                        <AlertTriangle className="size-4" /> Other ways to continue
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}><UploadCloud className="size-4" /> Upload another image</Button>
                        <Button variant="outline" size="sm" onClick={handleManualEntry}><FileEdit className="size-4" /> Enter manually</Button>
                        <Button variant="outline" size="sm" onClick={handleTriggerDemoCard}><Play className="size-4" /> Try demo flow</Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions — Primary full-width, secondary responsive grid */}
                <div className="flex flex-col gap-2.5 pt-2 w-full">
                  {/* Primary CTA — always full width */}
                  <Button
                    onClick={handleScan}
                    disabled={isScanning}
                    className="w-full h-11 rounded-xl text-sm font-semibold bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 shadow-md shadow-slate-900/20 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isScanning ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> Reading card details…
                      </>
                    ) : (
                      <>
                        <Scan className="w-4 h-4 text-white dark:text-slate-900" /> Scan and extract
                      </>
                    )}
                  </Button>

                  {/* Secondary actions:
                      Mobile  → Change Image full-width, then Retake | Cancel in 2-col
                      sm+     → all three in a flat 3-col grid                         */}
                  <div className="flex flex-col sm:hidden gap-2">
                    <Button
                      variant="outline"
                      onClick={clearSelection}
                      disabled={isScanning}
                      className="w-full h-10 rounded-xl text-xs font-semibold border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-900/5 dark:hover:bg-slate-800/60 cursor-pointer"
                    >
                      Change Image
                    </Button>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setIsCameraOpen(true)}
                        disabled={isScanning}
                        className="h-10 rounded-xl text-xs font-semibold border-slate-900/20 dark:border-slate-700 text-slate-900 dark:text-white bg-slate-900/5 dark:bg-slate-800/40 hover:bg-slate-900/10 dark:hover:bg-slate-800 hover:border-slate-900/40 flex items-center justify-center gap-1.5 cursor-pointer"
                        title="Retake camera capture"
                      >
                        <Camera className="w-3.5 h-3.5" /><span>Retake</span>
                      </Button>
                      <Button
                        variant="outline"
                        onClick={clearSelection}
                        disabled={isScanning}
                        className="h-10 rounded-xl text-xs font-semibold border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-900/5 dark:hover:bg-slate-800/60 flex items-center justify-center gap-1.5 cursor-pointer"
                        title="Return to welcome screen"
                      >
                        <X className="w-3.5 h-3.5" /><span>Cancel</span>
                      </Button>
                    </div>
                  </div>

                  {/* sm+ flat 3-col */}
                  <div className="hidden sm:grid sm:grid-cols-3 gap-2">
                    <Button
                      variant="outline"
                      onClick={clearSelection}
                      disabled={isScanning}
                      className="h-10 rounded-xl text-xs font-semibold border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-900/5 dark:hover:bg-slate-800/60 cursor-pointer"
                    >
                      Change Image
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setIsCameraOpen(true)}
                      disabled={isScanning}
                      className="h-10 rounded-xl text-xs font-semibold border-slate-900/20 dark:border-slate-700 text-slate-900 dark:text-white bg-slate-900/5 dark:bg-slate-800/40 hover:bg-slate-900/10 dark:hover:bg-slate-800 hover:border-slate-900/40 flex items-center justify-center gap-1.5 cursor-pointer"
                      title="Retake camera capture"
                    >
                      <Camera className="w-3.5 h-3.5" /><span>Retake</span>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={clearSelection}
                      disabled={isScanning}
                      className="h-10 rounded-xl text-xs font-semibold border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-900/5 dark:hover:bg-slate-800/60 flex items-center justify-center gap-1.5 cursor-pointer"
                      title="Return to welcome screen"
                    >
                      <X className="w-3.5 h-3.5" /><span>Cancel</span>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <OCRReviewModal
        isOpen={isReviewModalOpen}
        setIsOpen={setIsReviewModalOpen}
        ocrData={ocrData}
        rawText={rawText}
        originalImage={selectedFile}
        imageUrl={previewUrl!}
        isDemo={isDemoMode}
        onSuccess={() => {
          setIsReviewModalOpen(false);
          clearSelection();
        }}
      />

      {/* Information Modal: How card reading works */}
      <Dialog open={isInfoModalOpen} onOpenChange={setIsInfoModalOpen}>
        <DialogContent className="max-w-md w-[92vw] sm:max-w-[440px] p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-background shadow-xl">
          <DialogHeader className="space-y-2 text-left">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                <Sparkles className="size-4" aria-hidden="true" />
              </div>
              <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
                How card reading works
              </DialogTitle>
            </div>
            <DialogDescription className="text-sm leading-relaxed text-slate-600 dark:text-slate-300 pt-1">
              CardSnap by Vision71 uses Google Cloud Vision as its primary text-extraction service. Every extracted detail should be reviewed and corrected before submission.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-5 flex justify-end">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => setIsInfoModalOpen(false)}
              className="rounded-xl bg-slate-900 px-5 text-xs font-semibold text-white hover:bg-black dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 cursor-pointer"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}



