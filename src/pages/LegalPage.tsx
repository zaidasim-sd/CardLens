import SiteFooter from "@/components/layout/SiteFooter";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import content from "./legalContent.json";
import "./landing.css";
import "./legal.css";

export default function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const document = content[kind];
  const title = kind === "privacy" ? "Privacy Policy" : "Terms of Use";
  useEffect(() => {
    const previous = window.document.title;
    window.document.title = `${title} | CardSnap`;
    window.scrollTo(0, 0);
    return () => { window.document.title = previous; };
  }, [title]);
  return <div className="cardsnap-landing legal-page">
    <a className="landing-skip" href="#legal-content">Skip to content</a>
    <header className="landing-header"><div className="landing-nav">
      <Link to="/welcome" className="landing-logo" aria-label="CardSnap home"><img src="/CardSnapLogo_Black.png" alt="CardSnap by Vision71" width="168" height="44" /></Link>
      <Link to="/sign-in" className="landing-sign-in">Sign in <ArrowRight size={16} /></Link>
    </div></header>
    <main id="legal-content" className="legal-main">
      <Link to="/welcome" className="legal-back"><ArrowLeft size={14} />Back to CardSnap</Link>
      <div className="legal-intro"><h1>{title}</h1><p>{kind === "privacy" ? "How CardSnap handles information when you scan and review business cards." : "The terms that apply when you use CardSnap."}</p>{kind === "privacy" && <span className="legal-document-name">Privacy Notice</span>}</div>
      <div className="legal-layout">
        <aside className="legal-contents"><details open><summary>On this page</summary><nav aria-label={`${title} contents`}>{document.sections.map((section, index) => <a key={section.title} href={`#section-${index + 1}`}><span>{String(index + 1).padStart(2, "0")}</span>{section.title}</a>)}</nav></details></aside>
        <article className="legal-article" aria-label={document.title}>{document.sections.map((section, index) => <section id={`section-${index + 1}`} key={section.title}><h2><span>{String(index + 1).padStart(2, "0")}</span>{section.title}</h2><ul>{section.items.map(item => <li key={item}>{item}</li>)}</ul></section>)}</article>
      </div>
    </main>
    <SiteFooter />
  </div>;
}
