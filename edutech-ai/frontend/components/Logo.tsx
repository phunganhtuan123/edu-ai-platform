export default function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`flex items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-emerald-500 font-bold text-white ${
          size === "lg" ? "h-11 w-11 text-lg" : "h-9 w-9 text-base"
        }`}
      >
        E
      </span>
      <span
        className={`font-bold tracking-tight text-slate-900 ${
          size === "lg" ? "text-2xl" : "text-lg"
        }`}
      >
        EduTech <span className="text-indigo-600">AI</span>
      </span>
    </span>
  );
}
