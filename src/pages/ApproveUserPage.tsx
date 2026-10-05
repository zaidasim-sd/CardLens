import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, AlertCircle, Loader2, ArrowRight, ShieldCheck, UserCheck } from "lucide-react";
import "./signin.css";

export default function ApproveUserPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const email = searchParams.get("email") || "";

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "approved" | "rejected" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token || !email) {
      setStatus("error");
      setMessage("Invalid authorization link. Missing security token or user email.");
    }
  }, [token, email]);

  async function handleDecision(decision: "approve" | "reject") {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`/api/auth?action=approve_user&token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}&decision=${decision}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email, decision }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to process authorization request.");
      }

      setStatus(decision === "approve" ? "approved" : "rejected");
      setMessage(data.message || (decision === "approve" ? "User account approved." : "User request declined."));
    } catch (err: any) {
      setStatus("error");
      setMessage(err.message || "An error occurred while authorizing this account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="lead71-signin">
      <header className="signin-header">
        <Link to="/welcome" className="signin-brand" aria-label="Lead71 home">
          <img src="/lead71-logo.svg" alt="Lead71 by Vision71" width="168" height="64" />
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6">
        <div className="w-full max-w-md bg-white border border-slate-200/80 rounded-2xl shadow-xl p-8 sm:p-10 text-center">
          {status === "idle" && (
            <>
              <div className="w-14 h-14 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-teal-100 shadow-xs">
                <ShieldCheck size={28} />
              </div>

              <h1 className="text-2xl font-bold text-slate-800 tracking-tight mb-2">
                Authorize Exhibition Assistant
              </h1>

              <p className="text-sm text-slate-500 leading-relaxed mb-6">
                A new user registration has requested access to the business card capture workspace.
              </p>

              <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-4 text-left mb-6 space-y-2">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Candidate Email</div>
                <div className="text-sm font-medium text-slate-800 break-all">{email || "Unknown Email"}</div>

                <div className="pt-2 border-t border-slate-200/50 flex items-center justify-between text-xs text-slate-500">
                  <span>Requested Role:</span>
                  <span className="font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200/50">
                    Exhibition Assistant
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => handleDecision("approve")}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm transition-all shadow-sm disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>Authorizing…</span>
                    </>
                  ) : (
                    <>
                      <UserCheck size={18} />
                      <span>Approve Account Access</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleDecision("reject")}
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-xl border border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 font-medium text-xs transition-all disabled:opacity-50"
                >
                  Decline Request
                </button>
              </div>

              <p className="text-xs text-slate-400 mt-6 leading-relaxed">
                Authorized approvers: Designated administrators.
              </p>
            </>
          )}

          {status === "approved" && (
            <>
              <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-emerald-100 shadow-xs">
                <CheckCircle2 size={28} />
              </div>

              <h1 className="text-2xl font-bold text-slate-800 tracking-tight mb-2">
                Account Approved
              </h1>

              <p className="text-sm text-slate-600 leading-relaxed mb-6">
                {message || `The account for ${email} has been authorized. A confirmation email has been dispatched to the user.`}
              </p>

              <div className="bg-emerald-50/70 border border-emerald-200/60 rounded-xl p-4 text-xs text-emerald-800 text-left mb-6">
                The user can now sign in at Lead71 and access the business card scanning and capture workspace.
              </div>

              <Link
                to="/sign-in"
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-semibold text-sm transition-all"
              >
                <span>Continue to Lead71</span>
                <ArrowRight size={16} />
              </Link>
            </>
          )}

          {status === "rejected" && (
            <>
              <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-rose-100 shadow-xs">
                <XCircle size={28} />
              </div>

              <h1 className="text-2xl font-bold text-slate-800 tracking-tight mb-2">
                Request Declined
              </h1>

              <p className="text-sm text-slate-600 leading-relaxed mb-6">
                {message || `The registration request for ${email} has been declined.`}
              </p>

              <Link
                to="/welcome"
                className="inline-flex items-center justify-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                Return to Lead71
              </Link>
            </>
          )}

          {status === "error" && (
            <>
              <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-amber-100 shadow-xs">
                <AlertCircle size={28} />
              </div>

              <h1 className="text-xl font-bold text-slate-800 tracking-tight mb-2">
                Authorization Link Unavailable
              </h1>

              <p className="text-sm text-slate-600 leading-relaxed mb-6">
                {message || "This authorization link is invalid or may have already been used."}
              </p>

              <Link
                to="/sign-in"
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-semibold text-sm transition-all"
              >
                Go to Sign In
              </Link>
            </>
          )}
        </div>
      </main>

      <footer className="signin-footer">
        © {new Date().getFullYear()} Vision71 Technologies
      </footer>
    </div>
  );
}
