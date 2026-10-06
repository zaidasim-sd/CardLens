import SiteFooter from "@/components/layout/SiteFooter";
import ThemeToggle from "@/components/layout/ThemeToggle";
import pilot from "@/config/pilot";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowRight, Check, CheckCheck, CircleCheck, FileSpreadsheet, PencilLine, ScanLine, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import "./landing.css";
import "./legal.css";

// Previous approval/transfer journey preserved for restoration after the pilot.
const previousSteps = [
  { title: "Scan a card", description: "Capture the connection." },
  { title: "Extract details", description: "Let OCR do the typing." },
  { title: "Verify manually", description: "Make every detail right." },
  { title: "Save to review", description: "One record. Two destinations." },
  { title: "Reviewer approval", description: "Your team makes the call." },
  { title: "Constant Contact", description: "Approved contacts move on." },
  { title: "Transferred", description: "A clear, confirmed finish." },
];
const steps = pilot.submissionOnlyEnabled
  ? [...previousSteps.slice(0, 3), { title: "Submit for review", description: "Your contact will appear in the review register." }]
  : previousSteps;
const stageDuration = 3000;
const endOfFlowHold = 2000;

function SkeletonFields({ form = false }: { form?: boolean }) {
  return <div className={`skeleton-fields ${form ? "skeleton-form" : ""}`}>
    {[0, 1, 2, 3].map(index => <div className="skeleton-field" key={index} style={{ "--field-delay": `${index * 130}ms` } as CSSProperties}>
      <span className="field-label" /><span className="field-value" />
      {form && <Check size={9} className="field-check" />}
    </div>)}
  </div>;
}

function StagePreview({ stage }: { stage: number }) {
  if (stage === 0) return <div className="scan-preview">
    <div className="scan-corners" />
    <div className="sample-business-card"><span className="sample-monogram"><span /><span /></span><span className="sample-card-lines"><i /><i /><i /></span><span className="sample-card-bottom"><i /><i /></span></div>
    <div className="scan-beam" /><span className="preview-caption"><ScanLine size={10} /> Capture card</span>
  </div>;
  if (stage === 1) return <div className="extract-preview"><div className="preview-heading"><Sparkles size={13} /><span>Extracted details</span></div><SkeletonFields /><span className="tiny-status"><span /> OCR extraction</span></div>;
  if (stage === 2) return <div className="verify-preview"><div className="preview-heading"><PencilLine size={13} /><span>Verify details</span></div><SkeletonFields form /><div className="preview-save">Submit for review <ArrowRight size={10} /></div></div>;
  // Submission-only pilot: one destination; portal and transfer previews below stay restorable.
  if (stage === 3 && pilot.submissionOnlyEnabled) return <div className="sheet-only-preview"><span className="sheet-only-icon"><FileSpreadsheet size={32} strokeWidth={1.5} /></span><strong>Review Register</strong><span>Your contact will appear in the review register</span><span className="sheet-only-status"><Check size={12} /> Submitted for review</span></div>;
  if (stage === 3) return <div className="split-preview"><div className="split-branch" /><div className="destination sheet-destination"><span className="destination-icon"><FileSpreadsheet size={17} /></span><div><strong>Google Sheet</strong><span>Record saved</span></div><Check size={12} className="destination-check" /></div><div className="destination portal-destination"><span className="destination-icon"><UsersRound size={17} /></span><div><strong>Reviewer Portal</strong><span>Awaiting review</span></div><Check size={12} className="destination-check" /></div></div>;
  if (stage === 4) return <div className="approval-preview"><span className="approval-avatar"><ShieldCheck size={22} /></span><div className="approval-lines"><i /><i /></div><div className="approval-stamp"><CircleCheck size={12} /> Approved</div><span className="approval-footnote">Reviewed by your team</span></div>;
  if (stage === 5) return <div className="contact-preview"><span className="contact-symbol"><span /><i /></span><strong>Constant Contact</strong><div className="outgoing-card"><span /><span /><span /></div><span className="tiny-status"><span /> Approved record only</span></div>;
  return <div className="transfer-preview"><span className="transfer-check"><CheckCheck size={23} /></span><span className="transfer-pill"><Check size={12} /> Transferred</span><span className="transfer-caption">Connection complete</span></div>;
}

function Workflow() {
  const [active, setActive] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [visible, setVisible] = useState(true);
  // Pause/play control temporarily hidden; step selection keeps the animation running.
  // const [paused, setPaused] = useState(false);
  const container = useRef<HTMLElement>(null);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.05 });
    if (container.current) observer.observe(container.current);
    const visibility = () => setVisible(!document.hidden && Boolean(container.current && container.current.getBoundingClientRect().bottom > 0 && container.current.getBoundingClientRect().top < window.innerHeight));
    document.addEventListener("visibilitychange", visibility);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  useEffect(() => {
    if (reduced || !visible) return;
    const duration = stageDuration + (active === steps.length - 1 ? endOfFlowHold : 0);
    const timer = window.setTimeout(() => setActive(value => (value + 1) % steps.length), duration);
    return () => window.clearTimeout(timer);
  }, [active, reduced, visible]);
  // Landing-only workspace presentation. Previous carousel/step cards below are
  // retained for restoration; capture-page animation stays independent.
  if (pilot.submissionOnlyEnabled) return <section id="workflow" className={`workflow-panel workflow-workspace ${!visible ? "motion-paused" : ""} ${reduced ? "motion-reduced" : ""}`} ref={container} aria-labelledby="workflow-title">
    <div className="workspace-intro"><div><h2 id="workflow-title">A clear path from card to contact.</h2><p>Capture it. Check it. Keep it in your team’s Sheet.</p></div>{/* Pause/play button temporarily hidden for this layout.
      <button type="button" className="workspace-motion-toggle" onClick={() => setPaused(value => !value)} aria-label={paused ? "Play workflow animation" : "Pause workflow animation"}>{paused ? <Play size={14} /> : <Pause size={14} />}</button>
    */}</div>
    <div className="workspace-window">
      <div className="workspace-window-bar"><span><ScanLine size={15} /> Contact workspace</span><span className="workspace-counter">{String(active + 1).padStart(2, "0")} / 04</span></div>
      <div className="workspace-body">
        <div className={`workspace-source ${active === 0 ? "is-active" : ""}`}><span className="workspace-label">YOUR BUSINESS CARD</span><div className="workspace-card-preview" aria-hidden="true"><StagePreview stage={0} /></div><span className="workspace-source-caption">{active === 0 ? "Reading the card" : "Card captured"}{active > 0 && <Check size={13} />}</span></div>
        <div className="workspace-handoff" aria-hidden="true"><ArrowRight size={20} /></div>
        <div className="workspace-result" key={active}>
          <div className="workspace-result-title">{active === 3 ? <FileSpreadsheet size={17} /> : active === 2 ? <PencilLine size={17} /> : active === 1 ? <Sparkles size={17} /> : <ScanLine size={17} />}<h3>{["A contact taking shape", "Details, without the typing", "A moment to make it right", "Right where your team needs it"][active]}</h3></div>
          {active === 3 ? <div className="workspace-sheet" aria-hidden="true"><div className="workspace-sheet-bar"><FileSpreadsheet size={15} /><strong>Google Sheets</strong><span><Check size={11} /> Saved</span></div><div className="workspace-sheet-head"><span>Name</span><span>Company</span><span>Email</span></div>{[0, 1, 2].map(index => <div className={`workspace-sheet-row ${index === 0 ? "workspace-new-row" : ""}`} key={index}><i /><i /><i /></div>)}<div className="workspace-sheet-confirm"><CircleCheck size={15} />Your contact has a place.</div></div> : <div className={`workspace-details ${active === 0 ? "workspace-details-waiting" : ""}`} aria-hidden="true">{["Name", "Company", "Email", "Phone"].map((label, index) => <div className="workspace-detail" key={label} style={{ "--field-delay": `${index * 120}ms` } as CSSProperties}><span>{label}</span><i />{active === 2 && <Check size={12} />}</div>)}<div className="workspace-detail-note">{active === 0 ? "Your details will appear here." : active === 1 ? "The card does the talking. We do the typing." : "Every field stays editable before you submit."}</div></div>}
        </div>
      </div>
    </div>
    <ol className="workspace-steps" aria-label="Explore the contact workflow">{steps.map((step, index) => <li key={step.title}><button type="button" className={`${index === active ? "is-current" : ""} ${index < active ? "is-done" : ""}`} aria-current={index === active ? "step" : undefined} onClick={() => setActive(index)}><span>{index < active ? <Check size={12} /> : String(index + 1).padStart(2, "0")}</span><strong>{["Capture", "Extract", "Verify", "Save to Sheets"][index]}</strong></button></li>)}</ol>
  </section>;
  return <section id="workflow" className={`workflow-panel workflow-carousel ${pilot.submissionOnlyEnabled ? "workflow-linear" : ""} ${!visible ? "motion-paused" : ""} ${reduced ? "motion-reduced" : ""}`} ref={container} aria-labelledby="workflow-title">
    <div className="workflow-toolbar"><h2 id="workflow-title">Every connection has a clear next step.</h2></div>
    <ol className="workflow-grid" aria-label="From business card to review register">
      {steps.map((step, index) => {
        const half = Math.floor(steps.length / 2);
        const slot = ((index - active + steps.length + half) % steps.length) - half;
        return <li key={step.title} style={{ "--slot": slot, "--depth": Math.abs(slot), zIndex: 7 - Math.abs(slot) } as CSSProperties} className={`workflow-node ${index === active && !reduced ? "is-active" : ""} ${index < active || reduced ? "is-complete" : ""} ${index === 3 ? "split-node" : ""}`}>
        <div className="node-heading"><span className="step-number">{index < active || reduced ? <Check size={11} /> : String(index + 1).padStart(2, "0")}</span><div><h3>{step.title}</h3><p>{step.description}</p></div></div>
        {index === 3 && <span className="sr-only">Your contact will appear in the review register.</span>}
        <div className="node-preview" aria-hidden="true"><StagePreview stage={index} /></div>
      </li>;
      })}
    </ol>
    <div className="workflow-bottom"><div className="workflow-progress" aria-hidden="true">{steps.map((step, index) => <span key={step.title} className={index <= active || reduced ? "progress-filled" : ""} />)}</div><span className="workflow-stage" aria-hidden="true">{reduced ? "The complete journey" : `${String(active + 1).padStart(2, "0")} / ${String(steps.length).padStart(2, "0")} · ${steps[active].title}`}</span></div>
  </section>;
}

export default function LandingPage() {
  const [workflowRun, setWorkflowRun] = useState(0);
  const restartWorkflow = () => setWorkflowRun(run => run + 1);
  return <div className="lead71-landing">
    <a className="landing-skip" href="#main-content">Skip to content</a>
    <header className="landing-header"><div className="landing-nav"><Link to="/" aria-label="Lead71 home" className="landing-logo"><img src="/lead71-logo.svg" alt="Lead71 by Vision71" width="168" height="44" /></Link><nav aria-label="Main navigation"><a href="#workflow" onClick={restartWorkflow}>How it works</a><a href="#features">Why Lead71</a></nav><div className="header-actions"><ThemeToggle /><Link to="/sign-in" className="landing-sign-in">Sign in <ArrowRight size={14} /></Link></div></div></header>
    <main id="main-content">
      <section className="landing-hero" aria-labelledby="hero-title"><h1 id="hero-title">A business card.<br />A better <span>next step.</span></h1><p className="hero-description">Turn the cards you collect into contacts you can trust.<br className="desktop-break" /> Scan a card, check the details, and submit it for review.</p><div className="hero-actions"><Link to="/sign-in" className="landing-primary">Start capturing <ArrowRight size={16} /></Link><a href="#workflow" className="landing-secondary" onClick={restartWorkflow}>See the workflow <ArrowDown size={15} /></a></div></section>
      <div className="landing-content"><Workflow key={workflowRun} />
        <section id="features" className="landing-features" aria-label="Why Lead71"><div><span className="feature-icon"><ScanLine size={20} /></span><h2>Capture without typing.</h2><p>OCR extracts the details. You add context and check what matters.</p></div><div><span className="feature-icon"><UsersRound size={20} /></span><h2>{pilot.submissionOnlyEnabled ? "Check before you save." : "A second set of eyes."}</h2><p>{pilot.submissionOnlyEnabled ? "Edit the extracted details and check possible duplicates before submitting." : "Compare possible duplicates and let your reviewer decide what stays."}</p></div><div><span className="feature-icon"><ShieldCheck size={20} /></span><h2>Confidence in every handoff.</h2><p>Encrypted records in Lead71, with contacts submitted directly to the review register.</p></div></section>
        <section className="landing-final" aria-labelledby="final-title"><div><span className="final-eyebrow">FROM THE FIRST SCAN TO THE FINAL HANDOFF</span><h2 id="final-title">Keep the connection.<br className="mobile-break" /> Lose the busywork.</h2></div><Link to="/sign-in" className="landing-primary">Open Lead71 <ArrowRight size={16} /></Link></section>
      </div>
    </main><SiteFooter />
  </div>;
}
