interface KpiCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  iconBg: string;
  delta?: string;
  deltaUp?: boolean;
}

export default function KpiCard({ label, value, icon, iconBg, delta, deltaUp }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 md:p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-[#64748B]">{label}</span>
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBg}`}>
          {icon}
        </div>
      </div>
      <p className="font-[family-name:var(--font-bricolage)] text-3xl font-extrabold leading-none text-[#0F172A]">
        {value}
      </p>
      {delta && (
        <p className={`mt-1.5 text-[11px] font-medium ${deltaUp ? "text-green-600" : "text-red-500"}`}>
          {deltaUp ? "↑" : "↓"} {delta}
        </p>
      )}
    </div>
  );
}
