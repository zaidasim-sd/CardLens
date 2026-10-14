import { useState, useEffect } from "react";
import { getExhibitions, type ExhibitionOption } from "@/lib/api/exhibitions";
import type { OCRData } from "@/types";
import type { ClassificationComparison as Comparison } from "@/lib/api/ocr";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const fields = [
  ["fullName", "Contact name"], ["companyName", "Company name"], ["jobTitle", "Job title"],
  ["email", "Email address"], ["phone", "Phone number"],
] as const;
const seconds = (ms: number) => `${(ms / 1000).toFixed(3)} s`;

export default function ClassificationComparison({ comparison, onCancel, onChoose }: {
  comparison: Comparison;
  onCancel: () => void;
  onChoose: (data: OCRData) => void;
}) {
  const [manual, setManual] = useState(comparison.manual);
  const [ai, setAi] = useState(comparison.ai);
  const [exhibitions, setExhibitions] = useState<ExhibitionOption[]>([]);
  const [source, setSource] = useState("");
  useEffect(() => {
    let active = true;
    void getExhibitions().then(options => {
      if (!active) return;
      setExhibitions(options);
      setSource(options.find(option => option.value)?.value || "");
    });
    return () => { active = false; };
  }, []);
  return <Dialog open onOpenChange={open => { if (!open) onCancel(); }}>
    <DialogContent className="w-[95vw] sm:max-w-5xl max-h-[90dvh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Compare extracted fields</DialogTitle>
        <DialogDescription>Both methods use the same card text. Edit either form, then choose a result to review and save. Times include OCR and classification, excluding upload and network time.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-5 md:grid-cols-2">
        {(["manual", "ai"] as const).map(mode => {
          const data = mode === "manual" ? manual : ai;
          const duration = mode === "manual" ? comparison.manualClassificationMs : comparison.aiClassificationMs;
          const total = mode === "manual" ? comparison.manualTotalMs : comparison.aiTotalMs;
          return <form key={mode} className="space-y-3 rounded-xl border p-4" onSubmit={event => { event.preventDefault(); if (data) onChoose({ ...data, meetingContext: { ...data.meetingContext, metAtLocation: source } }); }}>
            <h3 className="font-semibold">{mode === "manual" ? "Manual method" : "AI classification"}</h3>
            <p className="text-sm font-medium">{data ? "Processing time" : "Attempt time"}: {seconds(total)}</p>
            <p className="text-xs text-muted-foreground">OCR {seconds(comparison.ocrMs)} + classification {seconds(duration)}</p>
            {data && <label className="block text-xs font-medium">Exhibition / Source
              <select required value={source} onChange={event => setSource(event.target.value)} className="mt-1 block min-h-10 w-full rounded-md border bg-background px-3 py-2 text-sm">
                <option value="">Select exhibition</option>
                {exhibitions.filter(option => option.value).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>}
            {data ? fields.map(([key, label]) => <label key={key} className="block text-xs font-medium">
              {label}
              <input value={data[key]} onChange={event => {
                const value = event.target.value;
                if (mode === "manual") setManual(previous => ({ ...previous, [key]: value }));
                else setAi(previous => previous ? { ...previous, [key]: value } : previous);
              }} className="mt-1 block min-h-10 w-full rounded-md border bg-background px-3 py-2 text-sm" />
            </label>) : <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">{comparison.aiError || "AI classification was unavailable."} Cancel to retry the same card, or use the manual result.</p>}
            {data && <label className="block text-xs font-medium">Short notes
              <textarea value={data.notes} placeholder="Optional notes or discussion points" onChange={event => {
                const notes = event.target.value;
                if (mode === "manual") setManual(previous => ({ ...previous, notes }));
                else setAi(previous => previous ? { ...previous, notes } : previous);
              }} className="mt-1 block min-h-16 w-full rounded-md border bg-background px-3 py-2 text-sm" />
            </label>}
            <Button type="submit" disabled={!data} className="w-full">{mode === "manual" ? "Use manual result" : "Use AI result"}</Button>
          </form>;
        })}
      </div>
      <Button variant="outline" onClick={onCancel}>Cancel — keep this card</Button>
    </DialogContent>
  </Dialog>;
}
