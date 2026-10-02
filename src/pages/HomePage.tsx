import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import ScanPage from "./ScanPage";




export default function HomePage() {
  const { user } = useAuth();

  if (user?.role === "aventure_reviewer") {
    return <Navigate to="/submissions" replace />;
  }

  if (user?.role === "vision71_administrator") {
    return <Navigate to="/users" replace />;
  }

  if (user?.role === "vision71_support") {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900 mt-12">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Vision71 Technical Support</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Support access is active for system diagnostics and aggregate monitoring. Contact records are restricted.
        </p>
      </div>
    );
  }

  return <ScanPage />;
}
