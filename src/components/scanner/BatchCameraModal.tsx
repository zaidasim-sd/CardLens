/**
 * BatchCameraModal — Server-side card detection via Google Vision
 * ────────────────────────────────────────────────────────────────
 *
 * ARCHITECTURE
 * ─────────────
 * Live phase   : Full-viewport video.  A lightweight 8fps canvas scan counts
 *                approximate rectangular blobs — used only as a "composition
 *                guide" badge so the user knows how many cards are roughly
 *                visible.  NOT used for precise box positions.
 *
 * Capture      : Tapping "Capture" freezes the frame → POSTs the image to
 *                /api/detect-cards → Google Vision OBJECT_LOCALIZATION returns
 *                precise bounding boxes for every card → shown in review phase.
 *
 * Review phase : Frozen still + draggable / resizable SVG boxes.  User tweaks
 *                any box, adds missing ones, removes false positives.
 *
 * Confirm      : "Use N cards" emits { file, regions } to parent.
 *
 * This component is completely isolated from CameraModal.tsx (single-card flow).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, CameraOff, Check, Loader2, Plus, RotateCcw, Trash2, X } from "lucide-react";
import type { BatchRegion } from "@/lib/batchCapture";
import { MAX_BATCH_CARDS } from "@/lib/batchCapture";
import { apiFetch } from "@/lib/api/client";

// ─────────────────────────────────────────────────────────────────────────────
// LIGHTWEIGHT LIVE COUNTER  (composition guide only — not used for box coords)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fast approximate card count from a downsampled frame.
 * Uses a 6×4 grid scan: each cell scores how "card-like" it is based on
 * local contrast variance (text/print → high; blank table → low).
 * Adjacent high-score cells are merged into blobs with card-like aspect ratios.
 * Returns a count [0–10]. Runs in < 2ms on a 320×180 canvas.
 */
function countCardsApprox(data: Uint8ClampedArray, W: number, H: number): number {
  const COLS = 8, ROWS = 5;
  const cw = (W / COLS) | 0, ch = (H / ROWS) | 0;
  const scores: number[][] = [];

  for (let row = 0; row < ROWS; row++) {
    scores.push([]);
    for (let col = 0; col < COLS; col++) {
      const x0 = col * cw, y0 = row * ch;
      let sum = 0, sumSq = 0, n = 0;
      for (let y = y0; y < y0 + ch; y++) {
        for (let x = x0; x < x0 + cw; x++) {
          const i = (y * W + x) * 4;
          const l = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
          sum += l; sumSq += l * l; n++;
        }
      }
      const mean = sum / n;
      const variance = sumSq / n - mean * mean;
      scores[row].push(variance > 180 ? 1 : 0); // threshold tuned for card text
    }
  }

  // Flood-fill connected blobs
  const visited = Array.from({ length: ROWS }, () => new Array(COLS).fill(false));
  let blobs = 0;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!scores[r][c] || visited[r][c]) continue;
      // BFS
      const queue = [[r, c]];
      let minC = c, maxC = c, minR = r, maxR = r;
      visited[r][c] = true;
      let head = 0;
      while (head < queue.length) {
        const [cr, cc] = queue[head++];
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nr = cr+dr, nc = cc+dc;
          if (nr<0||nr>=ROWS||nc<0||nc>=COLS||visited[nr][nc]||!scores[nr][nc]) continue;
          visited[nr][nc] = true;
          minC = Math.min(minC, nc); maxC = Math.max(maxC, nc);
          minR = Math.min(minR, nr); maxR = Math.max(maxR, nr);
          queue.push([nr, nc]);
        }
      }
      // Filter by approximate aspect ratio
      const bw = (maxC - minC + 1) * cw;
      const bh = (maxR - minR + 1) * ch;
      const asp = bw / Math.max(1, bh);
      if (asp >= 0.9 && asp <= 5.5 && bw >= W * 0.08) blobs++;
    }
  }

  return Math.min(blobs, MAX_BATCH_CARDS);
}

// ─────────────────────────────────────────────────────────────────────────────
// COLOURS & HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const COLORS = [
  "#3B82F6","#10B981","#F59E0B","#8B5CF6",
  "#EF4444","#06B6D4","#F97316","#EC4899","#14B8A6","#6366F1",
];

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type Phase = "loading" | "live" | "detecting" | "review" | "error";

interface AdjBox extends BatchRegion {
  _drag?:   { pX: number; pY: number; ox: number; oy: number };
  _resize?: { pX: number; pY: number; ow: number; oh: number };
}

export interface BatchCaptureResult {
  file: File;
  regions: BatchRegion[];
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function BatchCameraModal({
  onCapture,
  onClose,
}: {
  onCapture: (result: BatchCaptureResult) => void;
  onClose: () => void;
}) {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const manualCtr  = useRef(0);
  const drawRef    = useRef<{ id: string; ix: number; iy: number } | null>(null);

  const [phase,       setPhase]       = useState<Phase>("loading");
  const [errorMsg,    setErrorMsg]    = useState("");
  const [approxCount, setApproxCount] = useState(0);   // live composition guide
  const [detectMsg,   setDetectMsg]   = useState("");  // detecting phase status
  const [stillUrl,    setStillUrl]    = useState<string | null>(null);
  const [stillW,      setStillW]      = useState(0);
  const [stillH,      setStillH]      = useState(0);
  const stillFileRef  = useRef<File | null>(null);
  const [boxes,       setBoxes]       = useState<AdjBox[]>([]);
  const [selId,       setSelId]       = useState<string | null>(null);

  // ── Camera start ──────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase("loading"); setApproxCount(0);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
    } catch (err: unknown) {
      const e = err as DOMException;
      setErrorMsg(
        e.name === "NotAllowedError" || e.name === "PermissionDeniedError"
          ? "Camera access was denied. Please allow camera access in your browser settings."
          : e.name === "NotFoundError" || e.name === "DevicesNotFoundError"
          ? "No camera found on this device."
          : e.name === "NotReadableError" || e.name === "TrackStartError"
          ? "Camera is in use by another application. Close it and try again."
          : `Camera error: ${(e as Error).message || e.name}`
      );
      setPhase("error"); return;
    }

    streamRef.current = stream;
    const video = videoRef.current!;
    video.srcObject = stream;

    await new Promise<void>(resolve => {
      if (video.readyState >= 1) { resolve(); return; }
      const fn = () => { video.removeEventListener("loadedmetadata", fn); resolve(); };
      video.addEventListener("loadedmetadata", fn);
    });
    try { await video.play(); } catch { /* unmount race */ }
    setPhase("live");
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startCamera]);

  // ── Live approximate count loop (~8fps) ───────────────────────────────────
  useEffect(() => {
    if (phase !== "live") return;
    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2 || video.paused) return;
      const W = 320, H = Math.round((video.videoHeight / video.videoWidth) * W) || 180;
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, W, H);
      const { data } = ctx.getImageData(0, 0, W, H);
      setApproxCount(countCardsApprox(data, W, H));
    };
    timerRef.current = setInterval(tick, 125);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  // ── Capture + Server-side detection ──────────────────────────────────────
  const doCapture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    // 1. Freeze frame BEFORE stopping stream
    const cap = document.createElement("canvas");
    cap.width = video.videoWidth; cap.height = video.videoHeight;
    cap.getContext("2d")!.drawImage(video, 0, 0);
    const dataUrl = cap.toDataURL("image/jpeg", 0.92);

    // 2. Stop stream
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);

    setStillUrl(dataUrl);
    setStillW(video.videoWidth);
    setStillH(video.videoHeight);
    setBoxes([]);
    setSelId(null);
    setDetectMsg("Detecting cards with Google Vision…");
    setPhase("detecting");

    // 3. Convert dataURL → Blob → File for submission
    let imageFile: File;
    try {
      const res  = await fetch(dataUrl);
      const blob = await res.blob();
      imageFile  = new File([blob], `batch-${Date.now()}.jpg`, { type: "image/jpeg" });
      stillFileRef.current = imageFile;
    } catch {
      setDetectMsg("Image preparation failed. Please retake.");
      return;
    }

    // 4. POST to /api/detect-cards
    try {
      const formData = new FormData();
      formData.append("image", imageFile);

      const result = await apiFetch<{
        cards: Array<{ id: string; number: number; x: number; y: number; width: number; height: number; source: "auto" }>;
        imageWidth: number | null;
        imageHeight: number | null;
        count: number;
      }>("/api/detect-cards", { method: "POST", body: formData });

      if (result.cards.length === 0) {
        // No cards found — go to review with empty boxes so user can draw manually
        setDetectMsg("");
        setBoxes([]);
      } else {
        // Scale server coords if server image dims don't match our canvas dims
        let scaleX = 1, scaleY = 1;
        if (result.imageWidth && result.imageHeight) {
          scaleX = video.videoWidth  / result.imageWidth;
          scaleY = video.videoHeight / result.imageHeight;
        }

        const scaled: AdjBox[] = result.cards.map((c, i) => ({
          id:     c.id || `srv-${i}`,
          number: i + 1,
          x:      Math.round(c.x * scaleX),
          y:      Math.round(c.y * scaleY),
          width:  Math.round(c.width  * scaleX),
          height: Math.round(c.height * scaleY),
          source: "auto" as const,
        }));

        setBoxes(scaled);
      }

      setPhase("review");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Card detection failed.";
      // Still go to review — user can draw boxes manually
      setDetectMsg(msg);
      setPhase("review");
    }
  }, []);

  // ── Confirm ───────────────────────────────────────────────────────────────
  const doConfirm = useCallback(async () => {
    if (boxes.length === 0) return;
    let file = stillFileRef.current;
    if (!file && stillUrl) {
      const res  = await fetch(stillUrl);
      const blob = await res.blob();
      file = new File([blob], `batch-${Date.now()}.jpg`, { type: "image/jpeg" });
      stillFileRef.current = file;
    }
    if (!file) return;
    const clean = boxes.map(({ _drag: _d, _resize: _r, ...b }) => b);
    onCapture({ file, regions: clean });
  }, [boxes, stillUrl, onCapture]);

  // ── Coordinate helper ─────────────────────────────────────────────────────
  const toImg = useCallback((cx: number, cy: number) => {
    const el = overlayRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: (cx - r.left) * (stillW / r.width), y: (cy - r.top) * (stillH / r.height) };
  }, [stillW, stillH]);

  // ── Draw new box ──────────────────────────────────────────────────────────
  const onOverlayDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || boxes.length >= MAX_BATCH_CARDS) return;
    const { x, y } = toImg(e.clientX, e.clientY);
    manualCtr.current++;
    const id = `m-${manualCtr.current}`;
    drawRef.current = { id, ix: x, iy: y };
    setBoxes(prev => [...prev, { id, number: prev.length + 1, x, y, width: 4, height: 4, source: "manual" }]);
    setSelId(id);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [boxes.length, toImg]);

  const onOverlayMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!drawRef.current) return;
    const { x, y } = toImg(e.clientX, e.clientY);
    const { id, ix, iy } = drawRef.current;
    setBoxes(prev => prev.map(b => b.id !== id ? b : {
      ...b, x: Math.min(ix, x), y: Math.min(iy, y),
      width: Math.max(4, Math.abs(x - ix)), height: Math.max(4, Math.abs(y - iy)),
    }));
  }, [toImg]);

  const onOverlayUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!drawRef.current) return;
    const { id } = drawRef.current; drawRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setBoxes(prev => {
      const b = prev.find(x => x.id === id);
      if (!b || b.width < stillW * 0.04 || b.height < stillH * 0.03) return prev.filter(x => x.id !== id);
      return prev;
    });
  }, [stillW, stillH]);

  // ── Box drag ──────────────────────────────────────────────────────────────
  const onBoxDown = useCallback((e: React.PointerEvent<SVGRectElement>, id: string) => {
    e.stopPropagation(); setSelId(id);
    const { x, y } = toImg(e.clientX, e.clientY);
    setBoxes(prev => prev.map(b => b.id !== id ? b : { ...b, _drag: { pX: x, pY: y, ox: b.x, oy: b.y } }));
    (e.target as Element).setPointerCapture(e.pointerId);
  }, [toImg]);

  const onBoxMove = useCallback((e: React.PointerEvent<SVGRectElement>, id: string) => {
    setBoxes(prev => {
      const b = prev.find(x => x.id === id);
      if (!b?._drag) return prev;
      const { x, y } = toImg(e.clientX, e.clientY);
      return prev.map(x2 => x2.id !== id ? x2 : {
        ...x2,
        x: Math.max(0, Math.min(stillW - b.width,  b._drag!.ox + x - b._drag!.pX)),
        y: Math.max(0, Math.min(stillH - b.height, b._drag!.oy + y - b._drag!.pY)),
      });
    });
  }, [toImg, stillW, stillH]);

  const onBoxUp = useCallback((e: React.PointerEvent<SVGRectElement>, id: string) => {
    (e.target as Element).releasePointerCapture(e.pointerId);
    setBoxes(prev => prev.map(b => b.id !== id ? b : { ...b, _drag: undefined }));
    setSelId(id);
  }, []);

  // ── Resize ────────────────────────────────────────────────────────────────
  const onResDown = useCallback((e: React.PointerEvent<SVGCircleElement>, id: string) => {
    e.stopPropagation();
    const { x, y } = toImg(e.clientX, e.clientY);
    setBoxes(prev => prev.map(b => b.id !== id ? b : { ...b, _resize: { pX: x, pY: y, ow: b.width, oh: b.height } }));
    (e.target as Element).setPointerCapture(e.pointerId);
  }, [toImg]);

  const onResMove = useCallback((e: React.PointerEvent<SVGCircleElement>, id: string) => {
    setBoxes(prev => {
      const b = prev.find(x => x.id === id);
      if (!b?._resize) return prev;
      const { x, y } = toImg(e.clientX, e.clientY);
      return prev.map(x2 => x2.id !== id ? x2 : {
        ...x2,
        width:  Math.max(stillW * 0.04, Math.min(stillW - b.x, b._resize!.ow + x - b._resize!.pX)),
        height: Math.max(stillH * 0.03, Math.min(stillH - b.y, b._resize!.oh + y - b._resize!.pY)),
      });
    });
  }, [toImg, stillW, stillH]);

  const onResUp = useCallback((e: React.PointerEvent<SVGCircleElement>, id: string) => {
    (e.target as Element).releasePointerCapture(e.pointerId);
    setBoxes(prev => prev.map(b => b.id !== id ? b : { ...b, _resize: undefined }));
  }, []);

  // ── Delete / Add ──────────────────────────────────────────────────────────
  const deleteBox = useCallback((id: string) => {
    setBoxes(prev => prev.filter(b => b.id !== id).map((b, i) => ({ ...b, number: i + 1 })));
    setSelId(null);
  }, []);

  const addBox = useCallback(() => {
    if (boxes.length >= MAX_BATCH_CARDS) return;
    manualCtr.current++;
    const id = `m-${manualCtr.current}`;
    const w = Math.round(stillW * 0.28), h = Math.round(w / 1.75);
    const x = Math.round((stillW - w) / 2 + (Math.random() - 0.5) * stillW * 0.1);
    const y = Math.round((stillH - h) / 2 + (Math.random() - 0.5) * stillH * 0.1);
    setBoxes(prev => [...prev, { id, number: prev.length + 1, x, y, width: w, height: h, source: "manual" }]);
    setSelId(id);
  }, [boxes.length, stillW, stillH]);

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#080b12", userSelect: "none" }}>

      {/* ══ LOADING ════════════════════════════════════════════════════════════ */}
      {phase === "loading" && (
        <div style={centeredCol}>
          <div style={spinner} />
          <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 14 }}>Starting camera…</p>
        </div>
      )}

      {/* ══ ERROR ══════════════════════════════════════════════════════════════ */}
      {phase === "error" && (
        <div style={{ ...centeredCol, padding: "0 32px", textAlign: "center" }}>
          <button onClick={onClose} style={{ ...pillBtn, position: "absolute", top: 16, left: 16 }}><X size={14} /> Cancel</button>
          <div style={{ background: "rgba(239,68,68,0.18)", padding: 20, borderRadius: "50%" }}><CameraOff size={44} color="#F87171" /></div>
          <p style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>Camera Unavailable</p>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, lineHeight: 1.6, maxWidth: 300 }}>{errorMsg}</p>
          <button onClick={startCamera} style={{ ...pillBtn, marginTop: 8 }}>Try Again</button>
        </div>
      )}

      {/* ══ LIVE ═══════════════════════════════════════════════════════════════ */}
      {(phase === "live" || phase === "loading") && (
        <>
          <video ref={videoRef} playsInline muted autoPlay
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover",
                     display: phase === "live" ? "block" : "none" }} />
          <canvas ref={canvasRef} style={{ display: "none" }} />

          {/* Top bar */}
          <div style={topBar}>
            <button onClick={onClose} style={pillBtn}><X size={14} /> Cancel</button>
            {phase === "live" && (
              <div style={{
                ...badgeBase,
                background: approxCount > 0 ? "rgba(16,185,129,0.88)" : "rgba(20,20,30,0.7)",
                transition: "background 0.3s",
              }}>
                <span style={{ ...dot, animation: approxCount > 0 ? "pulse 1.4s infinite" : "none",
                               background: approxCount > 0 ? "#fff" : "rgba(255,255,255,0.3)" }} />
                {approxCount === 0 ? "Scanning…" : `~${approxCount} card${approxCount !== 1 ? "s" : ""} in view`}
              </div>
            )}
            <div style={{ width: 80 }} />
          </div>

          {/* Bottom bar */}
          {phase === "live" && (
            <div style={bottomBar}>
              <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, textAlign: "center", maxWidth: 320 }}>
                {approxCount === 0
                  ? "Lay cards flat with gaps between them."
                  : "Tap Capture — Google Vision will precisely locate each card."}
              </p>
              <button onClick={doCapture} style={captureBtn}>
                <Camera size={20} />
                Capture
                {approxCount > 0 && <span style={countPill}>{approxCount}</span>}
              </button>
            </div>
          )}
        </>
      )}

      {/* ══ DETECTING ══════════════════════════════════════════════════════════ */}
      {phase === "detecting" && stillUrl && (
        <>
          {/* Frozen still — blurred while detecting */}
          <img src={stillUrl} alt="Captured" draggable={false}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%",
                     objectFit: "cover", filter: "blur(2px) brightness(0.6)" }} />
          <div style={{ ...centeredCol, position: "absolute", inset: 0 }}>
            <Loader2 size={44} color="#3B82F6" style={{ animation: "spin 0.9s linear infinite" }} />
            <p style={{ color: "#fff", fontWeight: 700, fontSize: 16, marginTop: 12 }}>Detecting cards…</p>
            <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, marginTop: 4 }}>Google Vision is locating each card</p>
          </div>
        </>
      )}

      {/* ══ REVIEW ═════════════════════════════════════════════════════════════ */}
      {phase === "review" && stillUrl && (
        <>
          <div
            ref={overlayRef}
            style={{ position: "absolute", inset: 0, cursor: "crosshair", touchAction: "none" }}
            onPointerDown={onOverlayDown}
            onPointerMove={onOverlayMove}
            onPointerUp={onOverlayUp}
          >
            <img src={stillUrl} alt="Captured" draggable={false}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.18)", pointerEvents: "none" }} />

            {/* Error / no-detection message */}
            {detectMsg && boxes.length === 0 && (
              <div style={{
                position: "absolute", bottom: 160, left: "50%", transform: "translateX(-50%)",
                background: "rgba(239,68,68,0.85)", borderRadius: 10, padding: "10px 16px",
                color: "#fff", fontSize: 12, fontWeight: 600, textAlign: "center", maxWidth: 280,
              }}>
                {detectMsg.includes("failed") || detectMsg.includes("error")
                  ? "Detection failed — draw boxes manually."
                  : "No cards detected — draw boxes manually."}
              </div>
            )}

            {/* SVG boxes */}
            <svg
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: "none", overflow: "visible" }}
              viewBox={`0 0 ${stillW} ${stillH}`}
              preserveAspectRatio="xMidYMid slice"
            >
              {boxes.map((b, i) => {
                const c = COLORS[i % COLORS.length];
                const sel = b.id === selId;
                return (
                  <g key={b.id}>
                    <rect x={b.x} y={b.y} width={b.width} height={b.height}
                      fill={c} fillOpacity={sel ? 0.14 : 0.06} rx={8}
                      style={{ cursor: "move", touchAction: "none" }}
                      onPointerDown={e => onBoxDown(e, b.id)}
                      onPointerMove={e => onBoxMove(e, b.id)}
                      onPointerUp={e => onBoxUp(e, b.id)}
                    />
                    <rect x={b.x} y={b.y} width={b.width} height={b.height}
                      fill="none" stroke={c} strokeWidth={sel ? 5 : 3.5} rx={8} pointerEvents="none" />
                    {([
                      [b.x, b.y, 1, 1], [b.x + b.width, b.y, -1, 1],
                      [b.x, b.y + b.height, 1, -1], [b.x + b.width, b.y + b.height, -1, -1],
                    ] as [number,number,number,number][]).map(([cx,cy,sx,sy], ci) => (
                      <g key={ci} pointerEvents="none">
                        <line x1={cx} y1={cy} x2={cx+sx*36} y2={cy} stroke={c} strokeWidth={4.5} strokeLinecap="round" />
                        <line x1={cx} y1={cy} x2={cx} y2={cy+sy*36} stroke={c} strokeWidth={4.5} strokeLinecap="round" />
                      </g>
                    ))}
                    <rect x={b.x+6} y={b.y+6} width={48} height={30} rx={7} fill={c} opacity={0.92} pointerEvents="none" />
                    <text x={b.x+30} y={b.y+26} textAnchor="middle" fontSize={18} fontWeight={700} fill="#fff" pointerEvents="none">{b.number}</text>
                    {/* Resize handle */}
                    <circle cx={b.x+b.width} cy={b.y+b.height} r={16} fill={c} opacity={0.88}
                      style={{ cursor: "se-resize", touchAction: "none" }}
                      onPointerDown={e => onResDown(e, b.id)}
                      onPointerMove={e => onResMove(e, b.id)}
                      onPointerUp={e => onResUp(e, b.id)}
                    />
                    <line x1={b.x+b.width-10} y1={b.y+b.height+1} x2={b.x+b.width+1} y2={b.y+b.height-10}
                      stroke="#fff" strokeWidth={2.5} strokeLinecap="round" pointerEvents="none" />
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Top bar */}
          <div style={topBar}>
            <button onClick={startCamera} style={pillBtn}><RotateCcw size={13} /> Retake</button>
            <span style={{ color: "rgba(255,255,255,0.9)", fontWeight: 700, fontSize: 14 }}>
              {boxes.length === 0 ? "Draw card regions" : `${boxes.length} card${boxes.length !== 1 ? "s" : ""} — adjust if needed`}
            </span>
            <button
              onClick={() => selId && deleteBox(selId)} disabled={!selId}
              style={{ ...pillBtn, color: selId ? "rgba(248,113,113,0.95)" : "rgba(255,255,255,0.3)", opacity: selId ? 1 : 0.5 }}
            >
              <Trash2 size={13} /> Remove
            </button>
          </div>

          {/* Hint */}
          <div style={{ position: "absolute", top: 58, left: 0, right: 0, zIndex: 30, display: "flex", justifyContent: "center" }}>
            <div style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", borderRadius: 999, padding: "4px 14px", fontSize: 11, color: "rgba(255,255,255,0.65)" }}>
              {boxes.length === 0
                ? "No cards detected — draw a box around each card"
                : "Drag to move · Drag ● to resize · Draw on empty area to add"}
            </div>
          </div>

          {/* Bottom bar */}
          <div style={{ ...bottomBar, flexDirection: "row", gap: 10 }}>
            <button onClick={addBox} disabled={boxes.length >= MAX_BATCH_CARDS} style={{
              ...pillBtn, borderRadius: 12, padding: "12px 18px", fontSize: 13,
              opacity: boxes.length >= MAX_BATCH_CARDS ? 0.4 : 1,
            }}>
              <Plus size={15} /> Add card
            </button>
            <button
              onClick={() => void doConfirm()} disabled={boxes.length === 0}
              style={{
                flex: 1, maxWidth: 280,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                background: boxes.length > 0 ? "#2563EB" : "rgba(37,99,235,0.38)",
                color: "#fff", border: "none", borderRadius: 14,
                padding: "14px 20px", fontSize: 15, fontWeight: 700,
                cursor: boxes.length > 0 ? "pointer" : "default",
                boxShadow: boxes.length > 0 ? "0 4px 20px rgba(37,99,235,0.45)" : "none",
              }}
            >
              <Check size={18} />
              Crop and process {boxes.length} card{boxes.length !== 1 ? "s" : ""}
            </button>
          </div>
        </>
      )}

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
      `}</style>
    </div>,
    document.body
  );
}

// ─── Shared style objects ─────────────────────────────────────────────────────
const centeredCol: React.CSSProperties = {
  position: "absolute", inset: 0,
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12,
};

const spinner: React.CSSProperties = {
  width: 40, height: 40, borderRadius: "50%",
  border: "2px solid rgba(255,255,255,0.15)", borderTopColor: "#3B82F6",
  animation: "spin 0.8s linear infinite",
};

const pillBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 5,
  color: "rgba(255,255,255,0.82)", background: "rgba(0,0,0,0.45)",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 999, padding: "7px 14px",
  fontSize: 12, fontWeight: 600, cursor: "pointer",
  backdropFilter: "blur(8px)",
};

const badgeBase: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 999, padding: "6px 14px",
  color: "#fff", fontSize: 13, fontWeight: 700,
  display: "flex", alignItems: "center", gap: 6,
  backdropFilter: "blur(8px)",
};

const dot: React.CSSProperties = {
  width: 7, height: 7, borderRadius: "50%", display: "inline-block",
};

const topBar: React.CSSProperties = {
  position: "absolute", top: 0, left: 0, right: 0, zIndex: 30,
  padding: "env(safe-area-inset-top,12px) 16px 12px",
  background: "linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, transparent 100%)",
  display: "flex", alignItems: "center", justifyContent: "space-between",
};

const bottomBar: React.CSSProperties = {
  position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 30,
  padding: `16px 20px max(env(safe-area-inset-bottom,20px),20px)`,
  background: "linear-gradient(to top, rgba(0,0,0,0.90) 0%, rgba(0,0,0,0.5) 70%, transparent 100%)",
  display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
};

const captureBtn: React.CSSProperties = {
  width: "100%", maxWidth: 340,
  background: "#2563EB", color: "#fff", border: "none", borderRadius: 14,
  padding: "15px 24px", fontSize: 16, fontWeight: 700, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  boxShadow: "0 4px 24px rgba(37,99,235,0.45)",
};

const countPill: React.CSSProperties = {
  background: "rgba(255,255,255,0.22)", borderRadius: 999,
  padding: "2px 10px", fontSize: 13, fontWeight: 700,
};
