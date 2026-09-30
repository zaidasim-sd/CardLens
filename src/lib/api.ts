let csrfToken = "";

export function setApiCsrfToken(value: string) {
  csrfToken = value;
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (options.method && options.method !== "GET" && options.method !== "HEAD") headers.set("X-CSRF-Token", csrfToken);
  const response = await fetch(path, { ...options, credentials: "include", headers });
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error || "The request could not be completed."), { code: body.code, status: response.status, duplicate: body.duplicate });
  return body;
}
