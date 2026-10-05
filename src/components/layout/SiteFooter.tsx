import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import "./SiteFooter.css";

export default function SiteFooter() {
  return <footer className="site-footer">
    <div className="site-footer-inner">
      <div className="site-footer-main">
        <div className="site-footer-brand">
          <Link to="/welcome" aria-label="Lead71 home" className="site-footer-logo"><img src="/Lead71_wnb.png" alt="Lead71 by Vision71" width="219" height="125" /></Link>
          <p>Capture thoughtfully.<br /><span>Connect confidently.</span></p>
        </div>
        <nav className="site-footer-nav" aria-label="Explore Lead71"><h2>Explore</h2><a href="/welcome#workflow">How it works <ArrowUpRight size={13} /></a><a href="/welcome#features">Why Lead71 <ArrowUpRight size={13} /></a><Link to="/sign-in">Sign in <ArrowRight size={13} /></Link></nav>
        <nav className="site-footer-nav" aria-label="Legal information"><h2>Information</h2><Link to="/privacy-policy">Privacy Policy <ArrowUpRight size={13} /></Link><Link to="/terms-of-use">Terms of Use <ArrowUpRight size={13} /></Link></nav>
        <div className="site-footer-maker"><span>BUILT BY</span><a href="https://vision71tech.com" target="_blank" rel="noopener noreferrer" aria-label="Visit Vision71 Technologies website"><img src="/vision71-logo.png" alt="Vision71 Technologies" width="1340" height="465" /></a><a className="site-footer-maker-link" href="https://vision71tech.com" target="_blank" rel="noopener noreferrer">Visit Vision71 <ArrowUpRight size={13} /></a></div>
      </div>
      <div className="site-footer-bottom"><span>© {new Date().getFullYear()} Vision71 Technologies. All rights reserved.</span><span>From the first scan to the next connection.</span></div>
    </div>
  </footer>;
}
