import { useEffect, useState } from "react";
import { AlertTriangle, User, Building2, Mail, Phone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ContactRecord } from "@/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  existingContact: ContactRecord | null;
  matchReason?: string;
  onSaveAnyway: () => void;
  onViewExisting: () => void;
}

export default function DuplicateWarningModal({
  isOpen,
  onClose,
  existingContact,
  matchReason,
  onSaveAnyway,
  onViewExisting,
}: Props) {
  const [confirmSeparate, setConfirmSeparate] = useState(false);
  useEffect(() => { setConfirmSeparate(false); }, [isOpen, existingContact?.id]);

  if (!existingContact) return null;
  const v = existingContact.verifiedData;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-[540px] p-5 sm:p-6 rounded-2xl max-h-[90dvh] overflow-y-auto shadow-2xl">
        <DialogHeader className="space-y-2 text-left">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base sm:text-lg font-semibold text-foreground tracking-tight">
                Possible existing contact found
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                {matchReason?.startsWith("Matching email")
                  ? "A matching email address was found. Please review the existing contact before creating another record."
                  : "Matching contact details were found. Please review the existing contact before creating another record."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Existing Contact Summary Card */}
        <div className="my-3 p-4 rounded-xl border border-amber-200/80 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 space-y-2.5 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-1 border-b border-amber-200/50 dark:border-amber-900/30 pb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400">
              Existing Saved Contact
            </span>
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              Saved {new Date(existingContact.createdAt).toLocaleDateString()} at {new Date(existingContact.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
          </div>

          <div className="flex items-start gap-3 pt-0.5">
            <div className="w-10 h-10 rounded-full bg-amber-200/70 dark:bg-amber-800/40 flex items-center justify-center shrink-0 text-amber-900 dark:text-amber-200 font-bold text-sm">
              {v.fullName ? v.fullName.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
              <h4 className="text-sm font-semibold text-foreground truncate">
                {v.fullName || "Unnamed Contact"}
              </h4>
              {v.jobTitle && (
                <p className="text-xs text-muted-foreground truncate font-medium">{v.jobTitle}</p>
              )}
              {v.companyName && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-0.5">
                  <Building2 className="w-3.5 h-3.5 shrink-0 text-amber-700/70" />
                  <span className="truncate">{v.companyName}</span>
                </div>
              )}
              {v.email && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-0.5">
                  <Mail className="w-3.5 h-3.5 shrink-0 text-amber-700/70" />
                  <span className="truncate">{v.email}</span>
                </div>
              )}
              {v.phone && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-0.5">
                  <Phone className="w-3.5 h-3.5 shrink-0 text-amber-700/70" />
                  <span className="truncate">{v.phone}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 flex w-full flex-col gap-2.5">
          <Button
            onClick={onViewExisting}
            className="min-h-11 w-full rounded-xl bg-slate-900 text-white hover:bg-black dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            Review existing contact
          </Button>
          <Button variant="outline" onClick={onClose} className="min-h-11 w-full rounded-xl">
            Go back and edit
          </Button>
          {confirmSeparate ? (
            <div className="mt-2 space-y-3 rounded-xl border p-4" role="group" aria-label="Confirm separate contact">
              <p className="text-sm text-muted-foreground">
                Create another record despite the possible match? The existing contact will remain unchanged.
              </p>
              <Button variant="outline" onClick={onSaveAnyway} className="min-h-11 w-full rounded-xl whitespace-normal">
                Confirm separate contact
              </Button>
              <Button variant="ghost" onClick={() => setConfirmSeparate(false)} className="min-h-11 w-full rounded-xl">
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmSeparate(true)} className="min-h-11 w-full rounded-xl text-sm font-normal text-muted-foreground">
              Create a separate contact
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
