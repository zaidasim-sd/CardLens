import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { Clock, ShieldAlert, RefreshCw, CheckCircle2 } from "lucide-react";
import { auth } from "@/lib/firebase";
import "./signin.css";

export default function PendingApprovalPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const emailParam = searchParams.get("email") || "";
  const { signOut, refresh } = useAuth();
  const [isChecking, setIsChecking] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  async function checkApprovalStatus() {
    setIsChecking(true);
    setStatusMessage("");

    try {
      await refresh();
      // Check session
      const res = await fetch("/api/auth?action=session", { credentials: "include" });
      const data = await res.json().catch(() => ({}));

      if (data?.user?.status === "active") {
        navigate("/");
      } else {
        setStatusMessage("Your account is still awaiting review by Hala or Osman. Please check back shortly.");
      }
    } catch {
      setStatusMessage("Your account is still awaiting review by Hala or Osman. Please check back shortly.");
    } finally {
      setIsChecking(false);
    }
  }

  async function handleSignOut() {
    try {
      await auth.signOut().catch(() => {});
      await signOut();
    } catch {
      // ignore
    } finally {
      navigate("/welcome");
    }
  }

  return (
    <div className="lead71-signin">
      <header className="signin-header">
        <Link to="/welcome" className="signin-brand" aria-label="Lead71 home">
          <img src="/lead71-logo.svg" alt="Lead71 by Vision71" width="168" height="64" />
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center py-10 px-4">
        <div className="w-full max-w-md bg-white border border-slate-200/90 rounded-2xl shadow-xl p-7 sm:p-10 text-center dark:bg-slate-900 dark:border-slate-800 animate-in fade-in-50 duration-200">
          {/* Hourglass / Clock Icon */}
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 flex items-center justify-center mb-4 border border-amber-200">
            <Clock className="w-7 h-7" />
          </div>

          <h1 id="pending-title" className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Pending Approval
          </h1>

          <div className="rounded-xl bg-amber-50/80 border border-amber-200/80 p-3.5 my-4 text-xs text-amber-800 dark:bg-amber-950/40 dark:border-amber-900/60 dark:text-amber-300 text-left">
            <p className="font-semibold flex items-center gap-1.5 mb-1">
              <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600" />
              Account Verified
            </p>
            <p className="leading-relaxed">
              Your email has been verified. To protect Aventure Aviation contacts, all Exhibition Assistant accounts require authorization before scanner access is granted.
            </p>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-sm mx-auto mb-6">
            An access approval request has been dispatched to <strong>Hala</strong> and <strong>Osman</strong>. You will receive an email confirmation as soon as your access is approved.
          </p>

          {emailParam && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 text-xs font-medium mb-6 dark:bg-slate-800 dark:text-slate-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
              <span>{emailParam}</span>
            </div>
          )}

          {statusMessage && (
            <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200 mb-4 dark:bg-amber-950/50 dark:border-amber-900 dark:text-amber-300">
              {statusMessage}
            </p>
          )}

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={checkApprovalStatus}
              disabled={isChecking}
              className="signin-submit w-full flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw size={15} className={isChecking ? "animate-spin" : ""} />
              <span>{isChecking ? "Checking status…" : "Check Approval Status"}</span>
            </button>

            <button
              type="button"
              onClick={handleSignOut}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:white transition-colors"
            >
              Sign out &amp; return to homepage
            </button>
          </div>
        </div>
      </main>

      <footer className="signin-footer">© {new Date().getFullYear()} Vision71 Technologies</footer>
    </div>
  );
}
