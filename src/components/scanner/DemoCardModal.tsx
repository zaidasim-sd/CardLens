import { useState } from "react";
import { Sparkles, Loader2, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DEMO_CARDS, type DemoCardConfig } from "@/config/demoCards";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelectDemoCard: (demoCard: DemoCardConfig) => void;
}

export default function DemoCardModal({ isOpen, onClose, onSelectDemoCard }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const handleSelect = (card: DemoCardConfig) => {
    setSelectedId(card.id);
    setIsProcessing(true);

    // Realistic processing state (0.8s - 1.2s)
    setTimeout(() => {
      setIsProcessing(false);
      setSelectedId(null);
      onSelectDemoCard(card);
    }, 1100);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0 bg-background rounded-2xl border shadow-2xl">
        {/* Modal Header */}
        <DialogHeader className="p-5 sm:p-6 pb-4 border-b bg-slate-50/60 dark:bg-slate-900/60 shrink-0">
          <div className="flex items-center gap-3 pr-8">
            <div className="bg-slate-900/10 dark:bg-white/10 p-2.5 rounded-xl text-slate-900 dark:text-white shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Choose a demo card
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Select a sample business card to try the Lead71 workflow.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Modal Content: Demo Cards Grid */}
        <div className="p-4 sm:p-6 overflow-y-auto min-h-0 space-y-4">
          {isProcessing ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative w-16 h-16 flex items-center justify-center rounded-2xl bg-slate-900/10 text-slate-900 dark:bg-white/10 dark:text-white">
                <Loader2 className="w-8 h-8 animate-spin" />
                <div className="animate-scanline rounded-2xl" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-base text-slate-900 dark:text-white">
                  Reading contact details...
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Processing synthetic demo business card data
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {DEMO_CARDS.map((card) => {
                const isSelected = selectedId === card.id;
                return (
                  <div
                    key={card.id}
                    onClick={() => handleSelect(card)}
                    className={`group relative rounded-2xl border p-4 transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? "border-slate-900 bg-slate-900/5 dark:border-white dark:bg-white/5 shadow-md ring-2 ring-slate-900/20 dark:ring-white/20"
                        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-900/50 dark:hover:border-slate-400 hover:shadow-md"
                    }`}
                  >
                    {/* Badge */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-900/10 text-slate-900 dark:bg-white/10 dark:text-white px-2.5 py-0.5 rounded-full border border-slate-900/20 dark:border-white/20">
                        Demo Card
                      </span>
                      <span className="text-xs text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors flex items-center gap-1 font-semibold">
                        Select <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>

                    {/* Image Thumbnail */}
                    <div className="relative aspect-[16/9] w-full bg-slate-100 dark:bg-slate-950 rounded-xl overflow-hidden mb-3 border border-slate-200/80 dark:border-slate-800 flex items-center justify-center p-2">
                      <img
                        src={card.imagePath}
                        alt={card.title}
                        className="max-h-full max-w-full object-contain rounded-md shadow-xs transition-transform duration-300 group-hover:scale-103"
                      />
                    </div>

                    {/* Meta details */}
                    <div>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                        {card.personName}
                      </h4>
                      <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                        {card.preparedData.jobTitle}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {card.companyName}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t bg-slate-50/60 dark:bg-slate-900/60 flex justify-end shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isProcessing}
            className="h-9 px-4 text-xs font-semibold rounded-xl border-slate-300 dark:border-slate-700 hover:border-slate-900 hover:text-slate-900 dark:hover:border-slate-400 dark:hover:text-white cursor-pointer"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
