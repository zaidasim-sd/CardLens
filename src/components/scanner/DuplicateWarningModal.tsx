import { useEffect, useState } from "react";
import { AlertTriangle, Building2, Mail, Phone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ContactRecord } from "@/types";
import pilot from "@/config/pilot";

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
  useEffect(() => {
    setConfirmSeparate(false);
  }, [isOpen, existingContact?.id]);

  if (!existingContact) return null;
  const v = existingContact.verifiedData;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-[500px] p-5 sm:p-6 rounded-2xl max-h-[90dvh] overflow-y-auto shadow-xl border border-slate-200 dark:border-slate-800">
        <DialogHeader className="space-y-1.5 text-left">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 shrink-0 mt-0.5 dark:bg-amber-950/40 dark:border-amber-900">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                Possible existing contact found
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                {matchReason?.startsWith("Matching email")
                  ? "A matching email address was found in the register. Please review the existing record before creating a separate contact."
                  : "Matching contact details were found in the register. Please review the existing record before creating a separate contact."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Existing Contact Summary Card */}
        <div className="my-3 p-4 rounded-xl border border-amber-200/80 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20 space-y-2.5 overflow-hidden text-xs">
          <div className="flex flex-wrap items-center justify-between gap-1 border-b border-amber-200/50 pb-2 dark:border-amber-900/30">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400">
              Existing Saved Record
            </span>
            <span className="text-[11px] text-slate-500 whitespace-nowrap">
              Captured {existingContact.createdAt ? new Date(existingContact.createdAt).toLocaleDateString() : ""}
            </span>
          </div>

          <div className="space-y-1 pt-0.5">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
              {v.fullName || "Unnamed Contact"}
            </h4>
            {v.jobTitle && (
              <p className="text-slate-600 dark:text-slate-300 font-medium truncate">{v.jobTitle}</p>
            )}
            {v.companyName && (
              <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 pt-0.5">
                <Building2 className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                <span className="truncate">{v.companyName}</span>
              </div>
            )}
            {v.email && (
              <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 pt-0.5">
                <Mail className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                <span className="truncate">{v.email}</span>
              </div>
            )}
            {v.phone && (
              <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 pt-0.5">
                <Phone className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                <span className="truncate">{v.phone}</span>
              </div>
            )}
          </div>
        </div>

        {/* Review-First Action Buttons */}
        <div className="mt-4 flex w-full flex-col gap-2">
          {!existingContact.restricted && (
            <Button
              onClick={onViewExisting}
              className="h-10 w-full rounded-xl bg-blue-600 text-white hover:bg-blue-700 font-semibold text-xs shadow-sm cursor-pointer"
            >
              Review existing contact
            </Button>
          )}

          <Button
            variant="outline"
            onClick={onClose}
            className="h-10 w-full rounded-xl border-slate-200 text-slate-700 hover:bg-slate-100 font-semibold text-xs cursor-pointer dark:border-slate-700 dark:text-slate-300"
          >
            Go back and edit
          </Button>

          {confirmSeparate ? (
            <div className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left dark:border-slate-800 dark:bg-slate-900" role="group" aria-label="Confirm separate contact">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {pilot.submissionOnlyEnabled ? "Submit this as a separate contact for review? The existing contact will remain unchanged in Aventure’s review register." : "Submit this possible duplicate for the Aventure reviewer to compare? The existing contact will remain unchanged. The reviewer decides whether to retain, update, keep both, or reject."}
              </p>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={onSaveAnyway}
                  className="h-8 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-black dark:bg-white dark:text-slate-900"
                >
                  {pilot.submissionOnlyEnabled ? "Submit separate contact" : "Submit for duplicate review"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmSeparate(false)}
                  className="h-8 text-xs text-slate-500 hover:text-slate-900"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              onClick={() => setConfirmSeparate(true)}
              className="h-9 w-full rounded-xl text-xs font-normal text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300"
            >
              {pilot.submissionOnlyEnabled ? "Add as a separate contact" : "Submit possible duplicate for review"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
