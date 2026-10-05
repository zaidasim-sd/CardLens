import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { reload, sendEmailVerification } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { formatAuthError } from "@/lib/authErrors";
import "./signin.css";

export default function VerifyOtpPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function verify() {
    setBusy(true); setError("");
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Sign in with your Firebase account to continue verification.");
      await reload(user);
      if (!user.emailVerified) throw new Error("Open the verification link in your email, then select Continue.");
      const idToken = await user.getIdToken(true);
      const response = await fetch("/api/auth?action=register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to request approval. Please retry.");
      navigate(body.status === "active" ? "/sign-in" : "/pending-approval");
    } catch (caught: any) {
      setError(formatAuthError(caught, "general").message);
    }
    finally { setBusy(false); }
  }
  async function resend() {
    setBusy(true); setError("");
    try {
      if (!auth.currentUser) throw new Error("Sign in before requesting another verification email.");
      await sendEmailVerification(auth.currentUser);
      setMessage("A verification link has been sent to your email.");
    } catch (caught: any) {
      setError(formatAuthError(caught, "general").message);
    }
    finally { setBusy(false); }
  }
  return <main className="lead71-signin min-h-screen flex items-center justify-center p-6">
    <section className="signin-form-wrap space-y-5">
      <h1>Verify your email</h1>
      <p>Open the Firebase verification link sent to your work email, then continue to request Aventure approval.</p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <button className="signin-submit" disabled={busy} onClick={verify}>Continue after verification</button>
      <button disabled={busy} onClick={resend}>Resend verification email</button>
      <p><Link to="/sign-in">Back to sign in</Link></p>
    </section>
  </main>;
}
