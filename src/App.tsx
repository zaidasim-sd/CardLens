import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import HomePage from "./pages/HomePage";
import VerifiedQueuePage from "./pages/VerifiedQueuePage";
import SignInPage from "./pages/SignInPage";
import CreateAccountPage from "./pages/CreateAccountPage";
import VerifyOtpPage from "./pages/VerifyOtpPage";
import PendingApprovalPage from "./pages/PendingApprovalPage";
import ApproveUserPage from "./pages/ApproveUserPage";
import UserAdminPage from "./pages/UserAdminPage";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import LandingPage from "./pages/LandingPage";
import LegalPage from "./pages/LegalPage";
import { useAuth } from "./auth/AuthContext";
import pilot from "./config/pilot";

function SubmissionQueueRoute() {
  const { user } = useAuth();
  // SUBMISSION-ONLY PILOT: keep the route and full queue implementation restorable.
  if (pilot.submissionOnlyEnabled) return <Navigate to={user?.role === "vision71_administrator" ? "/users" : "/"} replace />;
  return <VerifiedQueuePage />;
}

function RootPage() {
  const { user } = useAuth();
  return user ? <AppLayout /> : <LandingPage />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/welcome" element={<LandingPage />} />
        <Route path="/privacy-policy" element={<LegalPage kind="privacy" />} />
        <Route path="/terms-of-use" element={<LegalPage kind="terms" />} />
        <Route path="/" element={<RootPage />}>
          <Route index element={<HomePage />} />
        </Route>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/create-account" element={<CreateAccountPage />} />
        <Route path="/verify-otp" element={<VerifyOtpPage />} />
        <Route path="/pending-approval" element={<PendingApprovalPage />} />
        <Route path="/approve-user" element={<ApproveUserPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/submissions" element={<SubmissionQueueRoute />} />
            <Route path="/users" element={<UserAdminPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
