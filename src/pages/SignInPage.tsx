import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignInPage() {
  const { user, signIn } = useAuth();
  const [tenantId, setTenantId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try { await signIn(tenantId, email, password); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Sign in failed."); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <p className="mx-auto mb-8 max-w-2xl rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm font-semibold text-amber-950">
        Demonstration prototype. Do not enter real Aventure cards or contact information.
      </p>
      <form onSubmit={submit} className="mx-auto max-w-md space-y-5 rounded-2xl border bg-white p-7 shadow-sm">
        <img src="/CardSnapLogo_Black.png" alt="CardSnap by Vision71" className="mx-auto h-16 w-auto" />
        <div><Label htmlFor="tenant">Organisation ID</Label><Input id="tenant" value={tenantId} onChange={(event) => setTenantId(event.target.value)} required autoComplete="organization" /></div>
        <div><Label htmlFor="email">Email</Label><Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="username" /></div>
        <div><Label htmlFor="password">Password</Label><Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} required autoComplete="current-password" /></div>
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        <Button className="w-full" disabled={busy}>{busy ? "Signing in" : "Sign in"}</Button>
      </form>
    </div>
  );
}
