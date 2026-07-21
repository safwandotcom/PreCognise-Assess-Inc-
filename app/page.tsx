import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">

      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-[#E2E8F0] bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Image src="/precognise_logo_new.png" alt="PreCognise" width={140} height={32} priority />
            <span className="hidden border-l border-[#E2E8F0] pl-3 text-[11px] font-bold uppercase tracking-[0.06em] text-[#64748B] sm:block">
              Assess
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="text-sm font-medium text-[#64748B] transition hover:text-[#0F172A]"
            >
              Admin
            </Link>
            <Link
              href="/candidate/login"
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: "linear-gradient(115deg, #2E0BFC 0%, #4D32F5 45%, #6366F1 100%)" }}
            >
              Log in
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section
        className="px-6 py-24 text-center"
        style={{ background: "linear-gradient(115deg, #2E0BFC 0%, #4D32F5 45%, #6366F1 100%)" }}
      >
        <div className="mx-auto mb-7 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-white/90">
          <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
          you&apos;re up. go secure the bag.
        </div>
        <h1 className="mx-auto max-w-3xl text-5xl font-extrabold leading-[1.15] tracking-tight text-white md:text-6xl">
          show &apos;em what you&apos;re <span className="text-white/60">actually</span> made of.
        </h1>
        <p className="mx-auto mt-5 max-w-lg text-lg leading-relaxed text-white/72">
          no cap — PreCognise gives every candidate the exact same shot. structured, scientific, and lowkey stress-free. no tricks. just your best work hitting different.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/candidate/login"
            className="flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-[15px] font-bold text-[#2E0BFC] shadow-lg transition hover:-translate-y-px hover:shadow-xl"
          >
            start my assessment
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </Link>
          <a
            href="#how-it-works"
            className="rounded-xl border border-white/30 bg-white/12 px-6 py-3.5 text-[15px] font-medium text-white transition hover:bg-white/20"
          >
            how does this work
          </a>
        </div>
      </section>

      {/* Trust bar */}
      <section className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-14 px-6 py-14 md:grid-cols-2">
          {/* Quote side */}
          <div>
            <div className="mb-6 flex items-center gap-2.5">
              <Image src="/precognise_logo_new.png" alt="PreCognise" width={120} height={28} />
              <span className="h-5 w-px bg-[#E2E8F0]" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">Assessment Platform</span>
            </div>
            <p className="mb-1 font-[family-name:var(--font-bricolage)] text-7xl font-extrabold leading-[0.7] text-[#EEF2FF]">&ldquo;</p>
            <p className="font-[family-name:var(--font-bricolage)] text-[clamp(18px,2.2vw,23px)] font-semibold leading-snug text-[#0F172A]">
              The fairest interview question is the one every candidate answers under exactly the same conditions. That&apos;s not radical — it&apos;s just right.
            </p>
            <p className="mt-4 text-sm italic text-[#64748B]">— The philosophy behind PreCognise Assess</p>
          </div>
          {/* Stats side */}
          <div className="flex flex-col divide-y divide-[#E2E8F0] border-l border-[#E2E8F0] pl-14">
            {[
              { num: "12", label: "minutes, on average", sub: "Focused and efficient. Zero filler. No cap." },
              { num: "0",  label: "downloads required",  sub: "Runs in your browser. Any device. That's it." },
              { num: "1",  label: "standard for everyone", sub: "Same test. Same time. Same scoring. Always." },
            ].map(({ num, label, sub }) => (
              <div key={label} className="flex items-baseline gap-4 py-5">
                <span className="font-[family-name:var(--font-bricolage)] text-4xl font-extrabold text-[#2E0BFC]">{num}</span>
                <div>
                  <p className="text-sm font-semibold text-[#0F172A]">{label}</p>
                  <p className="text-xs text-[#64748B]">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why it matters */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[#2E0BFC]">Why it matters</p>
          <h2 className="mb-4 text-4xl font-extrabold tracking-tight">bad hiring is a W<br/>for nobody.</h2>
          <p className="max-w-lg text-[17px] leading-relaxed text-[#64748B]">
            Vibes-based interviews favour confidence over competence. Structured assessment actually levels the playing field.
          </p>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              {
                title: "data > gut feelings",
                body: "Gut feel has a place — but it shouldn't run the whole show. Structured scores give hiring managers a second opinion that doesn't play favourites.",
                icon: <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>,
              },
              {
                title: "same shot for everyone",
                body: "When everyone answers the same questions under the same conditions, the most capable person wins — not the most polished interviewee.",
                icon: <><path d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"/></>,
              },
              {
                title: "stop wasting time at scale",
                body: "Reviewing hundreds of CVs by hand? That's an L. A timed assessment tells you in minutes who's actually ready to move forward.",
                icon: <path d="M13 10V3L4 14h7v7l9-11h-7z"/>,
              },
            ].map(({ title, body, icon }) => (
              <div key={title} className="rounded-2xl border border-[#E2E8F0] bg-white p-7 transition hover:shadow-[0_8px_32px_rgba(46,11,252,0.06)]">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#2E0BFC]">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
                </div>
                <h3 className="mb-2 text-[17px] font-bold">{title}</h3>
                <p className="text-sm leading-relaxed text-[#64748B]">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-y border-[#E2E8F0] bg-white px-6 py-20">
        <div className="mx-auto max-w-6xl text-center">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[#2E0BFC]">The process</p>
          <h2 className="mb-3 text-4xl font-extrabold tracking-tight">three steps.<br/>no drama.</h2>
          <p className="mx-auto max-w-md text-[17px] leading-relaxed text-[#64748B]">Genuinely this simple. No downloads, no confusion, no stress.</p>
          <div className="mt-14 grid gap-10 md:grid-cols-3">
            {[
              { n: "1", title: "drop your details", body: "Enter your name and email on the registration link your employer sent. Your login credentials hit your inbox immediately." },
              { n: "2", title: "chill in the waiting room", body: "Log in and wait. Your session drops at the exact same time for every candidate — fair from the very first second." },
              { n: "3", title: "answer and submit", body: "Answer every question in the time given. Submit when you're done. Your employer's team takes it from there." },
            ].map(({ n, title, body }) => (
              <div key={n} className="flex flex-col items-start gap-4 text-left">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-full text-xl font-extrabold text-white shadow-[0_4px_16px_rgba(46,11,252,0.25)]"
                  style={{ background: "linear-gradient(115deg, #2E0BFC 0%, #4D32F5 45%, #6366F1 100%)" }}
                >
                  {n}
                </div>
                <div>
                  <h3 className="mb-1.5 text-[17px] font-bold">{title}</h3>
                  <p className="text-sm leading-relaxed text-[#64748B]">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What to expect */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[#2E0BFC]">For candidates</p>
          <h2 className="mb-3 text-4xl font-extrabold tracking-tight">what&apos;s actually gonna happen<br/>(no surprises, fr)</h2>
          <p className="mb-12 max-w-lg text-[17px] leading-relaxed text-[#64748B]">We&apos;re not here to catch you out. Here&apos;s exactly what the day looks like.</p>
          <div className="grid gap-12 md:grid-cols-2">
            <ul className="flex flex-col gap-6">
              {[
                { title: "browser-based, zero downloads", body: "Runs in any modern browser. No app, no special hardware, no faff. Just you, your thinking, and a tab." },
                { title: "questions that test how you actually think", body: "Expect aptitude, situational, and role-specific questions built to reveal your real problem-solving — not memorised answers." },
                { title: "auto-submits when time's up", body: "Clock hits zero? Your answers are saved and submitted automatically. Nothing gets lost, no technical excuses." },
                { title: "integrity monitoring — same rules, no exceptions", body: "Stay on the exam tab the whole time. Switching tabs gets flagged. No cap — the same rule applies to literally everyone." },
              ].map(({ title, body }) => (
                <li key={title} className="flex gap-4">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[#2E0BFC]">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7"/></svg>
                  </div>
                  <div>
                    <h4 className="mb-1 text-[15px] font-semibold">{title}</h4>
                    <p className="text-sm leading-relaxed text-[#64748B]">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div
              className="rounded-2xl p-9 text-white"
              style={{ background: "linear-gradient(115deg, #2E0BFC 0%, #4D32F5 45%, #6366F1 100%)" }}
            >
              <h3 className="mb-3 text-xl font-bold">before you go in 👊</h3>
              <p className="mb-6 text-[15px] leading-relaxed text-white/75">Lock these in before the session opens and you&apos;re already ahead.</p>
              <div className="flex flex-col gap-3">
                {[
                  { title: "find a quiet spot", body: "Kill the distractions before the session clock starts." },
                  { title: "laptop or desktop hits different", body: "Mobile works, but a bigger screen keeps things comfortable." },
                  { title: "have your credentials ready", body: "Copy your roll number and password before the session opens." },
                  { title: "stay on this tab, fr", body: "Once you start, do not switch tabs or apps. You will get flagged." },
                ].map(({ title, body }) => (
                  <div key={title} className="rounded-xl bg-white/12 px-4 py-3.5">
                    <p className="text-sm font-semibold text-white/90">{title}</p>
                    <p className="text-xs text-white/60">{body}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex gap-7 border-t border-white/15 pt-5">
                <div><p className="font-[family-name:var(--font-bricolage)] text-3xl font-extrabold">12</p><p className="text-xs text-white/60">min avg</p></div>
                <div><p className="font-[family-name:var(--font-bricolage)] text-3xl font-extrabold">100%</p><p className="text-xs text-white/60">browser-based</p></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About PreCognise */}
      <section className="border-y border-[rgba(46,11,252,0.1)] bg-[#EEF2FF] px-6 py-20">
        <div className="mx-auto grid max-w-6xl gap-20 md:grid-cols-2">
          <div className="flex flex-col gap-5">
            <Image src="/precognise_logo_new.png" alt="PreCognise" width={140} height={32} />
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[rgba(46,11,252,0.15)] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#2E0BFC]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              Professional credentialing platform
            </span>
            <p className="text-sm leading-[1.7] text-[#64748B]">PreCognise helps employers hire with confidence and gives every candidate a fair shot at the roles they deserve.</p>
          </div>
          <div>
            <h2 className="mb-4 text-3xl font-extrabold tracking-tight">Built on the belief that hiring can actually be better.</h2>
            <p className="mb-3.5 text-[15px] leading-[1.7] text-[#64748B]">PreCognise started with a simple observation: most hiring decisions are made with incomplete information. Interviews favour the articulate. CVs favour the well-connected. Neither actually predicts on-the-job performance.</p>
            <p className="text-[15px] leading-[1.7] text-[#64748B]">PreCognise Assess brings structured, scientific assessment to every hiring process — so decisions are grounded in how people genuinely think, not how well they perform under the spotlight of a conversation.</p>
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section
        className="px-6 py-24 text-center"
        style={{ background: "linear-gradient(115deg, #2E0BFC 0%, #4D32F5 45%, #6366F1 100%)" }}
      >
        <h2 className="mx-auto mb-3.5 max-w-xl text-4xl font-extrabold tracking-tight text-white md:text-5xl">
          your moment is literally right now.
        </h2>
        <p className="mb-9 text-[17px] text-white/72">Your employer is waiting. Log in and show them what you&apos;ve actually got.</p>
        <Link
          href="/candidate/login"
          className="inline-flex items-center gap-2 rounded-xl bg-white px-9 py-4 text-base font-bold text-[#2E0BFC] shadow-xl transition hover:-translate-y-0.5 hover:shadow-2xl"
        >
          let&apos;s go
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </Link>
      </section>

      {/* Footer */}
      <footer className="bg-[#0F172A] px-6 py-9">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2.5">
            <Image src="/precognise_logo_new.png" alt="PreCognise" width={110} height={26} className="brightness-0 invert opacity-60" />
            <span className="text-sm font-semibold text-white/55">PreCognise Assess</span>
          </div>
          <span className="text-xs text-white/30">&copy; {new Date().getFullYear()} PreCognise. All rights reserved.</span>
        </div>
      </footer>

    </div>
  );
}