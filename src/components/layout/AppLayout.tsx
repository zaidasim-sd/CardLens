import { Outlet } from "react-router-dom";
import MobileNav from "./MobileNav";
import Header from "./Header";

export default function AppLayout() {
  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground">
      <Header />
      <main className="mb-[calc(4rem+env(safe-area-inset-bottom,0px))] min-h-0 flex-1 overflow-y-auto bg-slate-50/50 px-4 pb-6 pt-24 sm:pt-26 md:mb-0 md:p-8">
        <div className="max-w-6xl mx-auto w-full">
          <p className="rounded-lg border border-slate-200/70 bg-slate-100/60 px-4 py-3 text-center text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300">
            <span className="font-medium">Prototype demonstration only.</span>{" "}
            Please do not upload Aventure business cards or personal information.
          </p>
          <Outlet />
        </div>
      </main>
      <MobileNav />
    </div>
  );
}
