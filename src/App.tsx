import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import HomePage from "./pages/HomePage";
import VerifiedQueuePage from "./pages/VerifiedQueuePage";
import SignInPage from "./pages/SignInPage";
import UserAdminPage from "./pages/UserAdminPage";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import LandingPage from "./pages/LandingPage";
import { useAuth } from "./auth/AuthContext";

function RootPage() {
  const { user } = useAuth();
  return user ? <AppLayout /> : <LandingPage />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/welcome" element={<LandingPage />} />
        <Route path="/" element={<RootPage />}>
          <Route index element={<HomePage />} />
        </Route>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/submissions" element={<VerifiedQueuePage />} />
            <Route path="/users" element={<UserAdminPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
