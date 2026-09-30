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
  FileEdit,
  Sparkles,
  ShieldCheck,
  CheckSquare,
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
import { ocrCard } from "@/lib/api/ocr";

const OCR_FAILURE_MESSAGE = "We couldn't read enough information from this card. Please retake the photo or enter the details manually.";

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

  const startCamera = useCallback(async () => {
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
      // play() can throw on unmount race — ignore
    }

    setStatus("live");
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, [startCamera]);

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
            className="relative aspect-[1.75/1] rounded-xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.65)]"
            style={{ width: "min(100%, 28rem, calc((100dvh - 15rem) * 1.75))" }}
          >
            {/* Subtle corner reticles */}
            <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-blue-400 rounded-tl-sm -mt-0.5 -ml-0.5" />
            <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-blue-400 rounded-tr-sm -mt-0.5 -mr-0.5" />
            <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-blue-400 rounded-bl-sm -mb-0.5 -ml-0.5" />
            <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-blue-400 rounded-br-sm -mb-0.5 -mr-0.5" />
          </div>
        </div>
      )}

      {/* ── Loading state ── */}
      {status === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/80 z-10">
          <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-blue-500 animate-spin" />
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
          <p className="text-white/70 text-sm leading-relaxed max-w-xs">{errorMsg}</p>
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
        <div className="absolute bottom-0 inset-x-0 z-20 flex flex-col items-center gap-4 px-5 pt-4 pb-[max(env(safe-area-inset-bottom,0px),24px)] bg-gradient-to-t from-black/90 to-transparent">
          <p className="max-w-sm text-center text-xs sm:text-sm leading-relaxed text-white/90">
            Position the business card within the frame and capture.
          </p>
          <button
            onClick={doCapture}
            className="flex min-h-13 w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-900/40 transition-colors hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white cursor-pointer"
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
    if (file.size > 2 * 1024 * 1024) {
      toast.error("File size must be less than 2 MB.");
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

    const interval = setInterval(() => {
      setScanProgress((p) => (p < 90 ? p + 12 : p));
    }, 350);

    try {
      const data = await ocrCard(selectedFile);
      clearInterval(interval);
      setScanProgress(100);

      setOcrData(data.parsed);
      setRawText(data.rawText);
      setIsReviewModalOpen(true);
    } catch (error: any) {
      clearInterval(interval);
      const message = error.message || OCR_FAILURE_MESSAGE;
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

      <div className="max-w-4xl mx-auto px-2 sm:px-6 py-4 sm:py-8 pb-20 space-y-8">
        {!selectedFile ? (
          /* ── 1. REDESIGNED LANDING PAGE ── */
          <section
            onDrop={handleDrop}
            onDragOver={(event) => event.preventDefault()}
            className="flex flex-col items-center justify-center text-center space-y-7 sm:space-y-9"
          >
            {/* Compact Header & Direct Actions */}
            <div className="max-w-2xl mx-auto space-y-3 pt-2 sm:pt-4">
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-slate-900 dark:text-white leading-[1.15]">
                Capture exhibition contacts quickly.
              </h1>
              <p className="text-sm sm:text-base leading-relaxed text-slate-600 dark:text-slate-300 max-w-xl mx-auto">
                Take a photo of a business card, review the details, and submit the contact for approval.
              </p>

              {/* Primary Call to Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-md mx-auto">
                <Button
                  size="lg"
                  onClick={() => setIsCameraOpen(true)}
                  className="h-12 w-full sm:w-auto sm:flex-1 rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white shadow-md shadow-blue-600/20 hover:bg-blue-700 transition-all cursor-pointer"
                >
                  <Camera className="w-4 h-4 mr-2" /> Scan a card
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => navigate("/submissions")}
                  className="h-12 w-full sm:w-auto sm:flex-1 rounded-xl border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 shadow-2xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Review queue <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>

              {/* Quick secondary upload & demo options */}
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pt-1 text-xs text-slate-500 dark:text-slate-400">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 hover:text-blue-600 transition-colors cursor-pointer py-1"
                >
                  <UploadCloud className="w-3.5 h-3.5" /> Upload card image
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={handleTriggerDemoCard}
                  className="inline-flex items-center gap-1 hover:text-blue-600 transition-colors cursor-pointer py-1"
                >
                  Try demo flow
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={handleManualEntry}
                  className="inline-flex items-center gap-1 hover:text-blue-600 transition-colors cursor-pointer py-1"
                >
                  Enter manually
                </button>
              </div>
            </div>

            {/* ── 3-STEP PROCESS VISUAL (No fake cards, restrained product panels) ── */}
            <div className="w-full max-w-3xl pt-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4 text-left">
                {/* Step 1: Capture */}
                <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/60 flex flex-col justify-between">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                        Step 1
                      </span>
                      <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center dark:bg-blue-950 dark:text-blue-400">
                        <Camera className="w-4 h-4" />
                      </div>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Capture
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Position the card inside the guided viewfinder with automatic cropping.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-400 font-medium">
                    1.75:1 Card Aspect Framing
                  </div>
                </div>

                {/* Step 2: Review */}
                <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/60 flex flex-col justify-between">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                        Step 2
                      </span>
                      <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center dark:bg-blue-950 dark:text-blue-400">
                        <CheckSquare className="w-4 h-4" />
                      </div>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Review
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Verify auto-extracted contact name, company, email, phone, and exhibition.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-400 font-medium">
                    Fully Editable Fields
                  </div>
                </div>

                {/* Step 3: Ready */}
                <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/60 flex flex-col justify-between">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                        Step 3
                      </span>
                      <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center dark:bg-emerald-950 dark:text-emerald-400">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Ready for approval
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Submits to the review register with automatic capture time and user audit.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-400 font-medium">
                    Google Sheet Workflow
                  </div>
                </div>
              </div>
            </div>

            {/* Subtle Trust & Information Note */}
            <div className="text-center text-xs text-slate-500 dark:text-slate-400 space-x-1.5 pt-1">
              <span>Enhanced by Google Cloud Vision.</span>
              <span>•</span>
              <button
                type="button"
                onClick={() => setIsInfoModalOpen(true)}
                className="underline underline-offset-2 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                How card reading works
              </button>
            </div>
          </section>
        ) : (
          /* ── 2. CARD LOADED & OCR PROCESSING WORKFLOW ── */
          <div className="rounded-2xl border border-slate-200 bg-white shadow-md overflow-hidden dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col md:flex-row min-h-[300px]">
              {/* Card Image Preview with Scanning Animation */}
              <div className="md:w-72 lg:w-80 bg-slate-100/90 dark:bg-slate-950/50 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 flex items-center justify-center p-5 min-h-[220px] md:min-h-0 shrink-0 relative overflow-hidden">
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt="Business Card Preview"
                    className="max-h-full max-w-full object-contain rounded-xl shadow-xs border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                  />
                )}
                {isScanning && <div className="animate-scanline opacity-90" />}
              </div>

              {/* Status Details & Actions */}
              <div className="flex-1 p-5 sm:p-6 flex flex-col justify-between gap-5 bg-white dark:bg-slate-900 min-w-0">
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="bg-emerald-50 text-emerald-600 p-2 rounded-xl border border-emerald-200 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-400 shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                          Card photo ready
                        </h3>
                        <p className="text-xs text-slate-500 truncate">{selectedFile.name}</p>
                      </div>
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 shrink-0 whitespace-nowrap">
                      {selectedFile.size > 1024 ? (selectedFile.size / 1024 / 1024).toFixed(2) : "0.48"} MB
                    </span>
                  </div>

                  {/* Processing Status Checklist */}
                  {isScanning ? (
                    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
                          <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                          <span>Reading card details…</span>
                        </div>
                        <span className="text-xs font-semibold text-slate-600 tabular-nums">
                          {scanProgress}%
                        </span>
                      </div>
                      <Progress value={scanProgress} className="h-1.5 bg-slate-200 dark:bg-slate-800" />
                      <p className="text-[11px] text-slate-500">
                        Extracting contact details with Google Cloud Vision.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        {scanError || (
                          <>
                            Select <strong className="text-slate-900 dark:text-white">Scan and extract</strong> to read this card. All details can be reviewed and edited before submission.
                          </>
                        )}
                      </p>
                    </div>
                  )}

                  {/* OCR Error Recovery Box (Retake or Manual Entry) */}
                  {scanError && !isScanning && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 dark:border-amber-900/50 dark:bg-amber-950/30">
                      <p className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-300">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" /> Other ways to continue
                      </p>
                      <p className="text-xs text-amber-800/90 dark:text-amber-400 mt-1">
                        {scanError}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsCameraOpen(true)}
                          className="h-8 text-xs font-medium border-amber-300 bg-white hover:bg-amber-50"
                        >
                          <Camera className="w-3.5 h-3.5 mr-1" /> Retake card
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleManualEntry}
                          className="h-8 text-xs font-medium border-amber-300 bg-white hover:bg-amber-50"
                        >
                          <FileEdit className="w-3.5 h-3.5 mr-1" /> Enter details manually
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Primary CTA and Secondary Actions */}
                <div className="flex flex-col gap-2.5 pt-2 w-full">
                  <Button
                    onClick={handleScan}
                    disabled={isScanning}
                    className="w-full h-11 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isScanning ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> Reading card details…
                      </>
                    ) : (
                      <>
                        <Scan className="w-4 h-4" /> Scan and extract
                      </>
                    )}
                  </Button>

                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isScanning}
                      className="h-9 rounded-xl text-xs font-medium border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
                    >
                      Change
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setIsCameraOpen(true)}
                      disabled={isScanning}
                      className="h-9 rounded-xl text-xs font-medium border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 flex items-center justify-center gap-1"
                    >
                      <Camera className="w-3 h-3" /> Retake
                    </Button>
                    <Button
                      variant="outline"
                      onClick={clearSelection}
                      disabled={isScanning}
                      className="h-9 rounded-xl text-xs font-medium border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400"
                    >
                      Cancel
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
        imageUrl={previewUrl || "/demo-card.svg"}
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
              <div className="flex size-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                <Sparkles className="size-4" aria-hidden="true" />
              </div>
              <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
                How card reading works
              </DialogTitle>
            </div>
            <DialogDescription className="text-sm leading-relaxed text-slate-600 dark:text-slate-300 pt-1">
              CardSnap by Vision71 uses Google Cloud Vision to detect and normalize text from your business card capture. Every extracted detail should be verified and corrected before submission.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-5 flex justify-end">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => setIsInfoModalOpen(false)}
              className="rounded-xl bg-blue-600 px-5 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
