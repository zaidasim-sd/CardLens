import { useState, type FormEvent } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";
import { ArrowLeft, ArrowRight, Mail, LockKeyhole, Eye, EyeOff, AlertCircle, Loader2, Check } from "lucide-react";
import "./signin.css";
import pilot from "@/config/pilot";
import { getSignInIntroText, getEmailPlaceholder } from "@/lib/authConfig";
import { formatAuthError } from "@/lib/authErrors";

export default function SignInPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user && (pilot.internalReviewEnabled || user.role !== "aventure_reviewer")) {
    return <Navigate to="/" replace />;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn(email.trim(), password);
    } catch (caught: any) {
      const formatted = formatAuthError(caught, "signin");
      if (!formatted.message && !formatted.redirect) return;
      if (formatted.redirect === "pending_approval") {
        navigate(`/pending-approval?email=${encodeURIComponent(email.trim())}`);
        return;
      }
      if (formatted.redirect === "verify_otp") {
        navigate(`/verify-otp?email=${encodeURIComponent(email.trim())}`);
        return;
      }
      setError(formatted.message);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    setBusy(true);
    setError("");
    try {
      if (!email.trim()) {
        setError("Please enter your work email address first.");
        return;
      }
      await sendPasswordResetEmail(auth, email.trim());
      setError("If an account exists for this email, a password reset link has been sent.");
    } catch (caught: any) {
      const formatted = formatAuthError(caught, "reset");
      setError(formatted.message);
    } finally {
      setBusy(false);
    }
  }

  function handleGoogleSuccess(result: { status: "active" | "pending_approval" | "pending_verification"; message?: string }) {
    if (result.status === "pending_approval") {
      navigate("/pending-approval");
    } else {
      navigate("/");
    }
  }

  return (
    <div className="lead71-signin">
      <header className="signin-header">
        <Link to="/welcome" className="signin-brand" aria-label="Lead71 home">
          <img src="/lead71-logo.svg" alt="Lead71 by Vision71" width="168" height="64" />
        </Link>
      </header>

      <main className="signin-main">
        <aside className="signin-story" aria-labelledby="signin-story-title">
          <div className="signin-story-content">
            <h2 id="signin-story-title">Good connections.<br /><span>Better follow-through.</span></h2>
            <div className="signin-illustration" aria-hidden="true">
              <div className="signin-demo-card">
                <div className="signin-card-brand"><span /><i /></div>
                <div className="signin-card-identity"><i /><i /></div>
                <div className="signin-card-divider" />
                <div className="signin-card-details"><i /><i /><i /></div>
                <div className="signin-scan-line" />
              </div>
              <span className="signin-card-connector"><ArrowRight size={16} /></span>
              <div className="signin-detail-card">
                <span className="signin-detail-title"><Check size={16} /></span>
                <div><i /><b /></div>
                <div><i /><b /></div>
                <div><i /><b /></div>
              </div>
            </div>
          </div>
        </aside>

        <section className="signin-panel" aria-labelledby="signin-title">
          <div className="signin-form-wrap">
            <h1 id="signin-title">Welcome back.</h1>
            <p className="signin-intro">{getSignInIntroText()}</p>

            {/* Google Authentication for Exhibition Assistant */}
            <div className="mb-2">
              <GoogleSignInButton
                text="Continue with Google"
                onSuccess={handleGoogleSuccess}
                onError={setError}
                disabled={busy}
              />
            </div>

            <div className="flex items-center gap-3 my-5" aria-hidden="true">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">OR</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            <form onSubmit={submit} className="signin-form" aria-busy={busy}>
              <div className="signin-field">
                <label htmlFor="email">Work Email address</label>
                <div className="signin-input-wrap">
                  <Mail size={17} aria-hidden="true" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={getEmailPlaceholder()}
                    required
                    autoComplete="username"
                    disabled={busy}
                  />
                </div>
              </div>

              <div className="signin-field">
                <label htmlFor="password">Password</label>
                <div className="signin-input-wrap">
                  <LockKeyhole size={17} aria-hidden="true" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    minLength={8}
                    required
                    autoComplete="current-password"
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className="signin-password-toggle"
                    onClick={() => setShowPassword((previous) => !previous)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="signin-error" role="alert">
                  <AlertCircle size={17} />
                  <span>{error}</span>
                </div>
              )}

              <button type="submit" className="signin-submit" disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 size={17} className="signin-spinner" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in <ArrowRight size={17} />
                  </>
                )}
              </button>
            </form>
            <button type="button" className="mt-3 text-sm text-teal-700" disabled={busy} onClick={resetPassword}>Forgot password?</button>

            <div className="mt-5 text-center text-xs text-slate-500">
              New Exhibition Assistant?{" "}
              <Link to="/create-account" className="font-semibold text-teal-700 hover:text-teal-900 transition-colors">
                Create account
              </Link>
            </div>

            <div className="signin-return">
              <Link to="/welcome" className="signin-back">
                <ArrowLeft size={14} />
                <span>Back to website</span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="signin-footer">
        © {new Date().getFullYear()} Vision71 Technologies · Aventure Aviation
      </footer>
    </div>
  );
}
