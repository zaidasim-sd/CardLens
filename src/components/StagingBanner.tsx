/**
 * StagingBanner
 *
 * Renders a persistent top banner when the app is running on the internal
 * staging environment. Controlled by the VITE_IS_STAGING build-time env var.
 *
 * Set in Vercel → Project Settings → Environment Variables:
 *   VITE_IS_STAGING = true   (Preview environment only)
 *   VITE_IS_STAGING = false  (Production environment — must be explicit)
 *
 * The banner is rendered outside the router so it is visible on every page,
 * including the sign-in page, without any authentication context.
 */

const IS_STAGING =
  import.meta.env.VITE_IS_STAGING === "true" ||
  import.meta.env.VITE_IS_STAGING === "1";

export default function StagingBanner() {
  if (!IS_STAGING) return null;

  return (
    <div
      role="banner"
      aria-label="Staging environment warning"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        backgroundColor: "#b45309",
        color: "#ffffff",
        textAlign: "center",
        padding: "6px 16px",
        fontSize: "13px",
        fontWeight: 600,
        letterSpacing: "0.02em",
        lineHeight: "1.4",
        boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
        userSelect: "none",
        pointerEvents: "none",
      }}
    >
      ⚠ Internal Staging Environment — Do Not Use for Client Access &nbsp;|&nbsp; Production:{" "}
      <span style={{ textDecoration: "underline", fontWeight: 700 }}>
        lead71.com
      </span>
    </div>
  );
}

/**
 * Returns the pixel height of the staging banner so layouts can offset
 * themselves when the banner is visible.
 */
export const STAGING_BANNER_HEIGHT = IS_STAGING ? 34 : 0;
