import { Outlet, useLocation } from "react-router-dom";
import MobileNav from "./MobileNav";
import Header from "./Header";
import { useAuth } from "@/auth/AuthContext";
import "../../pages/capture.css";

export default function AppLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const captureTheme = user?.role === "exhibition_assistant" || (user?.role === "vision71_administrator" && pathname === "/scan");
  return (
    <div className={`app-shell flex h-[100dvh] w-full flex-col overflow-hidden bg-slate-50/40 text-foreground ${captureTheme ? "capturer-theme" : ""}`}>
      <Header />
      <main className="mb-[calc(3.75rem+env(safe-area-inset-bottom,0px))] min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-4 sm:pt-6 md:mb-0 md:px-8">
        <div className="max-w-5xl mx-auto w-full space-y-4">
          <Outlet />
        </div>
      </main>
      <MobileNav />
    </div>
  );
}
