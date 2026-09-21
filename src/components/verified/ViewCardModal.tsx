import { useState, useEffect } from "react";
import { Eye, X, Download, Mail, Phone, MapPin, Globe } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ContactRecord } from "@/types";

interface Props {
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
  record: ContactRecord | null;
  onViewQueue?: () => void;
}

export default function ViewCardModal({ isOpen, setIsOpen, record, onViewQueue }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (record?.isDemo) {
      setImageUrl("/demo-card.svg");
      return;
    }
    if (record?.originalImage && record.originalImage.size >= 100) {
      let url: string | null = null;
      try {
        url = URL.createObjectURL(record.originalImage);
        setImageUrl(url);
      } catch {
        setImageUrl("/demo-card.svg");
      }
      return () => {
        if (url) URL.revokeObjectURL(url);
      };
    } else {
      setImageUrl("/demo-card.svg");
    }
  }, [record]);

  if (!record) return null;

  const handleDownloadImage = () => {
    if (!imageUrl) return;
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = record.originalFileName || `card-${record.id}.jpg`;
    a.click();
  };

  const vData = record.verifiedData;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0 bg-background shadow-2xl rounded-2xl border">
        <DialogHeader className="p-4 sm:p-6 pb-4 border-b bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pr-8">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="bg-slate-900/10 dark:bg-white/10 p-2 rounded-xl text-slate-900 dark:text-white shrink-0">
                <Eye className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base sm:text-xl font-bold whitespace-nowrap text-slate-900 dark:text-white">
                  Scanned Card Preview
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Scanned on {new Date(record.createdAt).toLocaleDateString()} at {new Date(record.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </DialogDescription>
              </div>
            </div>
            {imageUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadImage}
                className="h-8 sm:h-9 px-3 text-xs font-semibold rounded-xl border-slate-900/30 dark:border-slate-700 text-slate-900 dark:text-white bg-slate-900/5 dark:bg-slate-800/50 hover:bg-slate-900/10 dark:hover:bg-slate-800 hover:border-slate-900 transition-all gap-1.5 shrink-0 self-start sm:self-auto cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-900 dark:text-white" /> Download Card
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden min-h-0">
          {/* Card Image Display */}
          <div className="lg:w-1/2 p-4 sm:p-6 bg-slate-100/70 dark:bg-slate-900/40 flex items-center justify-center relative min-h-[220px] lg:min-h-0 shrink-0 border-b lg:border-b-0 lg:border-r border-border">
            <img
              src={imageUrl || "/demo-card.svg"}
              alt={vData.fullName || "Business Card"}
              onError={(e) => {
                (e.target as HTMLImageElement).src = "/demo-card.svg";
              }}
              className="max-w-full max-h-full object-contain rounded-xl shadow-md border border-slate-200 dark:border-slate-800"
            />
          </div>

          {/* Contact Details Display */}
          <div className="lg:w-1/2 overflow-y-auto p-4 sm:p-6 space-y-6 bg-card">
            <div>
              <h3 className="text-xl sm:text-2xl font-bold text-foreground">{vData.fullName || "—"}</h3>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mt-0.5">{vData.jobTitle || "No Title Specified"}</p>
              <p className="text-sm text-muted-foreground">{vData.companyName || "No Company Specified"}</p>
            </div>

            <div className="space-y-3 pt-2 text-sm border-t">
              {vData.email && (
                <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                  <Mail className="w-4 h-4 text-slate-900 dark:text-white shrink-0" />
                  <a href={`mailto:${vData.email}`} className="hover:underline truncate">{vData.email}</a>
                </div>
              )}

              {vData.phone && (
                <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                  <Phone className="w-4 h-4 text-slate-900 dark:text-white shrink-0" />
                  <span>{vData.phone} {vData.alternatePhone && ` / ${vData.alternatePhone}`}</span>
                </div>
              )}

              {vData.website && (
                <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                  <Globe className="w-4 h-4 text-slate-900 dark:text-white shrink-0" />
                  <a href={vData.website.startsWith("http") ? vData.website : `https://${vData.website}`} target="_blank" rel="noreferrer" className="hover:underline truncate">
                    {vData.website}
                  </a>
                </div>
              )}

              {(vData.address || vData.city || vData.country) && (
                <div className="flex items-start gap-3 text-slate-700 dark:text-slate-300">
                  <MapPin className="w-4 h-4 text-slate-900 dark:text-white shrink-0 mt-0.5" />
                  <div>
                    {vData.address && <div>{vData.address}</div>}
                    <div>
                      {[vData.city, vData.country].filter(Boolean).join(", ")}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {vData.notes && (
              <div className="pt-3 border-t space-y-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes</span>
                <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{vData.notes}</p>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t bg-slate-50/50 dark:bg-slate-900/50 flex flex-wrap justify-end gap-3 shrink-0">
          {onViewQueue && <Button onClick={onViewQueue} className="min-h-12 rounded-xl">View review queue</Button>}
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
            className="h-9 px-4 text-xs sm:text-sm font-semibold rounded-xl border-slate-900/30 dark:border-slate-700 text-slate-900 dark:text-white bg-slate-900/5 dark:bg-slate-800/50 hover:bg-slate-900/10 dark:hover:bg-slate-800 hover:border-slate-900 transition-all gap-1.5 cursor-pointer"
          >
            <X className="w-4 h-4 text-slate-900 dark:text-white" /> Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
