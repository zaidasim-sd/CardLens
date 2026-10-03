import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import LoadingScreen from "@/components/ui/LoadingScreen";
import pilot from "@/config/pilot";

export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!pilot.internalReviewEnabled && user?.role === "aventure_reviewer") return <Navigate to="/sign-in" replace />;
  return user ? <Outlet /> : <Navigate to="/sign-in" replace />;
}
