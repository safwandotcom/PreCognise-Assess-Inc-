"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

// ─── Types ─────────────────────────────────────────────────────────────────

interface CampaignInfo {
  id: string;
  name: string;
  active: boolean;
  expired: boolean;
  full: boolean;
}

interface Branding {
  orgName: string;
  tagline: string;
  logoUrl: string | null;
  primaryColour: string;
}

type PageState =
  | { kind: "loading" }
  | { kind: "unavailable"; reason: string }
  | { kind: "form"; campaign: CampaignInfo; branding: Branding }
  | { kind: "success"; rollNumber: string; password: string; orgName: string; primaryColour: string };

// ─── Sub-components ─────────────────────────────────────────────────────────

function BrandHeader({ branding }: { branding: Branding }) {
  return (
    <div className="mb-8 text-center">
      {branding.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={branding.logoUrl}
          alt={branding.orgName}
          className="mx-auto mb-3 h-10 max-w-[200px] object-contain"
        />
      ) : (
        <h1 className="text-2xl font-bold tracking-tight text-white">{branding.orgName}</h1>
      )}
      <p className="mt-1 text-sm text-gray-400">{branding.tagline}</p>
    </div>
  );
}

function UnavailableCard({ reason }: { reason: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-900 px-4 text-center">
      <div className="w-full max-w-sm rounded-xl border border-gray-700 bg-gray-800 px-6 py-10">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-700">
          <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <p className="font-semibold text-white">Registration unavailable</p>
        <p className="mt-2 text-sm text-gray-400">{reason}</p>
        <p className="mt-4 text-xs text-gray-500">Contact your assessment organiser for assistance.</p>
      </div>
    </main>
  );
}

function CredentialsCard({
  rollNumber,
  password,
  orgName,
  primaryColour,
}: {
  rollNumber: string;
  password: string;
  orgName: string;
  primaryColour: string;
}) {
  const [copiedRoll, setCopiedRoll] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);

  function copy(text: string, setFn: (v: boolean) => void) {
    navigator.clipboard.writeText(text);
    setFn(true);
    setTimeout(() => setFn(false), 2000);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
            style={{ backgroundColor: primaryColour + "25" }}
          >
            <svg className="h-7 w-7" style={{ color: primaryColour }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white">You&apos;re registered!</h2>
          <p className="mt-1 text-sm text-gray-400">
            Save these credentials — you&apos;ll need them to log in to the assessment.
          </p>
        </div>

        <div className="rounded-xl border border-gray-700 bg-gray-800 p-5 space-y-4">
          {/* Roll number */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-gray-400">Roll Number</p>
            <div className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5">
              <span className="font-mono font-semibold text-white">{rollNumber}</span>
              <button
                type="button"
                onClick={() => copy(rollNumber, setCopiedRoll)}
                className="ml-3 text-xs text-gray-400 hover:text-white"
              >
                {copiedRoll ? "✓ Copied" : "Copy"}
              </button>
            </div>
          </div>

          {/* Password */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-gray-400">Temporary Password</p>
            <div className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5">
              <span className="font-mono font-semibold tracking-widest text-white">{password}</span>
              <button
                type="button"
                onClick={() => copy(password, setCopiedPass)}
                className="ml-3 text-xs text-gray-400 hover:text-white"
              >
                {copiedPass ? "✓ Copied" : "Copy"}
              </button>
            </div>
          </div>

          <p className="rounded-lg border border-amber-700/40 bg-amber-900/20 px-3 py-2 text-xs text-amber-400">
            This password is shown only once. Screenshot or copy it now.
          </p>
        </div>

        <Link
          href="/candidate/login"
          className="mt-5 flex w-full items-center justify-center rounded-lg py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: primaryColour }}
        >
          Continue to login →
        </Link>

        <p className="mt-4 text-center text-xs text-gray-500">
          Assessment powered by {orgName}
        </p>
      </div>
    </main>
  );
}

// ─── Registration form ──────────────────────────────────────────────────────

function RegistrationForm({
  campaign,
  branding,
  slug,
  onSuccess,
}: {
  campaign: CampaignInfo;
  branding: Branding;
  slug: string;
  onSuccess: (rollNumber: string, password: string) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const col = branding.primaryColour;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/apply/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, country }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Registration failed. Please try again.");
        return;
      }
      onSuccess(data.rollNumber, data.password);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-900 px-4">
      <div className="w-full max-w-sm">
        <BrandHeader branding={branding} />

        <div className="rounded-xl border border-gray-700 bg-gray-800 px-6 py-6">
          <h2 className="mb-1 text-base font-semibold text-white">{campaign.name}</h2>
          <p className="mb-5 text-sm text-gray-400">Register to receive your login credentials.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-gray-300">Full name <span className="text-red-400">*</span></label>
              <input
                required
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Smith"
                autoComplete="name"
                className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:ring-2"
                style={{ "--tw-ring-color": col } as React.CSSProperties}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-gray-300">Email address <span className="text-red-400">*</span></label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:ring-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-gray-300">Country <span className="text-xs text-gray-500">(optional)</span></label>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="e.g. Canada"
                className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:ring-2"
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 w-full rounded-md py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: col }}
            >
              {submitting ? "Registering…" : "Register"}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-gray-600">
          Already registered?{" "}
          <Link href="/candidate/login" className="text-gray-400 hover:text-white">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function ApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [state, setState] = useState<PageState>({ kind: "loading" });

  useEffect(() => {
    fetch(`/api/apply/${slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.campaign) {
          setState({ kind: "unavailable", reason: "This registration link is invalid." });
          return;
        }
        const { active, expired, full } = data.campaign;
        if (!active) {
          setState({ kind: "unavailable", reason: "This campaign is no longer accepting registrations." });
        } else if (expired) {
          setState({ kind: "unavailable", reason: "This campaign has expired." });
        } else if (full) {
          setState({ kind: "unavailable", reason: "Registration is closed — maximum capacity has been reached." });
        } else {
          setState({ kind: "form", campaign: data.campaign, branding: data.branding });
        }
      })
      .catch(() => setState({ kind: "unavailable", reason: "Unable to load the registration page. Please try again." }));
  }, [slug]);

  if (state.kind === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-900">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
      </main>
    );
  }

  if (state.kind === "unavailable") {
    return <UnavailableCard reason={state.reason} />;
  }

  if (state.kind === "success") {
    return (
      <CredentialsCard
        rollNumber={state.rollNumber}
        password={state.password}
        orgName={state.orgName}
        primaryColour={state.primaryColour}
      />
    );
  }

  return (
    <RegistrationForm
      campaign={state.campaign}
      branding={state.branding}
      slug={slug}
      onSuccess={(rollNumber, password) =>
        setState({
          kind: "success",
          rollNumber,
          password,
          orgName: state.branding.orgName,
          primaryColour: state.branding.primaryColour,
        })
      }
    />
  );
}
