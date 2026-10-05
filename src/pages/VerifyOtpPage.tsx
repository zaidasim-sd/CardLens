import { useState, useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Mail, CheckCircle2, AlertCircle, Loader2, ArrowRight, RefreshCw, KeyRound, Sparkles } from "lucide-react";
import "./signin.css";

export default function VerifyOtpPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const emailParam = searchParams.get("email") || "";

  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [devOtp, setDevOtp] = useState<string>(() => sessionStorage.getItem("lead71_dev_otp") || "");

  useEffect(() => {
    // Focus first input box on mount
    inputRefs.current[0]?.focus();
    if (devOtp) {
      console.log(
        `%c[Lead71 Dev OTP] %c${devOtp}%c (Valid for 10m)`,
        "background: #0f766e; color: #fff; font-weight: bold; padding: 4px 8px; border-radius: 4px;",
        "background: #f0fdfa; color: #0f766e; font-weight: bold; font-size: 14px; padding: 3px 8px; border: 1px solid #99f6e4; border-radius: 4px; margin-left: 6px;",
        "color: #64748b; font-size: 11px; margin-left: 6px;"
      );
    }
  }, [devOtp]);

  useEffect(() => {
    let timer: any;
    if (countdown > 0) {
      timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    } else {
      setCanResend(true);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  function handleDigitChange(index: number, val: string) {
    const char = val.slice(-1).replace(/\D/g, "");
    const newDigits = [...digits];
    newDigits[index] = char;
    setDigits(newDigits);
    setError("");

    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // If all 6 digits entered, auto-verify
    if (newDigits.every((d) => d.length === 1)) {
      void verifyCode(newDigits.join(""));
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;

    const newDigits = [...digits];
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pasted[i] || "";
    }
    setDigits(newDigits);
    setError("");

    const nextIndex = Math.min(pasted.length, 5);
    inputRefs.current[nextIndex]?.focus();

    if (pasted.length === 6) {
      void verifyCode(pasted);
    }
  }

  async function verifyCode(code: string) {
    if (!emailParam) {
      setError("Email address is missing. Please restart registration.");
      return;
    }
    setIsVerifying(true);
    setError("");

    try {
      const res = await fetch("/api/auth?action=verify_otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailParam, otp: code }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(body.error || "Invalid verification code. Please check and try again.");
      }

      sessionStorage.removeItem("lead71_dev_otp");
      setSuccessMsg("Email verified successfully! Forwarding to approval status…");
      setTimeout(() => {
        navigate(`/pending-approval?email=${encodeURIComponent(emailParam)}`);
      }, 1000);
    } catch (err: any) {
      setError(err.message || "Verification failed. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleResend() {
    if (!canResend || isResending) return;
    setIsResending(true);
    setError("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/auth?action=resend_otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailParam }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not resend verification code.");

      if (body.devOtp) {
        setDevOtp(body.devOtp);
        sessionStorage.setItem("lead71_dev_otp", body.devOtp);
        console.log(
          `%c[Lead71 Resent OTP] %c${body.devOtp}%c (Valid for 10m)`,
          "background: #0f766e; color: #fff; font-weight: bold; padding: 4px 8px; border-radius: 4px;",
          "background: #f0fdfa; color: #0f766e; font-weight: bold; font-size: 14px; padding: 3px 8px; border: 1px solid #99f6e4; border-radius: 4px; margin-left: 6px;",
          "color: #64748b; font-size: 11px; margin-left: 6px;"
        );
      }

      setSuccessMsg("A fresh 6-digit code has been sent to your email and logged to the server console.");
      setCountdown(60);
      setCanResend(false);
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } catch (err: any) {
      setError(err.message || "Failed to resend code.");
    } finally {
      setIsResending(false);
    }
  }

  function handleAutoFillDevOtp() {
    if (!devOtp) return;
    const arr = devOtp.split("").slice(0, 6);
    setDigits(arr);
    void verifyCode(devOtp);
  }

  return (
    <div className="lead71-signin min-h-screen flex flex-col bg-[#effafd] dark:bg-slate-950">
      <header className="signin-header">
        <Link to="/welcome" className="signin-brand" aria-label="Lead71 home">
          <img src="/lead71-logo.svg" alt="Lead71 by Vision71" width="168" height="64" />
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center py-10 px-4">
        <div className="w-full max-w-md bg-white border border-slate-200/90 rounded-2xl shadow-xl p-7 sm:p-10 text-center dark:bg-slate-900 dark:border-slate-800 animate-in fade-in-50 duration-200">
          {/* Key Icon */}
          <div className="w-13 h-13 rounded-2xl bg-teal-50 text-teal-600 dark:bg-teal-950/60 dark:text-teal-400 flex items-center justify-center mx-auto mb-4 border border-teal-200/80 shadow-xs">
            <KeyRound className="w-6 h-6" />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Check your email
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            We sent a 6-digit verification code to:
          </p>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 mt-2 mb-4 rounded-full bg-slate-100 border border-slate-200/60 text-xs font-semibold text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 max-w-full truncate">
            <Mail className="w-3.5 h-3.5 text-[#248da3] shrink-0" />
            <span className="truncate">{emailParam || "your email"}</span>
          </div>

          {/* Dev Helper Chip if OTP is detected in local test */}
          {devOtp && (
            <div className="my-2 p-2.5 rounded-xl bg-amber-50/90 border border-amber-200/80 text-amber-900 flex items-center justify-between gap-2 text-xs text-left dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200">
              <div className="flex items-center gap-1.5 font-mono">
                <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="text-[11px] font-sans text-amber-700 dark:text-amber-300">Dev Code:</span>
                <span className="font-bold tracking-wider text-sm bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-amber-200/60 shadow-2xs">
                  {devOtp}
                </span>
              </div>
              <button
                type="button"
                onClick={handleAutoFillDevOtp}
                className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 dark:text-teal-400 dark:hover:text-teal-200 underline cursor-pointer shrink-0"
              >
                Auto-fill
              </button>
            </div>
          )}

          {/* 6-Digit OTP Input Box Group */}
          <div className="flex justify-center gap-2 sm:gap-2.5 my-6" onPaste={handlePaste}>
            {digits.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => { inputRefs.current[idx] = el; }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                disabled={isVerifying}
                className="w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-bold text-slate-900 bg-white border border-slate-200 rounded-xl shadow-xs focus:border-[#248da3] focus:ring-2 focus:ring-[#248da3]/20 focus:outline-none transition-all dark:bg-slate-900 dark:border-slate-800 dark:text-white"
                aria-label={`Digit ${idx + 1}`}
              />
            ))}
          </div>

          {error && (
            <div className="signin-error mb-4 text-left" role="alert">
              <AlertCircle size={17} />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 text-xs font-medium mb-4 text-left dark:bg-teal-950/50 dark:border-teal-900/60 dark:text-teal-300">
              <CheckCircle2 size={16} className="shrink-0 text-teal-600" />
              <span>{successMsg}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => verifyCode(digits.join(""))}
            disabled={isVerifying || digits.some((d) => !d)}
            className="signin-submit w-full flex items-center justify-center gap-2"
          >
            {isVerifying ? (
              <>
                <Loader2 size={17} className="signin-spinner" /> Verifying code…
              </>
            ) : (
              <>
                Verify Email <ArrowRight size={17} />
              </>
            )}
          </button>

          {/* Resend and return links */}
          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 text-center space-y-3">
            <p className="text-xs text-slate-500">
              Didn't receive the email?{" "}
              {canResend ? (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={isResending}
                  className="font-semibold text-[#248da3] hover:underline cursor-pointer inline-flex items-center gap-1"
                >
                  {isResending && <RefreshCw className="w-3 h-3 animate-spin" />}
                  Resend code
                </button>
              ) : (
                <span className="text-slate-400">Resend in {countdown}s</span>
              )}
            </p>

            <div>
              <Link to="/sign-in" className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                Return to Sign In
              </Link>
            </div>
          </div>
        </div>
      </main>

      <footer className="signin-footer">
        © {new Date().getFullYear()} Vision71 Technologies · Aventure Aviation
      </footer>
    </div>
  );
}
