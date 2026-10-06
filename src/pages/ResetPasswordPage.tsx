import ThemeToggle from "@/components/layout/ThemeToggle";
import { useState, useEffect, type FormEvent } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { verifyPasswordResetCode, confirmPasswordReset } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { LockKeyhole, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2, ArrowRight, ArrowLeft, KeyRound } from "lucide-react";
import { formatAuthError } from "@/lib/authErrors";
import "./signin.css";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const oobCode = searchParams.get("oobCode") || searchParams.get("token") || "";

  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(true);
  const [codeValid, setCodeValid] = useState(false);
  const [codeError, setCodeError] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resetSuccess, setResetSuccess] = useState(false);

  useEffect(() => {
    let active = true;

    async function verifyCode() {
      if (!oobCode) {
        if (active) {
          setVerifyingCode(false);
          setCodeValid(false);
          setCodeError("Missing password reset security code. Please request a new link.");
        }
        return;
      }

      try {
        const userEmail = await verifyPasswordResetCode(auth, oobCode);
        if (active) {
          setEmail(userEmail);
          setCodeValid(true);
        }
      } catch (err: any) {
        if (active) {
          setCodeValid(false);
          setCodeError(
            err.code === "auth/expired-action-code"
              ? "This password reset link has expired. Reset links are valid for 1 hour for security."
              : "This password reset link is invalid or has already been used."
          );
        }
      } finally {
        if (active) setVerifyingCode(false);
      }
    }

    verifyCode();
    return () => {
      active = false;
    };
  }, [oobCode]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (newPassword.length < 11) {
      setError("Password must be at least 11 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setResetSuccess(true);
    } catch (caught: any) {
      const formatted = formatAuthError(caught, "reset");
      setError(formatted.message || "Failed to reset password. The link may have expired.");
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

          {verifyingCode ? (
            <div className="py-12 space-y-4">
              <Loader2 className="w-9 h-9 animate-spin text-teal-600 mx-auto" />
              <p className="text-xs text-slate-500 font-medium">Verifying password reset link…</p>
            </div>
          ) : !codeValid ? (
            /* Expired / Invalid Code State */
            <div className="animate-in fade-in-50 duration-200">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-5 border border-amber-200/80">
                <AlertCircle className="w-7 h-7" />
              </div>

              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">
                Reset Link Unavailable
              </h1>

              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
                {codeError || "This password reset link is invalid or may have already been used."}
              </p>

              <div className="space-y-3">
                <Link
                  to="/forgot-password"
                  className="signin-submit w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl font-semibold text-sm transition-all"
                >
                  <span>Request new reset link</span>
                  <ArrowRight size={16} />
                </Link>

                <Link
                  to="/sign-in"
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium text-xs dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                >
                  <ArrowLeft size={13} />
                  <span>Return to Sign In</span>
                </Link>
              </div>
            </div>
          ) : resetSuccess ? (
            /* Success State */
            <div className="animate-in fade-in-50 duration-200">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-5 border border-emerald-200/80">
                <CheckCircle2 className="w-7 h-7" />
              </div>

              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">
                Password Reset Complete
              </h1>

              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
                Your password for <strong>{email}</strong> has been updated successfully. You can now sign in with your new credentials.
              </p>

              <button
                type="button"
                onClick={() => navigate("/sign-in")}
                className="signin-submit w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl font-semibold text-sm cursor-pointer transition-all"
              >
                <span>Sign In to Lead71</span>
                <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            /* Reset Password Form */
            <div className="animate-in fade-in-50 duration-200 text-left">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center mb-5 border border-teal-200/80 text-center">
                <KeyRound className="w-7 h-7" />
              </div>

              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mb-1">
                Choose a new password
              </h1>

              {email && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
                  Resetting credentials for <strong className="text-slate-700 dark:text-slate-200">{email}</strong>
                </p>
              )}

              {error && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 mb-5 flex items-start gap-2.5 text-xs text-red-800 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="flex-1 leading-relaxed">{error}</div>
                </div>
              )}

              <form onSubmit={submit} className="signin-form space-y-4">
                <div className="signin-field">
                  <label htmlFor="newPassword">New password</label>
                  <div className="signin-input-wrap">
                    <LockKeyhole size={17} aria-hidden="true" />
                    <input
                      id="newPassword"
                      type={showPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 11 characters"
                      minLength={11}
                      required
                      autoComplete="new-password"
                      disabled={busy}
                    />
                    <button
                      type="button"
                      className="signin-password-toggle"
                      onClick={() => setShowPassword((p) => !p)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="signin-field">
                  <label htmlFor="confirmPassword">Confirm new password</label>
                  <div className="signin-input-wrap">
                    <LockKeyhole size={17} aria-hidden="true" />
                    <input
                      id="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat new password"
                      minLength={11}
                      required
                      autoComplete="new-password"
                      disabled={busy}
                    />
                  </div>
                </div>

                <p className="text-[11px] text-slate-400">
                  Use at least 11 characters with a combination of letters, numbers, and symbols.
                </p>

                <button
                  type="submit"
                  disabled={busy}
                  className="signin-submit w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl font-semibold text-sm cursor-pointer disabled:opacity-60 transition-all mt-3"
                >
                  {busy ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Updating password…</span>
                    </>
                  ) : (
                    <>
                      <span>Reset Password</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

        </div>
      </main>

      <footer className="signin-footer">
        © {new Date().getFullYear()} Vision71 Technologies
      </footer>
    </div>
  );
}
