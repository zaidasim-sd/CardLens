import ThemeToggle from "@/components/layout/ThemeToggle";
import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { Clock, RefreshCw, CheckCircle2, ShieldAlert, LogOut, LoaderCircle, HelpCircle, ArrowRight } from "lucide-react";
import { auth } from "@/lib/firebase";
import "./signin.css";

export default function PendingApprovalPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const emailParam = searchParams.get("email") || auth.currentUser?.email || "";
  const { signOut, refresh } = useAuth();
  const [isChecking, setIsChecking] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState<"pending" | "approved" | "rejected" | null>(null);

  async function checkApprovalStatus() {
    setIsChecking(true);
    setStatusMessage("");
    setStatusType(null);

    try {
      if (auth.currentUser) {
        await auth.currentUser.reload().catch(() => { });
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
          setStatusType("approved");
          setStatusMessage("Your account has been approved! Redirecting you to the capture workspace…");
          await refresh();
          setTimeout(() => navigate("/"), 1200);
          return;
        }

        if (signInData.code === "ACCOUNT_REJECTED") {
          setStatusType("rejected");
          setStatusMessage("Your registration request was not approved. Please contact your team administrator if you have questions.");
          return;
        }
      }

      // Check existing session
      const res = await fetch("/api/auth?action=session", { credentials: "include" });
      const data = await res.json().catch(() => ({}));

      if (data?.user?.status === "active") {
        setStatusType("approved");
        setStatusMessage("Your account is approved! Redirecting…");
        setTimeout(() => navigate("/"), 1000);
      } else {
        setStatusType("pending");
        setStatusMessage("Your registration is still awaiting administrator authorization. We will notify you by email as soon as it is approved.");
      }
    } catch {
      setStatusType("pending");
      setStatusMessage("Your registration is still awaiting administrator authorization. Please check back shortly.");
    } finally {
      setIsChecking(false);
    }
  }

  async function handleSignOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await auth.signOut().catch(() => { });
      await signOut().catch(() => { });
    } catch {
      // Ignore unauthenticated or network errors during sign out
    } finally {
      navigate("/welcome");
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
        <div className="w-full max-w-lg bg-white border border-slate-200/90 rounded-2xl shadow-xl p-7 sm:p-10 text-center dark:bg-slate-900 dark:border-slate-800 animate-in fade-in-50 duration-200">

          {/* Status Indicator Icon */}
          <div className={`mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-5 border shadow-xs transition-colors ${statusType === "approved"
              ? "bg-emerald-50 text-emerald-600 border-emerald-200/80 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800"
              : statusType === "rejected"
                ? "bg-rose-50 text-rose-600 border-rose-200/80 dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-800"
                : "bg-amber-50 text-amber-600 border-amber-200/80 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800"
            }`}>
            {statusType === "approved" ? (
              <CheckCircle2 className="w-8 h-8" />
            ) : statusType === "rejected" ? (
              <ShieldAlert className="w-8 h-8" />
            ) : (
              <Clock className="w-8 h-8" />
            )}
          </div>

          <h1 id="pending-title" className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">
            {statusType === "approved"
              ? "Account Approved"
              : statusType === "rejected"
                ? "Access Not Approved"
                : "Awaiting Administrator Approval"}
          </h1>

          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
            {statusType === "approved"
              ? "Your access has been authorized. You can now enter the exhibition workspace."
              : statusType === "rejected"
                ? "Your registration request could not be authorized at this time."
                : "Account created successfully. Access to the exhibition workspace requires authorization from an Administrator."}
          </p>

          {/* Unified Dynamic Status Card (Replaces Email Verified card) */}
          <div className={`rounded-xl border p-4 mb-5 text-xs text-left transition-all ${statusType === "approved"
              ? "bg-emerald-50/90 border-emerald-200/90 text-emerald-950 dark:bg-emerald-950/40 dark:border-emerald-900/60 dark:text-emerald-200"
              : statusType === "rejected"
                ? "bg-rose-50/90 border-rose-200/90 text-rose-950 dark:bg-rose-950/40 dark:border-rose-900/60 dark:text-rose-200"
                : "bg-amber-50/80 border-amber-200/90 text-amber-950 dark:bg-amber-950/40 dark:border-amber-900/60 dark:text-amber-200"
            }`}>
            <div className={`font-semibold flex items-center gap-2 mb-1.5 ${statusType === "approved"
                ? "text-emerald-800 dark:text-emerald-300"
                : statusType === "rejected"
                  ? "text-rose-800 dark:text-rose-300"
                  : "text-amber-800 dark:text-amber-300"
              }`}>
              {statusType === "approved" ? (
                <>
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>Access Authorized &amp; Active</span>
                </>
              ) : statusType === "rejected" ? (
                <>
                  <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                  <span>Request Declined</span>
                </>
              ) : (
                <>
                  <Clock className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>Approval Status: Pending</span>
                </>
              )}
            </div>
            {emailParam && (
              <p className="font-mono text-[11px] opacity-90 mb-1 pl-6 break-all">
                {emailParam}
              </p>
            )}
            <p className="leading-relaxed pl-6 opacity-90">
              {statusType === "approved"
                ? "Your Exhibition User account is authorized. You can now scan business cards and submit contacts directly."
                : statusType === "rejected"
                  ? "Your request was not approved. Please contact an Administrator if you believe this is an error."
                  : "Your registration has been queued. To safeguard exhibition contacts, all accounts must be approved by an Administrator prior to initial login."}
            </p>
          </div>

          {/* Clear Next Steps & Assurance */}
          {statusType !== "approved" && (
            <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-4 mb-6 text-left text-xs text-slate-600 dark:bg-slate-800/50 dark:border-slate-700/60 dark:text-slate-300 space-y-2">
              <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>What happens next:</span>
              </div>
              <ul className="list-disc pl-4 space-y-1.5 leading-relaxed">
                <li>An access authorization request has been dispatched to an Administrator.</li>
                <li>You will receive an email confirmation as soon as your access is approved.</li>
                <li><strong>You do not need to create another account.</strong> Your request is saved in the queue.</li>
              </ul>
            </div>
          )}

          {/* Status Message Feedback Alert */}
          {statusMessage && (
            <div
              className={`p-3 rounded-xl border text-xs text-left mb-5 flex items-start gap-2 ${statusType === "approved"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                  : statusType === "rejected"
                    ? "bg-rose-50 border-rose-200 text-rose-900"
                    : "bg-amber-50 border-amber-200 text-amber-900"
                }`}
            >
              {statusType === "approved" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : statusType === "rejected" ? (
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              ) : (
                <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 leading-relaxed">{statusMessage}</div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            {statusType === "approved" ? (
              <button
                type="button"
                onClick={() => navigate("/")}
                className="signin-submit w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl font-semibold text-sm cursor-pointer transition-all bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <span>Enter Exhibition Workspace</span>
                <ArrowRight size={16} />
              </button>
            ) : statusType === "rejected" ? (
              <button
                type="button"
                onClick={() => navigate("/welcome")}
                className="signin-submit w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl font-semibold text-sm cursor-pointer transition-all"
              >
                <span>Return to Homepage</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={checkApprovalStatus}
                disabled={isChecking || isSigningOut}
                className="signin-submit w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl font-semibold text-sm cursor-pointer disabled:opacity-60 transition-all"
              >
                <RefreshCw size={16} className={isChecking ? "animate-spin" : ""} />
                <span>{isChecking ? "Checking approval status…" : "Check Approval Status"}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleSignOut}
              disabled={isSigningOut}
              aria-busy={isSigningOut}
              className="signout-action min-h-11 w-full flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium text-xs dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
            >
              <span className="signout-icon" aria-hidden="true">
                {isSigningOut
                  ? <LoaderCircle className="signout-spinner" size={16} />
                  : <LogOut className="signout-door" size={16} />}
              </span>
              <span role="status">{isSigningOut ? "Signing out…" : "Sign out & return to homepage"}</span>
            </button>
          </div>

          {/* Support guidance */}
          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 text-center">
            <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
              <HelpCircle size={13} className="text-slate-400" />
              <span>Need expedited access for an upcoming event? Contact</span>
              <a href="mailto:az@vision71tech.com" className="text-teal-700 dark:text-teal-400 font-semibold underline">
                az@vision71tech.com
              </a>
            </p>
          </div>

        </div>
      </main>

      <footer className="signin-footer">
        © {new Date().getFullYear()} Vision71 Technologies
      </footer>
    </div>
  );
}
