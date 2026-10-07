export const cardContactFields = ["fullName", "companyName", "jobTitle", "email", "phone", "notes"] as const;

// Front values always win. Back alternatives require an explicit user choice.
export function fillEmptyCardFields<T extends Partial<Record<(typeof cardContactFields)[number], string>>>(front: T, back: Partial<T>): T {
  const merged = { ...front };
  for (const field of cardContactFields) {
    const value = back[field];
    if (!String(front[field] || "").trim() && typeof value === "string" && value.trim()) {
      (merged as Record<string, unknown>)[field] = value.trim();
    }
  }
  return merged;
}
