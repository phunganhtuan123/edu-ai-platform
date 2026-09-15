"use client";

import { downloadFile } from "@/lib/download";

/** Activity result: download self-contained HTML + sandboxed iframe preview. */
export default function ActivityResult({
  html,
  title = "Hoạt động tương tác",
}: {
  html: string;
  title?: string;
}) {
  const filename =
    (title || "hoat-dong")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "hoat-dong";

  if (!html) {
    return (
      <p className="text-sm text-slate-500">
        Không có nội dung HTML trong kết quả.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          File HTML tự chứa, chạy offline — tải về và mở bằng trình duyệt bất
          kỳ.
        </p>
        <button
          className="btn-emerald !py-2 text-xs"
          onClick={() =>
            downloadFile(`${filename}.html`, html, "text/html;charset=utf-8")
          }
        >
          ⬇ Tải file HTML
        </button>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="ml-2 text-xs text-slate-500">
            Xem trước — {title}
          </span>
        </div>
        <iframe
          title="Xem trước hoạt động"
          srcDoc={html}
          sandbox="allow-scripts"
          className="h-[560px] w-full bg-white"
        />
      </div>
    </div>
  );
}
