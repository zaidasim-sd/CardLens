import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X, LogIn, UserPlus } from "lucide-react";
import ThemeToggle from "./ThemeToggle";

export default function LandingMobileMenu() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return <div ref={root} className="relative md:hidden">
    <button ref={trigger} type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls={panelId}
      onClick={() => setOpen(value => !value)}
      className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-[#476775] hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#39b3c8]">
      {open ? <X size={20} /> : <Menu size={20} />}
    </button>
    {open && <div id={panelId} role="navigation" aria-label="Account navigation" className="absolute right-0 top-full z-50 mt-2 w-60 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <Link to="/sign-in" onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"><LogIn size={16} />Sign in</Link>
      <Link to="/create-account" onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"><UserPlus size={16} />Sign up</Link>
      <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
      <ThemeToggle inProfile menuItem={false} />
    </div>}
  </div>;
}
