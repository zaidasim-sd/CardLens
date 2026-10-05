import { createUserWithEmailAndPassword, sendEmailVerification, updateProfile } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";
import { ArrowLeft, ArrowRight, Mail, LockKeyhole, User, Eye, EyeOff, AlertCircle, Loader2 } from "lucide-react";
import "./signin.css";
import { isAllowedEmailDomain, getEmailHelperText, getEmailPlaceholder, getDomainErrorMessage } from "@/lib/authConfig";
import { formatAuthError } from "@/lib/authErrors";

export default function CreateAccountPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (!isAllowedEmailDomain(email)) {
      setError(getDomainErrorMessage());
      return;
    }

    if (password.length < 11) {
      setError("Password must be at least 11 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      const credential = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      await updateProfile(credential.user, { displayName: name.trim() });
      await sendEmailVerification(credential.user);
      setPassword("");
      setConfirmPassword("");

      // Navigate to OTP verification screen
      navigate(`/verify-otp?email=${encodeURIComponent(email.trim().toLowerCase())}`);
    } catch (caught: any) {
      const formatted = formatAuthError(caught, "signup");
      setError(formatted.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleSuccess(result: any) {
    if (result.status === "active") {
      await refresh();
      navigate("/");
    } else if (result.status === "pending_approval") {
      navigate("/pending-approval");
    } else if (result.status === "pending_verification") {
      navigate(`/verify-otp?email=${encodeURIComponent(result.email || email)}`);
    }
  }

  return (
    <div className="lead71-signin">
      <header className="signin-header">
        <Link to="/welcome" className="signin-brand" aria-label="Lead71 home">
          <img src="/lead71-logo.svg" alt="Lead71 by Vision71" width="168" height="64" />
        </Link>
      </header>

      <main className="signin-main create-account-main">
        <aside className="signin-story" aria-labelledby="create-story-title">
          <div className="signin-story-content">
            <h2 id="create-story-title">
              Capture cards fast.<br />
              <span>Deliver with confidence.</span>
            </h2>
            <p className="text-sm text-slate-500 mt-3 max-w-sm leading-relaxed">
              Authorized onboarding for Aventure Aviation exhibition personnel. Scan cards, verify details, and submit contacts straight to the review register.
            </p>
          </div>
        </aside>

        <section className="signin-panel" aria-labelledby="create-title">
          <div className="signin-form-wrap">
            <h1 id="create-title">Create Account</h1>
            <p className="signin-intro">Exhibition Assistant Registration</p>

            {/* Google Authentication for Exhibition Assistant */}
            <div className="space-y-3 mb-5">
              <GoogleSignInButton
                text="Continue with Google"
                onSuccess={handleGoogleSuccess}
                onError={(msg) => setError(msg)}
                disabled={busy}
              />

              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">OR</span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
              </div>
            </div>

            <form onSubmit={submit} className="signin-form" aria-busy={busy}>
              <div className="signin-field">
                <label htmlFor="name">Full name</label>
                <div className="signin-input-wrap">
                  <User size={17} aria-hidden="true" />
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder=""
                    required
                    autoComplete="name"
                    disabled={busy}
                  />
                </div>
              </div>

              <div className="signin-field">
                <label htmlFor="email">Work email address</label>
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
                <p className="text-[11px] text-slate-500 mt-1">{getEmailHelperText()}</p>
              </div>

              <div className="signin-field">
                <label htmlFor="password">Password</label>
                <div className="signin-input-wrap">
                  <LockKeyhole size={17} aria-hidden="true" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 11 characters"
                    minLength={11}
                    required
                    autoComplete="new-password"
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className="signin-password-toggle"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                  </button>
                </div>
              </div>

              <div className="signin-field">
                <label htmlFor="confirmPassword">Confirm password</label>
                <div className="signin-input-wrap">
                  <LockKeyhole size={17} aria-hidden="true" />
                  <input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat your password"
                    minLength={11}
                    required
                    autoComplete="new-password"
                    disabled={busy}
                  />
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
                    <Loader2 size={17} className="signin-spinner" /> Creating account…
                  </>
                ) : (
                  <>
                    Create Account <ArrowRight size={17} />
                  </>
                )}
              </button>
            </form>

            <div className="signin-return flex flex-col gap-2 mt-4 text-center">
              <p className="text-xs text-slate-500">
                Already have an account?{" "}
                <Link to="/sign-in" className="font-semibold text-[#248da3] hover:underline">
                  Sign in
                </Link>
              </p>
              <div>
                <Link to="/welcome" className="signin-back inline-flex">
                  <ArrowLeft size={14} />
                  <span>Back to website</span>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="signin-footer">© {new Date().getFullYear()} Vision71 Technologies</footer>
    </div>
  );
}
