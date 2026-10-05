import { getDomainErrorMessage } from "./authConfig";

export interface FormattedAuthError {
  message: string;
  redirect?: "pending_approval" | "verify_otp";
}

/**
 * Extracts a normalized Firebase or API error code from an error object or string.
 */
function extractErrorCode(error: any): string {
  if (!error) return "";
  if (typeof error.code === "string") return error.code.toLowerCase().trim();

  const msg = typeof error === "string" ? error : String(error.message || "");
  const match = msg.match(/\(auth\/([a-z0-9-]+)\)/i) || msg.match(/auth\/([a-z0-9-]+)/i);
  if (match) return `auth/${match[1].toLowerCase()}`;

  return "";
}

/**
 * Transforms authentication and authorization errors into user-friendly messages
 * adhering to OWASP security guidelines (preventing user enumeration / information leakage).
 */
export function formatAuthError(
  error: any,
  context: "signin" | "signup" | "google" | "reset" | "general" = "general"
): FormattedAuthError {
  if (!error) {
    return { message: "" };
  }

  const rawMsg = typeof error === "string" ? error : String(error.message || "");
  const code = extractErrorCode(error);
  const rawLower = rawMsg.toLowerCase();

  // 1. Pending Approval / Verification redirects
  if (
    rawLower.includes("pending authorization") ||
    rawLower.includes("waiting for approval") ||
    rawLower.includes("pending_approval")
  ) {
    return {
      message: "Your account is awaiting approval by an authorized administrator.",
      redirect: "pending_approval",
    };
  }

  if (
    rawLower.includes("verification pending") ||
    rawLower.includes("verify your email") ||
    rawLower.includes("pending_verification")
  ) {
    return {
      message: "Please verify your email address before signing in.",
      redirect: "verify_otp",
    };
  }

  // 2. User deliberately cancelled / closed popup - silent
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
    return { message: "" };
  }

  // 3. Popup blocked by browser
  if (code === "auth/popup-blocked") {
    return {
      message: "The sign-in popup was blocked by your browser. Please allow popups for this site and try again.",
    };
  }

  // 4. Rate limiting / Account locked
  if (code === "auth/too-many-requests" || rawLower.includes("account_locked") || rawLower.includes("temporarily locked")) {
    return {
      message: "Too many unsuccessful attempts. For security reasons, please try again in a few minutes or reset your password.",
    };
  }

  // 5. Account disabled
  if (code === "auth/user-disabled" || rawLower.includes("user-disabled")) {
    return {
      message: "This account has been deactivated. Please contact your administrator for assistance.",
    };
  }

  // 6. Network connectivity issues
  if (code === "auth/network-request-failed" || rawLower.includes("network-request-failed") || rawLower.includes("failed to fetch")) {
    return {
      message: "Unable to connect to the authentication service. Please check your network connection and try again.",
    };
  }

  // 7. Domain restriction
  if (
    rawLower.includes("domain_restricted") ||
    rawLower.includes("aventure aviation work email") ||
    rawLower.includes("authorized work")
  ) {
    return {
      message: getDomainErrorMessage(),
    };
  }

  // 8. Sign-up specific errors
  if (context === "signup") {
    if (code === "auth/email-already-in-use" || rawLower.includes("email-already-in-use") || rawLower.includes("account_exists")) {
      return {
        message: "An account with this email address already exists. Please sign in instead.",
      };
    }
    if (code === "auth/weak-password" || rawLower.includes("weak-password")) {
      return {
        message: "Password does not meet the minimum security requirements (at least 11 characters).",
      };
    }
    if (code === "auth/invalid-email" || rawLower.includes("invalid-email")) {
      return {
        message: "Please enter a valid work email address.",
      };
    }
  }

  // 9. Sign-in specific errors (OWASP: Generic credentials failure to prevent account enumeration)
  if (
    code === "auth/invalid-credential" ||
    code === "auth/user-not-found" ||
    code === "auth/wrong-password" ||
    code === "auth/invalid-email" ||
    rawLower.includes("invalid-credential") ||
    rawLower.includes("invalid_credentials") ||
    rawLower.includes("user-not-found") ||
    rawLower.includes("wrong-password")
  ) {
    return {
      message: "Invalid email or password. Please verify your credentials and try again.",
    };
  }

  // 10. Account expired / rejected
  if (rawLower.includes("account_expired") || rawLower.includes("has expired")) {
    return {
      message: "This account has expired. Please contact your administrator.",
    };
  }
  if (rawLower.includes("account_rejected") || rawLower.includes("not approved") || rawLower.includes("rejected")) {
    return {
      message: "Your account registration was not approved. Please contact your administrator.",
    };
  }

  // 11. Google Auth specific
  if (code === "auth/account-exists-with-different-credential") {
    return {
      message: "An account already exists with the same email using a different sign-in method.",
    };
  }
  if (context === "google") {
    if (rawMsg && !rawMsg.startsWith("Firebase:") && !rawMsg.includes("(auth/") && !rawLower.includes("generic")) {
      return { message: rawMsg };
    }
    return {
      message: "Unable to sign in with Google. Please try again or use your work email and password.",
    };
  }

  // 12. Password reset
  if (context === "reset") {
    return {
      message: "If an account exists for this email, a password reset link has been sent.",
    };
  }

  // 13. Fallback: Never display raw Firebase error syntax to the user
  if (rawMsg.startsWith("Firebase:") || rawMsg.includes("(auth/")) {
    return {
      message: "Authentication failed. Please verify your credentials and try again.",
    };
  }

  return {
    message: rawMsg || "Sign in failed. Please check your credentials and try again.",
  };
}
