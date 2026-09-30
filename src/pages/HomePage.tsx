import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import ScanPage from "./ScanPage";

export default function HomePage() {
  const { user } = useAuth();
  if (user?.role === "aventure_reviewer") return <Navigate to="/verified" replace />;
  if (user?.role === "aventure_administrator") return <Navigate to="/users" replace />;
  if (user?.role === "vision71_support") return <p className="py-12 text-center">Aggregate counts will be available here.</p>;
  return <ScanPage />;
}
