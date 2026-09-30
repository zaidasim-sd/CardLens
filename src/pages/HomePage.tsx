import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import ScanPage from "./ScanPage";

export default function HomePage() {
  const { user } = useAuth();
  if (user?.role === "aventure_reviewer") return <p className="py-12 text-center">Review takes place in the approved Google Sheet.</p>;
  if (user?.role === "vision71_administrator") return <Navigate to="/users" replace />;
  if (user?.role === "vision71_support") return <p className="py-12 text-center">Aggregate counts will be available here.</p>;
  return <ScanPage />;
}
