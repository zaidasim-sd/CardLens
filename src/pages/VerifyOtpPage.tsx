import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { reload, sendEmailVerification } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { formatAuthError } from "@/lib/authErrors";
import { Mail, CheckCircle2, AlertCircle, Loader2, ArrowRight, RefreshCw, ArrowLeft } from "lucide-react";
import "./signin.css";

export default function VerifyOtpPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const emailParam = searchParams.get("email") || auth.currentUser?.email || "";

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  async function verify() {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error("Please sign in with your work email to continue verification.");
      }

      await reload(user);

      if (!user.emailVerified) {
        throw new Error("Your email is not verified yet. Please click the verification link in your inbox, then select Continue.");
      }

      const idToken = await user.getIdToken(true);
      const response = await fetch("/api/auth?action=register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Unable to complete registration. Please retry.");
      }

      if (body.status === "active") {
        navigate("/sign-in");
      } else {
        navigate(`/pending-approval?email=${encodeURIComponent(emailParam || user.email || "")}`);
      }
    } catch (caught: any) {
      const formatted = formatAuthError(caught, "general");
      setError(formatted.message || caught.message);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (cooldown > 0) return;
    setResending(true);
    setError("");
    setMessage("");

    try {
      if (!auth.currentUser) {
        throw new Error("Session expired. Please sign in again before requesting another verification email.");
      }

      await sendEmailVerification(auth.currentUser);
      setMessage("A fresh verification email has been dispatched. Please check your inbox and spam folder.");
      setCooldown(45);
    } catch (caught: any) {
      const formatted = formatAuthError(caught, "general");
      setError(formatted.message || caught.message);
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="lead71-signin min-h-screen flex flex-col justify-between">
      <header className="signin-header">
        <Link to="/welcome" className="signin-brand" aria-label="Lead71 home">
          <img src="/lead71-logo.svg" alt="Lead71 by Vision71" width="168" height="64" />
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center py-10 px-4 sm:px-6">
        <div className="w-full max-w-md bg-white border border-slate-200/90 rounded-2xl shadow-xl p-7 sm:p-10 text-center dark:bg-slate-900 dark:border-slate-800 animate-in fade-in-50 duration-200">

          {/* Header Icon */}
          <div className="mx-auto w-14 h-14 rounded-2xl bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 flex items-center justify-center mb-5 border border-teal-200/80 shadow-xs">
            <Mail className="w-7 h-7" />
          </div>

          <h1 id="verify-title" className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">
            Verify your email address
          </h1>

          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-5">
            We sent a verification link to your work email. Click the link in that email to confirm your identity.
          </p>

          {/* Email badge pill */}
          {emailParam && (
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold mb-6 border border-slate-200/70 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 max-w-full truncate">
              <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse shrink-0" />
              <span className="truncate">{emailParam}</span>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 mb-5 text-left flex items-start gap-2.5 text-xs text-red-800 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{error}</div>
            </div>
          )}

          {/* Success Banner */}
          {message && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3.5 mb-5 text-left flex items-start gap-2.5 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{message}</div>
            </div>
          )}

          {/* Steps Callout */}
          <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-4 mb-6 text-left text-xs text-slate-600 dark:bg-slate-800/50 dark:border-slate-700/60 dark:text-slate-300 space-y-2">
            <div className="font-semibold text-slate-800 dark:text-slate-200">Next Steps:</div>
            <ol className="list-decimal pl-4 space-y-1 leading-relaxed">
              <li>Open the verification email sent to your inbox.</li>
              <li>Click the verification link provided.</li>
              <li>Return here and select <strong>Continue after verification</strong>.</li>
            </ol>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={verify}
              disabled={busy}
              className="signin-submit w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl font-semibold text-sm cursor-pointer disabled:opacity-60 transition-all"
            >
              {busy ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Checking verification…</span>
                </>
              ) : (
                <>
                  <span>Continue after verification</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={resend}
              disabled={resending || cooldown > 0 || busy}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium text-xs dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={13} className={resending ? "animate-spin" : ""} />
              <span>
                {cooldown > 0 ? `Resend email in ${cooldown}s` : resending ? "Sending…" : "Resend verification email"}
              </span>
            </button>
          </div>

          {/* Return link */}
          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-center">
            <Link
              to="/sign-in"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-900 dark:text-teal-400 dark:hover:text-teal-300 transition-colors"
            >
              <ArrowLeft size={14} />
              <span>Back to sign in</span>
            </Link>
          </div>

        </div>
      </main>

      <footer className="signin-footer">
        © {new Date().getFullYear()} Vision71 Technologies
      </footer>
    </div>
  );
}
