import type { ContactRecord } from "@/types";

function safe(value: unknown) {
  const text = String(value ?? "").replace(/^[=+\-@]/, (prefix) => `'${prefix}`).replaceAll('"', '""');
  return `"${text}"`;
}

export function exportToCsv(records: ContactRecord[], filename: string) {
  const headings = ["Record ID", "Name", "Job Title", "Company", "Email", "Phone", "Event", "Where met / Location", "Notes", "Status", "Captured At", "Reviewed At", "Transfer Status"];
  const rows = records.map((record) => [
    record.id,
    record.verifiedData.fullName,
    record.verifiedData.jobTitle,
    record.verifiedData.companyName,
    record.verifiedData.email,
    record.verifiedData.phone,
    record.verifiedData.meetingContext?.metAtLocation,
    record.verifiedData.meetingContext?.whereMet,
    record.verifiedData.notes,
    record.status,
    record.createdAt,
    record.reviewedAt,
    record.transferStatus,
  ].map(safe).join(","));
  const blob = new Blob([[headings.map(safe).join(","), ...rows].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
