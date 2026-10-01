import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  // Building2,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  ShieldCheck,
} from "lucide-react";

export default function SignInPage() {
  const { user, signIn } = useAuth();
  // Organisation ID is not required for now - commented out per request
  // const [tenantId, setTenantId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      // Sign in directly with email and password (tenantId resolved automatically)
      await signIn(email.trim(), password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign in failed. Please check your credentials.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col justify-between bg-gradient-to-b from-slate-50 via-white to-slate-100/80 px-4 py-8 sm:py-12 overflow-hidden dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Ambient background glow orbs */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-blue-400/10 blur-3xl dark:bg-blue-600/10" />
      <div className="pointer-events-none absolute top-1/2 -right-40 h-96 w-96 rounded-full bg-indigo-400/10 blur-3xl dark:bg-indigo-600/10" />

      {/* Top Prototype Notice Banner */}
      <div className="relative mx-auto w-full max-w-lg mb-6 sm:mb-8">
        <div className="flex items-center justify-center gap-2 rounded-full border border-amber-300/80 bg-amber-50/90 px-4 py-2 text-center text-xs font-semibold text-amber-900 shadow-xs backdrop-blur-sm dark:bg-amber-950/40 dark:border-amber-800/80 dark:text-amber-200">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>Internal Testing Prototype · Do not enter real customer cards</span>
        </div>
      </div>

      {/* Centered Premium Login Card */}
      <div className="relative mx-auto w-full max-w-md my-auto">
        <div className="rounded-3xl border border-slate-200/90 bg-white/95 p-7 sm:p-9 shadow-2xl shadow-blue-900/5 backdrop-blur-xl dark:bg-slate-900/95 dark:border-slate-800 dark:shadow-black/40">
          {/* Card Header & Brand */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center p-2.5 sm:p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/60 mb-4 ring-1 ring-slate-200/80 dark:ring-slate-700/60 shadow-xs">
              <img
                src="/CardSnapLogo_Black.png"
                alt="CardSnap by Vision71"
                className="h-16 sm:h-16 md:h-16 w-auto object-contain select-none dark:invert transition-transform hover:scale-[1.01]"
              />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Sign in to your account
            </h1>
            <p className="mt-1.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Exhibition Contact Capture & Verification Platform
            </p>
          </div>

          {/* Form */}
          <form onSubmit={submit} className="space-y-4 sm:space-y-5">
            {/* Organisation ID - Not required for now, commented out per request */}
            {/*
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="tenant" className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Organisation ID
                </Label>
                <button
                  type="button"
                  onClick={() => setTenantId("vision71-internal")}
                  className="text-[11px] font-medium text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400"
                >
                  Use default
                </button>
              </div>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <Building2 className="h-4 w-4" />
                </div>
                <Input
                  id="tenant"
                  value={tenantId}
                  onChange={(event) => setTenantId(event.target.value)}
                  placeholder="e.g. vision71-internal"
                  required
                  autoComplete="organization"
                  className="h-11 pl-9.5 text-sm rounded-xl border-slate-200 bg-slate-50/50 transition-colors focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-800/50 dark:focus:bg-slate-800"
                />
              </div>
            </div>
            */}

            {/* Email Address */}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Email Address
              </Label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <Mail className="h-4 w-4" />
                </div>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@company.com"
                  required
                  autoComplete="username"
                  className="h-11 pl-9.5 text-sm rounded-xl border-slate-200 bg-slate-50/50 transition-colors focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-800/50 dark:focus:bg-slate-800"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Password
                </Label>
                <span className="text-[11px] text-slate-400">Min. 11 characters</span>
              </div>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••••••"
                  minLength={11}
                  required
                  autoComplete="current-password"
                  className="h-11 pl-9.5 pr-10 text-sm rounded-xl border-slate-200 bg-slate-50/50 transition-colors focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-800/50 dark:focus:bg-slate-800"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/90 p-3 text-xs text-red-800 animate-in fade-in-50 duration-200 dark:bg-red-950/40 dark:border-red-900/60 dark:text-red-200"
              >
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
                <span className="leading-relaxed font-medium">{error}</span>
              </div>
            )}

            {/* Sign In CTA */}
            <Button
              type="submit"
              disabled={busy}
              className="w-full h-11 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold text-sm shadow-md shadow-blue-600/25 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span>Verifying credentials...</span>
                </>
              ) : (
                <span>Sign in</span>
              )}
            </Button>
          </form>

          {/* Security & Access Info Footer */}
          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 text-center">
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-600/80 dark:text-blue-400" />
              <span>Named account authentication · 256-bit AES session</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Footer */}
      <footer className="relative mt-8 text-center text-xs text-slate-400 dark:text-slate-600">
        <p>© {new Date().getFullYear()} Vision71 Technologies. Confidential exhibition testing environment.</p>
      </footer>
    </div>
  );
}
