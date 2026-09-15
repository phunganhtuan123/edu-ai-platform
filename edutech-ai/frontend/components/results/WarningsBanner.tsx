export default function WarningsBanner({ warnings }: { warnings: string[] }) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-sm font-semibold text-amber-800">
        ⚠️ Cảnh báo từ bộ kiểm tra tự động — vui lòng rà soát trước khi dùng:
      </p>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-amber-700">
        {warnings.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </div>
  );
}
