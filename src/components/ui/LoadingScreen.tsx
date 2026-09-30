export default function LoadingScreen() {
  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-b from-slate-50 via-white to-slate-100/80 px-4 overflow-hidden dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Ambient background glow orbs */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-80 w-80 rounded-full bg-blue-400/10 blur-3xl dark:bg-blue-600/10" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-indigo-400/10 blur-3xl dark:bg-indigo-600/10" />

      {/* Centered Loading Card */}
      <div className="relative flex flex-col items-center text-center p-8 max-w-xs w-full animate-in fade-in-50 zoom-in-95 duration-200">
        {/* Logo Container */}
        <div className="mb-6 flex items-center justify-center p-3 rounded-2xl bg-white/80 dark:bg-slate-800/60 ring-1 ring-slate-200/80 dark:ring-slate-700/60 shadow-xs backdrop-blur-sm">
          <img
            src="/CardSnapLogo_Black.png"
            alt="CardSnap by Vision71"
            className="h-12 w-auto object-contain select-none dark:invert"
          />
        </div>

        {/* Premium Dual-Ring Spinner */}
        <div className="relative mb-5 flex items-center justify-center">
          <div className="h-10 w-10 rounded-full border-2 border-slate-200 dark:border-slate-800" />
          <div className="absolute h-10 w-10 rounded-full border-2 border-transparent border-t-blue-600 border-r-blue-600 animate-spin dark:border-t-blue-500 dark:border-r-blue-500" />
          <div className="absolute h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400 animate-pulse" />
        </div>

        {/* Text Details */}
        <h2 className="text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-200">
          Loading CardSnap
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Verifying session & workspace…
        </p>
      </div>
    </div>
  );
}
