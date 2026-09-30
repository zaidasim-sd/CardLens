import { Outlet } from "react-router-dom";
import MobileNav from "./MobileNav";
import Header from "./Header";

export default function AppLayout() {
  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-slate-50/40 text-foreground">
      <Header />
      <main className="mb-[calc(3.75rem+env(safe-area-inset-bottom,0px))] min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-4 sm:pt-6 md:mb-0 md:px-8">
        <div className="max-w-5xl mx-auto w-full space-y-4">
          {/* Subtle Prototype Banner */}
          <div className="rounded-lg border border-slate-200/70 bg-white/80 px-3.5 py-2 text-center text-xs text-slate-500 shadow-2xs backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
            <span className="font-semibold text-slate-700 dark:text-slate-300">Internal Testing Prototype:</span>{" "}
            Do not enter real Aventure business cards or personal customer information.
          </div>
          <Outlet />
        </div>
      </main>
      <MobileNav />
    </div>
  );
}
