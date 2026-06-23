interface KpiCardProps {
  label: string;
  value: number;
  color: "blue" | "green" | "red" | "gray" | "gold";
}

const COLOR_MAP: Record<KpiCardProps["color"], { bar: string; value: string }> = {
  blue:  { bar: "bg-blue-500",    value: "text-blue-600" },
  green: { bar: "bg-emerald-500", value: "text-emerald-600" },
  red:   { bar: "bg-red-500",     value: "text-red-600" },
  gray:  { bar: "bg-slate-400",   value: "text-slate-600" },
  gold:  { bar: "bg-amber-500",   value: "text-amber-600" },
};

export default function KpiCard({ label, value, color }: KpiCardProps) {
  const { bar, value: valueCls } = COLOR_MAP[color];
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <div className={`mb-3 h-1 w-8 rounded-full ${bar}`} />
      <p className="text-xs font-medium text-[#64748B] uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${valueCls}`}>
        {value}
      </p>
    </div>
  );
}
