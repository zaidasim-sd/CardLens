import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";

export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) return <p className="p-8 text-center">Loading</p>;
  return user ? <Outlet /> : <Navigate to="/sign-in" replace />;
}
