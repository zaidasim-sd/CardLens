import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import ScanPage from "./ScanPage";
import { Button } from "@/components/ui/button";
import { ListChecks } from "lucide-react";
import { Link } from "react-router-dom";

export default function HomePage() {
  const { user } = useAuth();

  if (user?.role === "aventure_reviewer") {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900 mt-12">
        <ListChecks className="mx-auto h-10 w-10 text-blue-600 mb-3" />
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Reviewer Workspace</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          Version 1 contact review takes place directly inside the approved Aventure Google Sheet. You can also view the current submission status queue.
        </p>
        <div className="mt-6 flex justify-center">
          <Link to="/submissions">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">
              View Review Queue
            </Button>
          </Link>
        </div>
      </div>
    );
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
