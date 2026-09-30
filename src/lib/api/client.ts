/**
 * Centralized API Client for CardSnap by Vision71
 * 
 * Supports configurable backend base URL via VITE_API_BASE_URL.
 * Handles automatic CSRF tokens, session cookies, and centralized user-friendly error formatting.
 */

let csrfToken = "";

export function setApiCsrfToken(value: string) {
  csrfToken = value;
}

export function getApiCsrfToken(): string {
  return csrfToken;
}

/**
 * Resolves the full URL based on VITE_API_BASE_URL.
 * Defaults to relative paths (proxied by Vite in dev or same-origin in prod).
 */
export function getApiUrl(path: string): string {
  const baseUrl = (import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return baseUrl ? `${baseUrl}${cleanPath}` : cleanPath;
}

export interface ApiError extends Error {
  code?: string;
  status?: number;
  duplicate?: unknown;
}

/**
 * Standard friendly error messages for HTTP status codes
 */
export function getFriendlyErrorMessage(status?: number, code?: string, serverMessage?: string): string {
  if (code === "NO_CONTACT_DETECTED" || status === 422) {
    return "We couldn't read enough information from this card. Please retake the photo or enter the details manually.";
  }
  if (status === 401) {
    return "Your session has expired. Please sign in again.";
  }
  if (status === 403) {
    return "You do not have permission to perform this action.";
  }
  if (status === 404) {
    return "The requested record was not found.";
  }
  if (status === 409) {
    return "A conflicting contact already exists.";
  }
  if (status === 413) {
    return "Image file is too large. Please use a file under 2 MB.";
  }
  if (status === 415) {
    return "Unsupported image format. Please upload a JPG, PNG, or WEBP photo.";
  }
  if (status === 429) {
    return "Too many requests. Please wait a moment before trying again.";
  }
  if (status && status >= 500) {
    return "We couldn't process the request right now. Please try again.";
  }
  if (serverMessage && typeof serverMessage === "string" && serverMessage.trim()) {
    return serverMessage;
  }
  return "Connection problem. Please check your connection and try again.";
}

/**
 * Centralized fetch wrapper
 */
export async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const url = getApiUrl(path);
  const headers = new Headers(options.headers);

  // Attach CSRF token on mutating requests if available
  if (options.method && options.method !== "GET" && options.method !== "HEAD" && csrfToken) {
    headers.set("X-CSRF-Token", csrfToken);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      credentials: "include",
      headers,
    });
  } catch (err: unknown) {
    const error: ApiError = new Error("Connection problem. Please check your connection and try again.");
    error.status = 0;
    error.code = "NETWORK_ERROR";
    throw error;
  }

  // Handle CSV/text responses
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/csv")) {
    if (!response.ok) {
      throw Object.assign(new Error("Failed to download CSV export."), { status: response.status });
    }
    return (await response.text()) as unknown as T;
  }

  let body: any;
  try {
    body = await response.json();
  } catch {
    body = {};
  }

  if (!response.ok) {
    const message = getFriendlyErrorMessage(response.status, body?.code, body?.error);
    const error: ApiError = new Error(message);
    error.code = body?.code;
    error.status = response.status;
    error.duplicate = body?.duplicate;
    throw error;
  }

  return body;
}
