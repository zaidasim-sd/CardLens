import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { Save, X, UserCheck, CreditCard, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cardApi } from "@/lib/cardApi";
import type { ContactRecord, OCRData } from "@/types";
import { ModernContactTypeSelect, ModernFieldSelect, MET_AT_OPTIONS, PRODUCT_INTEREST_OPTIONS, RELATIONSHIP_OWNER_OPTIONS } from "../scanner/OCRReviewModal";

interface Props {
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
  record: ContactRecord | null;
  onSuccess?: () => void;
}

interface EditFormData {
  fullName: string;
  jobTitle: string;
  companyName: string;
  email: string;
  phone: string;
  alternatePhone: string;
  website: string;
  address: string;
  city: string;
  country: string;
  notes: string;
  metAtLocation: string;
  contactType: string;
  productInterest: string;
  relationshipOwner: string;
  followUpDate: string;
}

export default function EditContactModal({ isOpen, setIsOpen, record, onSuccess }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isMeetingContextOpen, setIsMeetingContextOpen] = useState(false);

  const { register, handleSubmit, reset, watch, setValue } = useForm<EditFormData>({
    defaultValues: {
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
      metAtLocation: "",
      contactType: "",
      productInterest: "",
      relationshipOwner: "",
      followUpDate: "",
    }
  });

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    if (isOpen && record) {
      reset({
        fullName: record.verifiedData.fullName || "",
        jobTitle: record.verifiedData.jobTitle || "",
        companyName: record.verifiedData.companyName || "",
        email: record.verifiedData.email || "",
        phone: record.verifiedData.phone || "",
        alternatePhone: record.verifiedData.alternatePhone || "",
        website: record.verifiedData.website || "",
        address: record.verifiedData.address || "",
        city: record.verifiedData.city || "",
        country: record.verifiedData.country || "",
        notes: record.verifiedData.notes || "",
        metAtLocation: record.verifiedData.meetingContext?.metAtLocation || "",
        contactType: record.verifiedData.meetingContext?.contactType || "",
        productInterest: record.verifiedData.meetingContext?.productInterest || "",
        relationshipOwner: record.verifiedData.meetingContext?.relationshipOwner || "",
        followUpDate: record.verifiedData.meetingContext?.followUpDate || "",
      });

      setImageUrl(null);
      if (record.isDemo) {
        setImageUrl("/democard.png");
      } else if (record.hasImage) {
        void cardApi.image(record.id)
          .then((image) => {
            if (cancelled) return;
            objectUrl = URL.createObjectURL(image);
            setImageUrl(objectUrl);
          })
          .catch(() => {
            if (cancelled) return;
            setImageUrl("/democard.png");
          });
      } else {
        setImageUrl("/democard.png");
      }
    }

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [isOpen, record, reset]);

  if (!record) return null;

  const onSubmit = async (data: EditFormData) => {
    try {
      const updatedVerifiedData: OCRData = {
        fullName: data.fullName?.trim() || "",
        companyName: data.companyName?.trim() || "",
        jobTitle: data.jobTitle?.trim() || "",
        email: data.email?.trim().toLowerCase() || "",
        phone: data.phone?.trim() || "",
        alternatePhone: data.alternatePhone?.trim() || "",
        website: data.website?.trim() || "",
        address: data.address?.trim() || "",
        city: data.city?.trim() || "",
        country: data.country?.trim() || "",
        notes: data.notes?.trim() || "",
        meetingContext: {
          metAtLocation: data.metAtLocation?.trim() || "",
          contactType: data.contactType || "",
          productInterest: data.productInterest?.trim() || "",
          relationshipOwner: data.relationshipOwner?.trim() || "",
          followUpDate: data.followUpDate || "",
        }
      };

      await cardApi.update(record.id, updatedVerifiedData, record.status);

      toast.success("Contact details updated successfully.");
      setIsOpen(false);
      if (onSuccess) onSuccess();
    } catch (error) {
      toast.error("Failed to update contact. Please try again.");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="flex h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden rounded-2xl border bg-background p-0 shadow-2xl sm:h-auto sm:max-h-[90dvh] sm:w-[90vw] sm:max-w-5xl">
        {/* Header */}
        <DialogHeader className="shrink-0 border-b bg-slate-50/50 p-4 pb-3 dark:bg-slate-900/50 sm:p-5 sm:pb-4 md:p-6 md:pb-4">
          <div className="flex items-center gap-3 pr-8">
            <div className="bg-slate-900/10 dark:bg-white/10 p-2.5 rounded-xl text-slate-900 dark:text-white shrink-0">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl md:text-2xl font-bold tracking-tight">Edit Contact Information</DialogTitle>
              <DialogDescription className="text-xs md:text-sm text-muted-foreground mt-0.5">
                Update details for <span className="font-semibold text-foreground">{record.verifiedData.fullName || record.verifiedData.companyName || "this contact"}</span>.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Modal Body: Split view on Desktop */}
        <div className="flex min-h-0 flex-1 touch-pan-y flex-col overflow-y-auto overscroll-contain bg-slate-50/50 lg:flex-row lg:overflow-hidden">
          {/* Card Image Reference Panel */}
          {imageUrl && (
            <div className="flex h-[190px] min-h-[190px] shrink-0 flex-col overflow-hidden border-b border-border bg-slate-100/70 p-3 dark:bg-slate-900/40 sm:h-[230px] sm:min-h-[230px] sm:p-4 lg:h-auto lg:min-h-0 lg:w-5/12 lg:border-b-0 lg:border-r lg:p-6">
              <div className="mb-2 flex shrink-0 items-center gap-1.5 self-start text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:mb-3 sm:text-xs">
                <CreditCard className="w-3.5 h-3.5 text-slate-900 dark:text-white" /> Scanned Card Reference
              </div>
              <div className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-xl">
                <img
                  src={imageUrl || "/democard.png"}
                  alt="Business Card Reference"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/democard.png";
                  }}
                  className="h-full w-full rounded-xl border border-slate-200 object-contain shadow-md dark:border-slate-800"
                />
              </div>
            </div>
          )}

          {/* Form Panel */}
          <div className={`shrink-0 bg-background p-4 sm:p-5 md:p-6 lg:flex-1 lg:shrink lg:overflow-y-auto ${!imageUrl ? 'w-full' : 'lg:w-7/12'}`}>
            <form id="edit-contact-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6 pb-36">
              {/* Identity Group */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b pb-1">
                  Identity Details
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2 space-y-1.5">
                    <Label htmlFor="fullName" className="font-semibold text-sm">Full Name</Label>
                    <Input id="fullName" {...register("fullName")} placeholder="e.g. Qazi Nauman Mujahid" className="h-10" />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="companyName" className="font-semibold text-sm">Company Name</Label>
                    <Input id="companyName" {...register("companyName")} placeholder="e.g. Digitech Infra" className="h-10" />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="jobTitle" className="font-semibold text-sm">Job Title</Label>
                    <Input id="jobTitle" {...register("jobTitle")} placeholder="e.g. Chief Executive Officer" className="h-10" />
                  </div>
                </div>
              </div>

              {/* Contact Details Group */}
              <div className="space-y-4 pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b pb-1">
                  Contact & Online
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="font-semibold text-sm">Email Address</Label>
                    <Input id="email" type="text" {...register("email")} placeholder="e.g. nauman@digitechinfra.com" className="h-10" />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="phone" className="font-semibold text-sm">Phone Number</Label>
                    <Input id="phone" type="text" {...register("phone")} placeholder="e.g. +92 317 6688855" className="h-10" />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="alternatePhone" className="font-semibold text-sm">Alternate Phone</Label>
                    <Input id="alternatePhone" type="text" {...register("alternatePhone")} placeholder="e.g. +92 300 1234567" className="h-10" />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="website" className="font-semibold text-sm">Website</Label>
                    <Input id="website" type="text" {...register("website")} placeholder="e.g. www.digitechinfra.com" className="h-10" />
                  </div>
                </div>
              </div>

              {/* Meeting Context Group (Collapsible Dropdown) */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden transition-all bg-slate-50/60 dark:bg-slate-900/40">
                <button
                  type="button"
                  onClick={() => setIsMeetingContextOpen(!isMeetingContextOpen)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-100/80 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                >
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Meeting Context (Optional)
                  </span>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                    <span>{isMeetingContextOpen ? "Hide" : "Add details"}</span>
                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isMeetingContextOpen ? "rotate-180" : ""}`} />
                  </div>
                </button>

                {isMeetingContextOpen && (
                  <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-4 bg-white dark:bg-slate-950">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Met at / Event / Location */}
                      <div className="space-y-1.5">
                        <Label className="font-semibold text-sm">Met at / Event / Location</Label>
                        <ModernFieldSelect
                          value={watch("metAtLocation") || ""}
                          onChange={(val) => setValue("metAtLocation", val, { shouldDirty: true })}
                          placeholder="Select event or location…"
                          options={MET_AT_OPTIONS}
                        />
                      </div>

                      {/* Contact Type */}
                      <div className="space-y-1.5">
                        <Label className="font-semibold text-sm text-slate-900 dark:text-slate-100">Contact Type</Label>
                        <ModernContactTypeSelect
                          value={watch("contactType") || ""}
                          onChange={(val) => setValue("contactType", val, { shouldDirty: true })}
                        />
                      </div>

                      {/* Product / Interest */}
                      <div className="space-y-1.5">
                        <Label className="font-semibold text-sm">Product / Interest</Label>
                        <ModernFieldSelect
                          value={watch("productInterest") || ""}
                          onChange={(val) => setValue("productInterest", val, { shouldDirty: true })}
                          placeholder="Select product or interest…"
                          options={PRODUCT_INTEREST_OPTIONS}
                        />
                      </div>

                      {/* Relationship Owner / Salesperson */}
                      <div className="space-y-1.5">
                        <Label className="font-semibold text-sm">Relationship Owner / Salesperson</Label>
                        <ModernFieldSelect
                          value={watch("relationshipOwner") || ""}
                          onChange={(val) => setValue("relationshipOwner", val, { shouldDirty: true })}
                          placeholder="Select owner or salesperson…"
                          options={RELATIONSHIP_OWNER_OPTIONS}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Location & Notes Group */}
              <div className="space-y-4 pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b pb-1">
                  Address & Notes
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2 space-y-1.5">
                    <Label htmlFor="address" className="font-semibold text-sm">Street Address</Label>
                    <Input id="address" {...register("address")} placeholder="e.g. Suite 400, Tech Tower" className="h-10" />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="city" className="font-semibold text-sm">City</Label>
                    <Input id="city" {...register("city")} placeholder="e.g. Karachi" className="h-10" />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="country" className="font-semibold text-sm">Country</Label>
                    <Input id="country" {...register("country")} placeholder="e.g. Pakistan" className="h-10" />
                  </div>

                  <div className="md:col-span-2 space-y-1.5">
                    <Label htmlFor="notes" className="font-semibold text-sm">Notes</Label>
                    <textarea
                      id="notes"
                      rows={3}
                      {...register("notes")}
                      placeholder="Additional notes or meeting context..."
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                    />
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 justify-end gap-2 border-t bg-slate-50/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md dark:bg-slate-900/95 sm:gap-3 sm:p-4">
          <Button
            type="button"
            variant="outline"
            className="h-10 px-4 rounded-xl text-xs font-semibold border-slate-900/30 dark:border-slate-700 text-slate-900 dark:text-white bg-slate-900/5 dark:bg-slate-800/50 hover:bg-slate-900/10 dark:hover:bg-slate-800 hover:border-slate-900 transition-all gap-1.5 cursor-pointer"
            onClick={() => setIsOpen(false)}
          >
            <X className="w-4 h-4 text-slate-900 dark:text-white" /> Cancel
          </Button>
          <Button
            type="submit"
            form="edit-contact-form"
            className="h-10 px-5 rounded-xl font-bold text-xs bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 shadow-md shadow-slate-900/20 gap-1.5 cursor-pointer"
          >
            <Save className="w-4 h-4 text-white dark:text-slate-900" /> Save Changes
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  );
}
