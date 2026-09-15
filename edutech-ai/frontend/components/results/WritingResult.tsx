"use client";

import { downloadFile, writingToMarkdown } from "@/lib/download";
import { WritingContent } from "@/lib/types";

/** Writing grading result: big score, criteria table, error list, feedback. */
export default function WritingResult({ content }: { content: WritingContent }) {
  const pct =
    content.max_score > 0 ? content.overall_score / content.max_score : 0;
  const scoreColor =
    pct >= 0.65
      ? "text-emerald-600"
      : pct >= 0.4
        ? "text-amber-600"
        : "text-rose-600";

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          className="btn-secondary !py-2 text-xs"
          onClick={() =>
            downloadFile(
              "cham-bai-viet.md",
              writingToMarkdown(content),
              "text/markdown;charset=utf-8"
            )
          }
        >
          ⬇ Tải Markdown
        </button>
      </div>

      <div className="card flex flex-col items-center py-8 text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Điểm tổng
        </p>
        <p className={`mt-1 text-5xl font-extrabold ${scoreColor}`}>
          {content.overall_score}
          <span className="text-2xl font-semibold text-slate-400">
            /{content.max_score}
          </span>
        </p>
      </div>

      {content.criteria.length > 0 && (
        <div className="card overflow-hidden !p-0">
          <h4 className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm font-bold text-slate-700">
            Chấm theo tiêu chí
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <tbody>
                {content.criteria.map((c, i) => (
                  <tr
                    key={i}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="w-48 px-5 py-3.5 align-top font-semibold text-slate-800">
                      {c.name}
                    </td>
                    <td className="w-24 px-3 py-3.5 align-top">
                      <span className="inline-flex items-center rounded-lg bg-indigo-50 px-2.5 py-1 text-sm font-bold text-indigo-700">
                        {c.score}/{c.max_score}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 align-top text-slate-600">
                      {c.comment}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {content.errors.length > 0 && (
        <div className="card !p-5">
          <h4 className="mb-3 text-sm font-bold text-slate-700">
            Lỗi cụ thể ({content.errors.length})
          </h4>
          <ul className="space-y-3">
            {content.errors.map((e, i) => (
              <li key={i} className="rounded-xl bg-slate-50 p-4">
                <p className="text-sm">
                  <span className="rounded bg-rose-100 px-1.5 py-0.5 font-medium text-rose-700 line-through decoration-rose-400">
                    {e.quote}
                  </span>
                  <span className="mx-2 text-slate-400">→</span>
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700">
                    {e.fix}
                  </span>
                </p>
                {e.explanation && (
                  <p className="mt-2 text-sm text-slate-600">{e.explanation}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {content.overall_feedback && (
        <div className="card border-indigo-100 bg-indigo-50/50 !p-5">
          <h4 className="mb-2 text-sm font-bold text-indigo-800">
            Nhận xét chung
          </h4>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {content.overall_feedback}
          </p>
        </div>
      )}
    </div>
  );
}
