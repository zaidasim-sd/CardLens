import { signInWithEmailAndPassword, signOut as firebaseSignOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { setApiCsrfToken } from "@/lib/api";

export type Role = "exhibition_assistant" | "aventure_reviewer" | "vision71_administrator" | "vision71_support";

export interface SignedInUser {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: Role;
  status?: string;
  expiresAt: string | null;
}

interface AuthValue {
  user: SignedInUser | null;
  loading: boolean;
  csrfToken: string;
  signIn: (emailOrTenantId: string, passwordOrEmail: string, optionalPassword?: string) => Promise<void>;
  googleSignIn: (googleUser: User) => Promise<{ status: "active" | "pending_approval"; email?: string; message?: string }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

async function json(response: Response) {
  let body: any = null;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Server connection issue (${response.status}). Please check backend status.`);
  }
  if (!response.ok) throw new Error(body?.error || "The request could not be completed.");
  return body;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SignedInUser | null>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const body = await json(await fetch("/api/auth?action=session", { credentials: "include" }));
      setUser(body.user);
      setCsrfToken(body.csrfToken);
      setApiCsrfToken(body.csrfToken);
    } catch {
      setUser(null);
      setCsrfToken("");
      setApiCsrfToken("");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const signIn = useCallback(async (emailOrTenantId: string, passwordOrEmail: string, optionalPassword?: string) => {
    let tenantId = "";
    let email = "";
    let password = "";
    if (optionalPassword !== undefined) {
      tenantId = emailOrTenantId;
      email = passwordOrEmail;
      password = optionalPassword;
    } else {
      email = emailOrTenantId;
      password = passwordOrEmail;
    }

    const credential = await signInWithEmailAndPassword(auth, email, password);
    const idToken = await credential.user.getIdToken();
    const registration = await json(await fetch("/api/auth?action=register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }));
    if (registration.status === "rejected") throw new Error("Your account request was rejected.");
    if (registration.status !== "active") throw new Error("Your verified account is waiting for approval by Aventure.");
    const preauth = await json(await fetch("/api/auth?action=csrf", { credentials: "include" }));
    const body = await json(await fetch("/api/auth?action=sign_in", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": preauth.csrfToken },
      body: JSON.stringify({ tenantId: tenantId || "vision71-internal", idToken }),
    }));
    setUser(body.user);
    setCsrfToken(body.csrfToken);
    setApiCsrfToken(body.csrfToken);
  }, []);

  const googleSignIn = useCallback(async (googleUser: User) => {
    const idToken = await googleUser.getIdToken();
    const preauth = await json(await fetch("/api/auth?action=csrf", { credentials: "include" }));
    const response = await fetch("/api/auth?action=google_auth", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": preauth.csrfToken,
      },
      body: JSON.stringify({ idToken }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body?.error || "Google authentication failed.");
    }
    if (body.status === "pending_approval") {
      return { status: "pending_approval" as const, email: body.email || googleUser.email || "", message: body.message };
    }
    setUser(body.user);
    setCsrfToken(body.csrfToken);
    setApiCsrfToken(body.csrfToken);
    return { status: "active" as const, email: body.email || googleUser.email || "" };
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth?action=sign_out", {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": csrfToken },
      });
    } catch {
      // Ignore network errors during sign out
    } finally {
      await firebaseSignOut(auth);
      setUser(null);
      setCsrfToken("");
      setApiCsrfToken("");
    }
  }, [csrfToken]);

  const value = useMemo(() => ({ user, loading, csrfToken, signIn, googleSignIn, signOut, refresh }), [user, loading, csrfToken, signIn, googleSignIn, signOut, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is required");
  return value;
}
