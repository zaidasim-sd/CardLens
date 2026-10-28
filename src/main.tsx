import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Poppins — served locally from node_modules, no CORS issues
import '@fontsource/poppins/300.css'
import '@fontsource/poppins/400.css'
import '@fontsource/poppins/500.css'
import '@fontsource/poppins/600.css'
import '@fontsource/poppins/700.css'
import '@fontsource/poppins/800.css'
import '@fontsource/poppins/900.css'
import { Toaster } from "@/components/ui/sonner"
import { AuthProvider } from "@/auth/AuthContext"
import { ThemeProvider } from "next-themes"
import './uiPolish.css'
import StagingBanner, { STAGING_BANNER_HEIGHT } from "@/components/StagingBanner"

// Apply banner offset as a CSS variable so all layouts can respond
if (STAGING_BANNER_HEIGHT > 0) {
  document.documentElement.style.setProperty("--staging-banner-height", `${STAGING_BANNER_HEIGHT}px`);
  document.documentElement.style.paddingTop = `${STAGING_BANNER_HEIGHT}px`;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StagingBanner />
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="lead71-theme" disableTransitionOnChange>
      <AuthProvider><App /></AuthProvider>
      <Toaster position="top-right" />
    </ThemeProvider>
  </StrictMode>,
)
