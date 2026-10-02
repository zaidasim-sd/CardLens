import { apiFetch } from "./client";

/**
 * Downloads approved contacts as a clean CSV file from the backend export route.
 * The backend generates formula-safe CSV containing only Approved contacts.
 */
export async function exportApprovedContacts(filename = "lead71-approved-contacts.csv"): Promise<void> {
  const csvContent = await apiFetch<string>("/api/export");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
