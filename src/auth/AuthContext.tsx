import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { setApiCsrfToken } from "@/lib/api";

export type Role = "exhibition_assistant" | "aventure_reviewer" | "vision71_administrator" | "vision71_support";

export interface SignedInUser {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: Role;
  expiresAt: string | null;
}

interface AuthValue {
  user: SignedInUser | null;
  loading: boolean;
  csrfToken: string;
  signIn: (tenantId: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

async function json(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "The request could not be completed.");
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

  const signIn = useCallback(async (tenantId: string, email: string, password: string) => {
    const preauth = await json(await fetch("/api/auth?action=csrf", { credentials: "include" }));
    const body = await json(await fetch("/api/auth?action=sign_in", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": preauth.csrfToken },
      body: JSON.stringify({ tenantId, email, password }),
    }));
    setUser(body.user);
    setCsrfToken(body.csrfToken);
    setApiCsrfToken(body.csrfToken);
  }, []);

  const signOut = useCallback(async () => {
    await json(await fetch("/api/auth?action=sign_out", { method: "POST", credentials: "include", headers: { "X-CSRF-Token": csrfToken } }));
    setUser(null);
    setCsrfToken("");
    setApiCsrfToken("");
  }, [csrfToken]);

  const value = useMemo(() => ({ user, loading, csrfToken, signIn, signOut, refresh }), [user, loading, csrfToken, signIn, signOut, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is required");
  return value;
}
