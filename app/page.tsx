// app/page.tsx
import Link from "next/link";
import Image from "next/image";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#FAFAF8] text-[#1A1B23]">
      {/* Header */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Image
          src="/precognise_logo_new.png"
          alt="PreCognise"
          width={160}
          height={36}
          priority
          className="h-9 w-auto"
        />
        <nav className="flex items-center gap-6 text-sm">
          <a href="#how-it-works" className="text-[#6B6A63] hover:text-[#1A1B23]">
            How it works
          </a>
          <Link
            href="/admin"
            className="text-[#6B6A63] hover:text-[#1A1B23]"
          >
            Admin
          </Link>
          <Link
            href="/candidate/login"
            className="rounded-lg bg-[#3730A3] px-4 py-2 font-medium text-white hover:bg-[#2D2785]"
          >
            Candidate login
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-12 md:pt-20">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <p className="mb-4 text-sm font-medium uppercase tracking-wide text-[#B45309]">
              Hiring assessments, timed and proctored
            </p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
              See how candidates actually think,{" "}
              <span className="font-serif italic font-normal text-[#3730A3]">
                not just what they answer
              </span>
            </h1>
            <p className="mt-6 max-w-md text-lg text-[#6B6A63]">
              PreCognise runs live, anti-cheat assessments with real-time
              scoring — reasoning, judgment, and speed, measured the moment
              a candidate responds.
            </p>
            <div className="mt-8 flex items-center gap-4">
              <Link
                href="/candidate/login"
                className="rounded-lg bg-[#3730A3] px-6 py-3 font-medium text-white hover:bg-[#2D2785]"
              >
                Start an assessment
              </Link>
              <a
                href="#how-it-works"
                className="text-sm font-medium text-[#1A1B23] underline underline-offset-4"
              >
                See how scoring works
              </a>
            </div>
          </div>

          {/* Signature element: scoring ring, echoes TimerRing / result ring
              already used inside the product, so marketing and product
              visually rhyme instead of feeling like two different apps. */}
          <div className="flex justify-center">
            <ScoringRingHero />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-t border-[#E8E6DF] bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">
            How it works
          </h2>
          <div className="mt-10 grid gap-10 md:grid-cols-3">
            <Step
              number="01"
              title="Candidate logs in"
              copy="Roll number, email, and a one-time code — no account setup required."
            />
            <Step
              number="02"
              title="Live, timed questions"
              copy="Reasoning, judgment, and rating questions, each scored the instant they're answered — speed counts."
            />
            <Step
              number="03"
              title="Proctored automatically"
              copy="Tab switches and refreshes are detected in real time, so the result reflects the candidate alone."
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto max-w-6xl px-6 py-10 text-sm text-[#6B6A63]">
        <div className="flex items-center justify-between border-t border-[#E8E6DF] pt-6">
          <span>© {new Date().getFullYear()} PreCognise</span>
          <Link href="/candidate/login" className="hover:text-[#1A1B23]">
            Candidate login
          </Link>
        </div>
      </footer>
    </main>
  );
}

function Step({
  number,
  title,
  copy,
}: {
  number: string;
  title: string;
  copy: string;
}) {
  return (
    <div>
      <p className="font-serif text-3xl text-[#3730A3]/30">{number}</p>
      <h3 className="mt-2 font-medium">{title}</h3>
      <p className="mt-1 text-sm text-[#6B6A63]">{copy}</p>
    </div>
  );
}

// A static SVG echo of the candidate-facing TimerRing/result ring —
// not wired to real data here, purely a visual signature for the hero.
function ScoringRingHero() {
  const radius = 88;
  const circumference = 2 * Math.PI * radius;
  const progress = 0.72;

  return (
    <div className="relative flex h-64 w-64 items-center justify-center">
      <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke="#E8E6DF"
          strokeWidth="10"
        />
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke="#3730A3"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-serif text-5xl text-[#1A1B23]">872</span>
        <span className="mt-1 text-xs uppercase tracking-wide text-[#6B6A63]">
          sample score
        </span>
      </div>
    </div>
  );
}