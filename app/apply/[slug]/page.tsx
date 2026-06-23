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

// ─── Shared input style ─────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none transition focus:border-[#2E0BFC] focus:bg-white focus:ring-1 focus:ring-[#2E0BFC]";

// ─── Sub-components ─────────────────────────────────────────────────────────

function BrandHeader({ branding }: { branding: Branding }) {
  return (
    <div className="mb-6 overflow-hidden rounded-2xl text-center"
      style={{ background: `linear-gradient(135deg, ${branding.primaryColour} 0%, #6366F1 100%)` }}
    >
      <div className="px-6 py-7">
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={branding.logoUrl}
            alt={branding.orgName}
            className="mx-auto mb-2 h-8 max-w-[180px] object-contain"
          />
        ) : (
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
            <span className="text-lg font-bold text-white">
              {branding.orgName.charAt(0)}
            </span>
          </div>
        )}
        <h1 className="text-lg font-bold text-white">{branding.orgName}</h1>
        <p className="mt-0.5 text-sm text-white/70">{branding.tagline}</p>
      </div>
    </div>
  );
}

function UnavailableCard({ reason }: { reason: string }) {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 border border-amber-100">
          <svg className="h-6 w-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h2 className="font-semibold text-[#0F172A]">Registration unavailable</h2>
        <p className="mt-2 text-sm text-[#64748B]">{reason}</p>
        <p className="mt-3 text-xs text-[#94A3B8]">Contact your assessment organiser for assistance.</p>
      </div>
    </div>
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
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-5 text-center">
          <div
            className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: `linear-gradient(135deg, ${primaryColour} 0%, #6366F1 100%)` }}
          >
            <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-[#0F172A]">You&apos;re registered!</h2>
          <p className="mt-1 text-sm text-[#64748B]">
            Save these credentials — you&apos;ll need them to log in.
          </p>
        </div>

        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 space-y-4">
          {/* Roll number */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-[#64748B]">Roll Number</p>
            <div className="flex items-center justify-between rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5">
              <span className="font-mono font-semibold text-[#0F172A]">{rollNumber}</span>
              <button
                type="button"
                onClick={() => copy(rollNumber, setCopiedRoll)}
                className="ml-3 text-xs font-medium text-[#2E0BFC] hover:opacity-80"
              >
                {copiedRoll ? "✓ Copied" : "Copy"}
              </button>
            </div>
          </div>

          {/* Password */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-[#64748B]">Temporary Password</p>
            <div className="flex items-center justify-between rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5">
              <span className="font-mono font-semibold tracking-widest text-[#0F172A]">{password}</span>
              <button
                type="button"
                onClick={() => copy(password, setCopiedPass)}
                className="ml-3 text-xs font-medium text-[#2E0BFC] hover:opacity-80"
              >
                {copiedPass ? "✓ Copied" : "Copy"}
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-700">
              This password is shown only once. Copy or screenshot it now.
            </p>
          </div>
        </div>

        <Link
          href="/candidate/login"
          className="mt-4 flex w-full items-center justify-center rounded-xl py-3 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ background: `linear-gradient(115deg, ${primaryColour} 0%, #6366F1 100%)` }}
        >
          Continue to login →
        </Link>

        <p className="mt-4 text-center text-xs text-[#94A3B8]">
          Assessment powered by {orgName}
        </p>
      </div>
    </div>
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
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <BrandHeader branding={branding} />

        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6">
          <h2 className="mb-0.5 text-base font-semibold text-[#0F172A]">{campaign.name}</h2>
          <p className="mb-5 text-sm text-[#64748B]">Register to receive your login credentials.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-[#0F172A]">
                Full name <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Smith"
                autoComplete="name"
                className={inputCls}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[#0F172A]">
                Email address <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className={inputCls}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[#0F172A]">
                Country <span className="text-xs text-[#94A3B8]">(optional)</span>
              </label>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="e.g. Canada"
                className={inputCls}
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 w-full rounded-xl py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: `linear-gradient(115deg, ${branding.primaryColour} 0%, #6366F1 100%)` }}
            >
              {submitting ? "Registering…" : "Register →"}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-[#94A3B8]">
          Already registered?{" "}
          <Link href="/candidate/login" className="text-[#2E0BFC] hover:underline underline-offset-2">
            Log in
          </Link>
        </p>
      </div>
    </div>
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
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC]">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#2E0BFC] border-t-transparent" />
      </div>
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
