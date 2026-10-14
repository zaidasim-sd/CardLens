import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Camera, CameraOff } from "lucide-react";

/**
 * Full-screen camera capture modal.
 * Rendered into document.body via React portal to escape any overflow:hidden
 * ancestors in the layout tree.
 *
 * Props
 * ─────
 * onCapture  – called with the captured File when the user presses the shutter.
 * onClose    – called when the user presses Cancel.
 * label      – optional text shown in the bottom instruction bar (default: "card").
 */
export function CameraModal({
  onCapture,
  onClose,
  label = "card",
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
  label?: string;
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

    // Wait for metadata before calling play() to avoid "stuck on loading" bug
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

    // Map the guide frame back to video pixel coordinates, with generous padding
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

    const baseWidth = frameRect.width / coverScale;
    const baseHeight = frameRect.height / coverScale;

    const padY = baseHeight * 0.30; // 30% extra top/bottom so card is never cropped
    const padX = baseWidth * 0.18;  // 18% extra left/right

    const rawX = (frameRect.left - videoRect.left - renderedOffsetX) / coverScale - padX;
    const rawY = (frameRect.top - videoRect.top - renderedOffsetY) / coverScale - padY;
    const rawWidth = baseWidth + padX * 2;
    const rawHeight = baseHeight + padY * 2;

    const sourceX = Math.max(0, rawX);
    const sourceY = Math.max(0, rawY);
    const sourceWidth = Math.min(rawWidth - (sourceX - rawX), video.videoWidth - sourceX);
    const sourceHeight = Math.min(rawHeight - (sourceY - rawY), video.videoHeight - sourceY);

    const maxDimension = 1800;
    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));

    const cap = document.createElement("canvas");
    cap.width = Math.max(1, Math.round(sourceWidth * scale));
    cap.height = Math.max(1, Math.round(sourceHeight * scale));
    const ctx = cap.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, cap.width, cap.height);

    cap.toBlob(
      (blob) => {
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
      {/* Full-screen video — no letterbox, edge to edge */}
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

      {/* Card guide frame */}
      {status === "live" && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center px-5 pb-16 z-10">
          <div
            ref={cardFrameRef}
            aria-label="Business card capture frame"
            className="relative aspect-[1.75/1] rounded-xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.65)]"
            style={{ width: "min(100%, 28rem, calc((100dvh - 15rem) * 1.75))" }}
          >
            {/* Corner reticles */}
            <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-blue-400 rounded-tl-sm -mt-0.5 -ml-0.5" />
            <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-blue-400 rounded-tr-sm -mt-0.5 -mr-0.5" />
            <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-blue-400 rounded-bl-sm -mb-0.5 -ml-0.5" />
            <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-blue-400 rounded-br-sm -mb-0.5 -mr-0.5" />
          </div>
        </div>
      )}

      {/* Loading */}
      {status === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/80 z-10">
          <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-blue-500 animate-spin" />
          <p className="text-sm font-medium">Initializing camera…</p>
        </div>
      )}

      {/* Error */}
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

      {/* Top bar — floats over the video */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-white/90 hover:text-white transition-colors text-xs font-semibold min-h-11 py-2 px-4 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/10"
        >
          <X className="w-4 h-4" />
          Cancel
        </button>
      </div>

      {/* Bottom — shutter button, floats over the video */}
      {status === "live" && (
        <div className="absolute bottom-0 inset-x-0 z-20 flex flex-col items-center gap-4 px-5 pt-4 pb-[max(env(safe-area-inset-bottom,0px),24px)] bg-gradient-to-t from-black/90 to-transparent">
          <p className="max-w-sm text-center text-xs sm:text-sm leading-relaxed text-white/90">
            Position the {label} within the frame, then tap capture.
          </p>
          <button
            onClick={doCapture}
            className="flex min-h-[52px] w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-900/40 transition-colors hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white cursor-pointer"
          >
            <Camera className="h-5 w-5" aria-hidden="true" />
            Capture {label}
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}
