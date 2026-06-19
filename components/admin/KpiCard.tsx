// components/admin/KpiCard.tsx
interface KpiCardProps {
  label: string;
  value: number;
  color: "blue" | "green" | "red" | "gray" | "gold";
}

const COLOR_MAP: Record<KpiCardProps["color"], string> = {
  blue: "border-blue-500 text-blue-400",
  green: "border-green-500 text-green-400",
  red: "border-red-500 text-red-400",
  gray: "border-gray-500 text-gray-400",
  gold: "border-yellow-500 text-yellow-400",
};

export default function KpiCard({ label, value, color }: KpiCardProps) {
  return (
    <div
      className={`rounded-lg border bg-gray-800/60 p-4 ${COLOR_MAP[color]} border-opacity-50`}
    >
      <p className="text-sm text-gray-400">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${COLOR_MAP[color].split(" ")[1]}`}>
        {value}
      </p>
    </div>
  );
}