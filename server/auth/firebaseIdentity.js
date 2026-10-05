// Validate with the configured Firebase project's Authentication API. Never
// trust browser-supplied email, UID, role, or verification flags.
export async function firebaseIdentity(idToken, { env = process.env, fetcher = fetch } = {}) {
  const apiKey = env.FIREBASE_API_KEY || env.VITE_FIREBASE_API_KEY;
  if (!apiKey) throw Object.assign(new Error("Firebase Authentication is not configured."), { code: "FIREBASE_NOT_CONFIGURED", status: 503 });
  if (typeof idToken !== "string" || !idToken) throw Object.assign(new Error("Please sign in through Firebase."), { code: "FIREBASE_TOKEN_REQUIRED", status: 401 });
  let response;
  try {
    response = await fetcher(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }), signal: AbortSignal.timeout(10000), redirect: "error",
    });
  } catch {
    throw Object.assign(new Error("Firebase could not be reached. Please retry."), { code: "FIREBASE_UNAVAILABLE", status: 503 });
  }
  const body = await response.json().catch(() => ({}));
  const user = body.users?.[0];
  if (!response.ok || !user?.localId || !user.email || user.disabled) throw Object.assign(new Error("Firebase sign-in could not be verified."), { code: "FIREBASE_TOKEN_INVALID", status: 401 });
  if (!user.emailVerified) throw Object.assign(new Error("Verify your email using the Firebase email link, then continue."), { code: "PENDING_VERIFICATION", status: 403 });
  return { uid: user.localId, email: user.email.trim().toLowerCase(), name: user.displayName || "" };
}
