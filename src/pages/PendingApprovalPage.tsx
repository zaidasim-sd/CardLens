import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { Clock, RefreshCw, CheckCircle2 } from "lucide-react";
import { auth } from "@/lib/firebase";
import "./signin.css";

export default function PendingApprovalPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const emailParam = searchParams.get("email") || auth.currentUser?.email || "";
  const { signOut, refresh } = useAuth();
  const [isChecking, setIsChecking] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  async function checkApprovalStatus() {
    setIsChecking(true);
    setStatusMessage("");

    try {
      if (auth.currentUser) {
        await auth.currentUser.reload().catch(() => {});
        const idToken = await auth.currentUser.getIdToken(true);
        const preauthRes = await fetch("/api/auth?action=csrf", { credentials: "include" });
        const preauth = await preauthRes.json().catch(() => ({}));
        const signInRes = await fetch("/api/auth?action=sign_in", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": preauth.csrfToken || "",
          },
          body: JSON.stringify({ idToken }),
        });
        const signInData = await signInRes.json().catch(() => ({}));
        if (signInRes.ok && signInData.user?.status === "active") {
          await refresh();
          navigate("/");
          return;
        }
      }

      // Check existing session
      const res = await fetch("/api/auth?action=session", { credentials: "include" });
      const data = await res.json().catch(() => ({}));

      if (data?.user?.status === "active") {
        navigate("/");
      } else {
        setStatusMessage("Your email is verified, but your account is still awaiting administrator approval. Please check back shortly.");
      }
    } catch {
      setStatusMessage("Your email is verified, but your account is still awaiting administrator approval. Please check back shortly.");
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
            Pending Administrator Approval
          </h1>

          <div className="rounded-xl bg-emerald-50/90 border border-emerald-200/90 p-3.5 my-4 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-900/60 dark:text-emerald-200 text-left">
            <p className="font-semibold flex items-center gap-1.5 mb-1 text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              Email Verified Successfully
            </p>
            <p className="leading-relaxed text-slate-700 dark:text-slate-300">
              Your email has been verified. To protect exhibition and client contacts, all accounts require administrator authorization before access is granted.
            </p>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-sm mx-auto mb-6">
            An access authorization request has been dispatched to designated administrators. You will receive an email confirmation as soon as your account is approved.
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
