import pilot from "@/config/pilot";

/**
 * Determine if Vision71 internal emails (@vision71tech.com) are allowed.
 * Checked in order:
 * 1. Explicit env variables (VITE_ALLOW_VISION71_EMAILS or ALLOW_VISION71_EMAILS)
 * 2. Pilot configuration file (config/pilot.json -> allowVision71Emails)
 * 3. Default to true in development mode (import.meta.env.DEV)
 */
export function isVision71Allowed(): boolean {
  const envVal =
    import.meta.env.VITE_ALLOW_VISION71_EMAILS ??
    (import.meta.env as any).ALLOW_VISION71_EMAILS ??
    import.meta.env.VITE_ALLOW_VISION71_EMAIL;

  if (envVal !== undefined && envVal !== "") {
    const norm = String(envVal).trim().toLowerCase();
    return norm === "true" || norm === "1" || norm === "yes";
  }

  if (typeof (pilot as any)?.allowVision71Emails === "boolean") {
    return (pilot as any).allowVision71Emails;
  }

  return Boolean(import.meta.env.DEV);
}

/**
 * Returns the list of currently allowed email domains.
 */
export function getAllowedDomains(): string[] {
  const domains = ["aventureaviation.com"];
  if (isVision71Allowed()) {
    domains.push("vision71tech.com", "example.test");
  }
  return domains;
}

/**
 * Validates if the given email matches any of the currently allowed domains.
 */
export function isAllowedEmailDomain(email: string): boolean {
  const trimmed = String(email || "").trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) return false;

  if (trimmed.endsWith("@aventureaviation.com")) return true;

  if (isVision71Allowed()) {
    if (trimmed.endsWith("@vision71tech.com") || trimmed.endsWith("@example.test")) {
      return true;
    }
  }

  return false;
}

/**
 * User-facing helper text indicating permitted domains without leaking unnecessary internal information.
 */
export function getEmailHelperText(): string {
  return "Must be an authorized work account.";
}

/**
 * Placeholder text for email input fields.
 */
export function getEmailPlaceholder(): string {
  return "name@company.com";
}

/**
 * Introductory description text on the sign-in page.
 */
export function getSignInIntroText(): string {
  return "Sign in to Lead71 with your authorized work account.";
}

/**
 * Domain restriction error message formatted clearly.
 */
export function getDomainErrorMessage(): string {
  return "Please use an authorized work email account.";
}
