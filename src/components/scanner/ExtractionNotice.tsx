import { Info, Sparkles, X } from "lucide-react";
import { Popover } from "@base-ui/react/popover";

export type ExtractionMethod = "ai" | "fallback" | "manual" | "demo";

export default function ExtractionNotice({ method }: { method: ExtractionMethod }) {
  if (method === "manual" || method === "demo") {
    return <p className="text-xs text-slate-500 dark:text-slate-400">
      {method === "demo" ? "Demo details" : "Manual entry"}
    </p>;
  }

  return <div className="text-xs leading-relaxed">
    {method === "fallback" && <p role="status" className="mb-1 text-amber-800 dark:text-amber-300">AI unavailable. Existing mapping used.</p>}
    <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden="true" />
        {method === "ai" ? "AI-assisted field matching" : "About card reading"}
        <Popover.Root>
          <Popover.Trigger aria-label="About AI-assisted field matching" className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-slate-200/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 dark:hover:bg-slate-800">
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner side="bottom" align="start" sideOffset={6} className="z-[10050]">
              <Popover.Popup className="w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-600 shadow-lg outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <Popover.Title className="font-semibold text-slate-900 dark:text-slate-100">How card reading works</Popover.Title>
                  <Popover.Close aria-label="Close card reading information" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-3.5 w-3.5" aria-hidden="true" /></Popover.Close>
                </div>
                <Popover.Description render={<div />} className="space-y-2">
                  <p>Google Cloud Vision reads the card.</p>
                  <p>Gemini AI-assisted field matching helps organise the detected details.</p>
                  <p>You must still review and edit every record before saving.</p>
                </Popover.Description>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
    </div>
  </div>;
}
