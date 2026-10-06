import ThemeToggle from "@/components/layout/ThemeToggle";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Mail, ArrowLeft, ArrowRight, AlertCircle, CheckCircle2, Loader2, KeyRound } from "lucide-react";
import { formatAuthError } from "@/lib/authErrors";
import { getEmailPlaceholder, isAllowedEmailDomain, getDomainErrorMessage } from "@/lib/authConfig";
import "./signin.css";

export default function ForgotPasswordPage() {
  const [searchParams] = useSearchParams();
  const initialEmail = searchParams.get("email") || "";
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");

    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError("Please enter your work email address.");
      return;
    }

    if (!isAllowedEmailDomain(trimmed)) {
      setError(getDomainErrorMessage());
      return;
    }

    setBusy(true);

    try {
      const csrfResponse = await fetch("/api/auth?action=csrf", { credentials: "include" });
      const preauth = await csrfResponse.json();
      if (!csrfResponse.ok) throw new Error("We could not connect. Please try again shortly.");
      const response = await fetch("/api/auth?action=password_reset", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": preauth.csrfToken },
        body: JSON.stringify({ email: trimmed }),
      });
      const result = await response.json();
      if (result.code === "FIREBASE_RESET_NOT_CONFIGURED") {
        // Keep password recovery available until server-side email credentials are added.
        await sendPasswordResetEmail(auth, trimmed);
      } else if (!response.ok) {
        throw new Error(result.error || "We could not send the reset email. Please try again.");
      }
      setSubmittedEmail(trimmed);
    } catch (caught: any) {
      const formatted = formatAuthError(caught, "reset");
      setError(formatted.message || "Failed to send reset email. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lead71-signin min-h-screen flex flex-col justify-between">
      <header className="signin-header">
        <Link to="/welcome" className="signin-brand" aria-label="Lead71 home">
          <img src="/lead71-logo.svg" alt="Lead71 by Vision71" width="168" height="64" />
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex-1 flex items-center justify-center py-10 px-4 sm:px-6">
        <div className="w-full max-w-md bg-white border border-slate-200/90 rounded-2xl shadow-xl p-7 sm:p-10 text-center dark:bg-slate-900 dark:border-slate-800 animate-in fade-in-50 duration-200">
          
          {/* Header Icon */}
          <div className="mx-auto w-14 h-14 rounded-2xl bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 flex items-center justify-center mb-5 border border-teal-200/80 shadow-xs">
            <KeyRound className="w-7 h-7" />
          </div>

          {!submittedEmail ? (
            <>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">
                Reset your password
              </h1>

              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
                Enter your registered work email and we will send you a secure link to reset your account credentials.
              </p>

              {error && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 mb-5 text-left flex items-start gap-2.5 text-xs text-red-800 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="flex-1 leading-relaxed">{error}</div>
                </div>
              )}

              <form onSubmit={submit} className="signin-form text-left">
                <div className="signin-field mb-5">
                  <label htmlFor="email">Work Email address</label>
                  <div className="signin-input-wrap">
                    <Mail size={17} aria-hidden="true" />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (error) setError("");
                      }}
                      placeholder={getEmailPlaceholder()}
                      required
                      autoComplete="email"
                      disabled={busy}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="signin-submit w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl font-semibold text-sm cursor-pointer disabled:opacity-60 transition-all"
                >
                  {busy ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Sending reset email…</span>
                    </>
                  ) : (
                    <>
                      <span>Send reset link</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>
            </>
          ) : (
            <div className="animate-in fade-in-50 duration-200">
              <div className="mx-auto w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                <CheckCircle2 className="w-6 h-6" />
              </div>

              <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">
                Reset link sent
              </h2>

              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
                If an account exists for <strong className="text-slate-800 dark:text-white">{submittedEmail}</strong>, we have sent instructions to reset your password.
              </p>

              <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-3.5 mb-6 text-left text-xs text-slate-500 dark:bg-slate-800/50 dark:border-slate-700/60 leading-relaxed">
                Please check your inbox and spam folder. Reset links are valid for 1 hour for your security.
              </div>

              <button
                type="button"
                onClick={() => setSubmittedEmail("")}
                className="w-full py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium text-xs dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors mb-2"
              >
                Send to a different email
              </button>
            </div>
          )}

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
