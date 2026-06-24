"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";

const TOP_NAV = [
  {
    href: "/admin",
    label: "Dashboard",
    exact: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
      </svg>
    ),
  },
  {
    href: "/admin/session",
    label: "Live Session",
    exact: false,
    badge: "live",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>
      </svg>
    ),
  },
  {
    href: "/admin/campaigns",
    label: "Campaigns",
    exact: false,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
      </svg>
    ),
  },
  {
    href: "/admin/questions",
    label: "Questions",
    exact: false,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>
      </svg>
    ),
  },
];

const SETTINGS_NAV = [
  {
    href: "/admin/branding",
    label: "Branding",
    exact: false,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
      </svg>
    ),
  },
  {
    href: "/admin/settings",
    label: "Settings",
    exact: false,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
      </svg>
    ),
  },
];

function NavItem({
  href,
  label,
  icon,
  exact,
  badge,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  exact: boolean;
  badge?: string;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors ${
        active
          ? "bg-[#EEF2FF] font-semibold text-[#2E0BFC]"
          : "text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A]"
      }`}
    >
      <span className={active ? "text-[#2E0BFC]" : "text-[#94A3B8]"}>{icon}</span>
      {label}
      {badge === "live" && (
        <span className="ml-auto flex items-center gap-1 rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-bold text-white">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          Live
        </span>
      )}
    </Link>
  );
}

export default function AdminSidebar() {
  return (
    <aside className="flex h-screen w-[232px] shrink-0 flex-col overflow-hidden border-r border-[#E2E8F0] bg-white">
      {/* Logo */}
      <div className="flex items-center gap-2 border-b border-[#E2E8F0] px-4 py-5">
        <Image src="/precognise_logo_new.png" alt="PreCognise" width={110} height={26} className="h-7 w-auto" />
        <span className="rounded-full border border-[#C7D2FE] bg-[#EEF2FF] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-[#2E0BFC]">
          Assess
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-3">
        <p className="mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#94A3B8]">Main</p>
        {TOP_NAV.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}

        <p className="mb-1.5 mt-4 px-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#94A3B8]">Settings</p>
        {SETTINGS_NAV.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-[#E2E8F0] px-3 py-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
          <UserButton />
          <div>
            <p className="text-[13px] font-semibold text-[#0F172A]">Admin</p>
            <p className="text-[11px] text-[#94A3B8]">Administrator</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
