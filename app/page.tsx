"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import "./landing.css";

// Deterministic visuals (avoid server/client hydration mismatch).
const DOTS = [
  1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1,
  1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0,
  1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1,
];
const CHART = [8, 18, 34, 58, 82, 100, 88, 64, 40, 20];

const Arrow = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

const Flag = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
  </svg>
);

export default function HomePage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const reveals = Array.from(root.querySelectorAll<HTMLElement>(".reveal"));
    const counters = Array.from(root.querySelectorAll<HTMLElement>("[data-count]"));

    if (reduce || !("IntersectionObserver" in window)) {
      reveals.forEach((r) => r.classList.add("in"));
      return;
    }

    const revObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            revObs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    reveals.forEach((r) => revObs.observe(r));

    const countUp = (el: HTMLElement) => {
      const target = parseFloat(el.getAttribute("data-count") || "0");
      const suffix = el.getAttribute("data-suffix") || "";
      let start: number | null = null;
      const dur = 1400;
      const tick = (ts: number) => {
        if (start === null) start = ts;
        const p = Math.min((ts - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased).toLocaleString() + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const countObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            countUp(e.target as HTMLElement);
            countObs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.5 }
    );
    counters.forEach((c) => countObs.observe(c));

    return () => {
      revObs.disconnect();
      countObs.disconnect();
    };
  }, []);

  return (
    <div className="pcx" ref={rootRef}>
      {/* NAV */}
      <nav className={`top${scrolled ? " scrolled" : ""}`}>
        <div className="wrap nav-row">
          <a className="brand" href="#top">
            <Image src="/precognise_logo_new.png" alt="PreCognise" width={150} height={26} priority />
            <span className="tag">Assess</span>
          </a>
          <div className="nav-links">
            <a className="link" href="#how">How it works</a>
            <a className="link" href="#features">Features</a>
            <a className="link" href="#integrity">Integrity</a>
            <a className="link" href="#demo">Pricing</a>
          </div>
          <div className="nav-cta">
            <Link className="util-link" href="/candidate/login">Candidate? Log in</Link>
            <Link className="util-link" href="/admin">Log in</Link>
            <a className="btn btn-primary btn-sm" href="#demo">Book a demo</a>
          </div>
        </div>
      </nav>

      <div id="top" />

      {/* HERO */}
      <header className="hero">
        <div className="wrap hero-grid">
          <div className="reveal in">
            <p className="eyebrow">PreCognise Assess — skills-based hiring</p>
            <h1>Hire on <span className="hl">proven skill</span>, not guesswork.</h1>
            <p className="lead">Give every candidate the same fair test — at any scale, with integrity built in. Structured, scientific, and impossible to game.</p>
            <div className="hero-cta">
              <a className="btn btn-primary" href="#demo">Book a demo <Arrow /></a>
              <a className="btn btn-text" href="#how">See how it works</a>
            </div>
            <div className="hero-stats">
              <div className="hs"><div className="n" data-count="5000" data-suffix="+">5,000+</div><div className="l">candidates per session</div></div>
              <div className="hs"><div className="n" data-count="7">7</div><div className="l">anti-cheat controls</div></div>
              <div className="hs"><div className="n" data-count="100" data-suffix="%">100%</div><div className="l">automatic scoring</div></div>
            </div>
          </div>

          <div className="reveal in mock-scroll" style={{ transitionDelay: ".12s" }}>
            <div className="mock">
              <div className="mock-bar"><i /><i /><i /><span className="u">admin · live session</span></div>
              <div className="mock-head">
                <div>
                  <div className="name">Relationship Manager — RBC Canada</div>
                  <div className="sub">RELA · 500 invited</div>
                </div>
                <span className="live-pill"><span className="p" /> Live</span>
              </div>
              <div className="mock-stats">
                <div className="mstat"><div className="n" data-count="342">342</div><div className="l">Joined</div></div>
                <div className="mstat"><div className="n" data-count="118">118</div><div className="l">In&nbsp;progress</div></div>
                <div className="mstat"><div className="n" data-count="207">207</div><div className="l">Submitted</div></div>
              </div>
              <div className="mock-prog">
                <div className="track"><div className="fill" /></div>
                <div className="cap">68% complete · avg 11m 42s</div>
              </div>
              <div className="mrow"><span className="id">RELA-014</span><span className="who">Amara Okafor</span><span className="badge b-done">Submitted</span></div>
              <div className="mrow shimmer"><span className="id">RELA-021</span><span className="who">Daniel Cho</span><span className="badge b-active">In&nbsp;progress</span></div>
              <div className="mrow"><span className="id">RELA-038</span><span className="who">Priya Nair</span><span className="badge b-flag">Flagged</span></div>
              <div className="mrow"><span className="id">RELA-047</span><span className="who">Marco Rossi</span><span className="badge b-done">Submitted</span></div>
            </div>
            <div className="float-flag">
              <span className="ic"><Flag /></span>
              <div>
                <div className="fl">Integrity flag</div>
                <div style={{ fontSize: 11, marginTop: 1 }}>Tab-switch · RELA-038</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* PROBLEM */}
      <section className="blk" id="why">
        <div className="wrap">
          <div className="problem reveal">
            <div>
              <p className="eyebrow">The problem</p>
              <h2>Résumés don&apos;t predict performance.</h2>
              <p>Interviews reward confidence over competence. CVs reward the well-connected. Neither tells you who can actually do the job — and both quietly let bias in. Skills-based assessment puts every candidate on a level field, so the most capable person is the one who stands out.</p>
            </div>
            <div className="vs">
              <div className="vs-card"><div className="t"><span className="vs-x">✕</span> The old way</div><div className="d">Gut-feel interviews · CV keyword scans · inconsistent scoring</div></div>
              <div className="vs-card good"><div className="t"><span className="vs-check">✓</span> With PreCognise Assess</div><div className="d">Identical test · objective scoring · proctored integrity · decisions backed by data</div></div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="blk" id="features" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <div className="sec-head reveal">
            <p className="eyebrow">What you get</p>
            <h2>Everything you need to hire on skill</h2>
            <p className="lead">From building the assessment to defending the result — one platform, no downloads for candidates.</p>
          </div>

          <div className="feat reveal">
            <div>
              <span className="kicker">Fairness</span>
              <h3>The same test for everyone — down to the second.</h3>
              <p>Every candidate answers the same questions, on the same clock, scored the same way. No advantage for who interviews well or applied first.</p>
              <ul>
                <li><span className="ck">✓</span> Identical question set &amp; timing per campaign</li>
                <li><span className="ck">✓</span> Objective, automatic scoring — with optional negative marking</li>
                <li><span className="ck">✓</span> Question &amp; answer shuffle to stop copying</li>
              </ul>
            </div>
            <div className="feat-visual">
              <div className="vlabel">Same assessment · 3 candidates</div>
              <div className="same-rows">
                <div className="sr"><span className="av" /> Candidate A <span className="q">Q7 / 20 · 11:59</span></div>
                <div className="sr hl"><span className="av" /> Candidate B <span className="q">Q7 / 20 · 11:59</span></div>
                <div className="sr"><span className="av" /> Candidate C <span className="q">Q7 / 20 · 11:59</span></div>
              </div>
            </div>
          </div>

          <div className="feat flip reveal" id="integrity">
            <div>
              <span className="kicker">Integrity</span>
              <h3>Cheating is caught, not assumed.</h3>
              <p>Turn on exactly the controls each role needs. Every violation is detected, logged, and — if you choose — grounds for automatic disqualification.</p>
              <ul>
                <li><span className="ck">✓</span> Tab-switch, fullscreen, copy-paste &amp; right-click controls</li>
                <li><span className="ck">✓</span> Duplicate-login and screenshot protection</li>
                <li><span className="ck">✓</span> Configurable limits — warn, then disqualify</li>
              </ul>
            </div>
            <div className="feat-visual">
              <div className="vlabel">Anti-cheat controls</div>
              <div className="anti-grid">
                <div className="ac"><span className="sw" /> Tab-switch</div>
                <div className="ac"><span className="sw" /> Fullscreen</div>
                <div className="ac"><span className="sw" /> Copy / paste</div>
                <div className="ac"><span className="sw" /> Duplicate login</div>
                <div className="ac"><span className="sw" /> Answer shuffle</div>
                <div className="ac off"><span className="sw" /> Right-click</div>
              </div>
            </div>
          </div>

          <div className="feat reveal">
            <div>
              <span className="kicker">Scale</span>
              <h3>From five candidates to five thousand.</h3>
              <p>Bulk-import a candidate list from CSV or Excel and PreCognise issues a unique access ID and password to each — then runs them all in one synchronized live session.</p>
              <ul>
                <li><span className="ck">✓</span> CSV / Excel import with auto-generated credentials</li>
                <li><span className="ck">✓</span> Unique access ID per candidate (e.g. RELA-001)</li>
                <li><span className="ck">✓</span> One live session, real-time monitoring</li>
              </ul>
            </div>
            <div className="feat-visual">
              <div className="scale-vis">
                <div className="vlabel" style={{ textAlign: "center" }}>Candidates in one campaign</div>
                <div className="big" data-count="5000" data-suffix="+">5,000+</div>
                <div className="cap">one synchronized session</div>
                <div className="dotgrid">
                  {DOTS.map((d, i) => (
                    <i key={i} className={d ? "on" : undefined} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="feat flip reveal">
            <div>
              <span className="kicker">Decide</span>
              <h3>Shortlist with evidence, not vibes.</h3>
              <p>Results land as clean, comparable scores the moment candidates submit. Rank, filter, and export — and every score is defensible because everyone took the same test.</p>
              <ul>
                <li><span className="ck">✓</span> Automatic scoring &amp; ranking as submissions arrive</li>
                <li><span className="ck">✓</span> Speed bonuses &amp; per-question weighting</li>
                <li><span className="ck">✓</span> Export results for your hiring panel</li>
              </ul>
            </div>
            <div className="feat-visual">
              <div className="vlabel">Score distribution · 207 submitted</div>
              <div className="chart">
                {CHART.map((h, i) => (
                  <div key={i} className="bar" style={{ height: `${h}%` }} />
                ))}
              </div>
              <div className="chart-x"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="blk" id="how" style={{ background: "var(--surface-2)" }}>
        <div className="wrap">
          <div className="sec-head reveal">
            <p className="eyebrow">How it works</p>
            <h2>Live in three steps</h2>
            <p className="lead">No implementation project. Build an assessment, invite candidates, make the call.</p>
          </div>
          <div className="steps">
            <div className="step reveal"><div className="no">01</div><div className="st">Step 1</div><h3>Build your assessment</h3><p>Add questions — multiple choice, image-based, or rating — set timing, scoring, and the anti-cheat rules for the role.</p></div>
            <div className="step reveal" style={{ transitionDelay: ".08s" }}><div className="no">02</div><div className="st">Step 2</div><h3>Invite your candidates</h3><p>Upload a CSV or Excel list. PreCognise emails each candidate a unique access ID, password, and join link automatically.</p></div>
            <div className="step reveal" style={{ transitionDelay: ".16s" }}><div className="no">03</div><div className="st">Step 3</div><h3>Review &amp; decide</h3><p>Watch the session live, let scoring run itself, then rank and shortlist on results everyone earned the same way.</p></div>
          </div>
        </div>
      </section>

      {/* CAPABILITY */}
      <section className="blk">
        <div className="wrap">
          <div className="capband reveal">
            <p className="eyebrow">Built to be trusted</p>
            <h2>Serious hiring needs serious infrastructure</h2>
            <p className="sub">Every candidate, the same test — proctored, scored objectively, and defensible when it counts.</p>
            <div className="cap-grid">
              <div className="cap"><div className="n" data-count="7">7</div><div className="l">anti-cheat controls per campaign</div></div>
              <div className="cap"><div className="n" data-count="1">1</div><div className="l">identical test for every candidate</div></div>
              <div className="cap"><div className="n" data-count="5000" data-suffix="+">5,000+</div><div className="l">candidates in a single session</div></div>
              <div className="cap"><div className="n" data-count="100" data-suffix="%">100%</div><div className="l">browser-based, no downloads</div></div>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <div className="final-wrap">
        <div className="wrap">
          <section className="final reveal" id="demo">
            <p className="eyebrow">Ready when you are</p>
            <h2>Hire the person who can<br />actually do the job.</h2>
            <p className="lead">See PreCognise Assess on your own roles. We&apos;ll walk you through building a campaign and reading the results.</p>
            <div className="hero-cta">
              <a className="btn btn-primary" href="#demo">Book a demo <Arrow /></a>
              <Link className="btn btn-ghost" href="/admin">Client log in</Link>
            </div>
          </section>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="foot" id="candidate">
        <div className="wrap">
          <div className="foot-grid">
            <div className="foot-brand">
              <a className="brand" href="#top"><Image src="/precognise_logo_new.png" alt="PreCognise" width={150} height={26} /></a>
              <p className="lead">Structured, proctored, skills-based assessment — so hiring decisions are grounded in how people actually think.</p>
            </div>
            <div className="foot-col"><h4>Product</h4><a href="#features">Features</a><a href="#integrity">Integrity</a><a href="#how">How it works</a><a href="#demo">Pricing</a></div>
            <div className="foot-col"><h4>Company</h4><a href="#">About</a><a href="#">Careers</a><a href="#">Contact</a><a href="#">Security</a></div>
            <div className="foot-col"><h4>Legal</h4><a href="#">Privacy</a><a href="#">Terms</a><a href="#">Data processing</a></div>
          </div>
          <div className="foot-cand">
            <div className="txt"><strong>Have an assessment invite?</strong> Your access ID and password were emailed to you.</div>
            <Link className="btn btn-ghost btn-sm" href="/candidate/login">Enter your access ID →</Link>
          </div>
          <div className="foot-bottom">
            <span>&copy; {new Date().getFullYear()} PreCognise. All rights reserved.</span>
            <span style={{ fontFamily: "var(--fm)" }}>Structured · proctored · fair</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
