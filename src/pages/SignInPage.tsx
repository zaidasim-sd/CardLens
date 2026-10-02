import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ArrowLeft, ArrowRight, Mail, LockKeyhole, Eye, EyeOff, AlertCircle, Loader2, ShieldCheck, Check } from "lucide-react";
import "./signin.css";

export default function SignInPage() {
  const { user, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [prototypeNoticeOpen, setPrototypeNoticeOpen] = useState(true);

  if (user) return <Navigate to="/" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try { await signIn(email.trim(), password); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Sign in failed. Please check your credentials."); }
    finally { setBusy(false); }
  }

  return (
    <div className="lead71-signin">
      <Dialog open={prototypeNoticeOpen} onOpenChange={setPrototypeNoticeOpen}>
        <DialogContent className="max-w-md w-[92vw] rounded-2xl border-slate-200 bg-white p-7 text-slate-800">
          <span className="signin-notice-icon"><ShieldCheck size={23} /></span>
          <DialogTitle className="text-xl font-semibold">Internal Testing Prototype</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-slate-500">
            You are accessing the Lead71 demonstration environment. Use sample cards to evaluate capture and review. Do not enter real customer cards or confidential contact information.
          </DialogDescription>
          <button className="signin-submit" onClick={() => setPrototypeNoticeOpen(false)}>I Understand &amp; Proceed <ArrowRight size={17} /></button>
        </DialogContent>
      </Dialog>
      <header className="signin-header">
          <Link to="/welcome" className="signin-brand" aria-label="Lead71 home"><img src="/lead71-logo.svg" alt="Lead71 by Vision71" width="168" height="64" /></Link>

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
            <div className="signin-detail-card"><span className="signin-detail-title"><Check size={16} /></span><div><i /><b /></div><div><i /><b /></div><div><i /><b /></div></div>
          </div>
        </div>
      </aside>
      <section className="signin-panel" aria-labelledby="signin-title">
        <div className="signin-form-wrap">
          <h1 id="signin-title">Welcome back.</h1>
          <p className="signin-intro">Sign in to Lead71.</p>
          <form onSubmit={submit} className="signin-form" aria-busy={busy}>
            <div className="signin-field">
              <label htmlFor="email">Email address</label>
              <div className="signin-input-wrap"><Mail size={17} aria-hidden="true" />
                <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required autoComplete="username" disabled={busy} />
              </div>
            </div>
            <div className="signin-field">
              <label htmlFor="password">Password</label>
              <div className="signin-input-wrap"><LockKeyhole size={17} aria-hidden="true" />
                <input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" minLength={11} required autoComplete="current-password" disabled={busy} />
                <button type="button" className="signin-password-toggle" onClick={() => setShowPassword((previous) => !previous)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} title={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
            </div>
            {error && <div className="signin-error" role="alert"><AlertCircle size={17} /><span>{error}</span></div>}
            <button type="submit" className="signin-submit" disabled={busy}>
              {busy ? <><Loader2 size={17} className="signin-spinner" />Signing in…</> : <>Sign in <ArrowRight size={17} /></>}
            </button>
          </form>
          <div className="signin-return"><Link to="/welcome" className="signin-back"><ArrowLeft size={14} /><span>Back to website</span></Link></div>
        </div>
      </section>

      </main>
      <footer className="signin-footer">© {new Date().getFullYear()} Vision71 Technologies</footer>
    </div>
  );
}
