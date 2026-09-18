"use client";

import { useMemo, useState } from "react";
import { downloadFile } from "@/lib/download";
import { slugify } from "@/lib/examHtml";
import {
  activitiesTotal,
  buildLessonPlanHtml,
  lessonMetaLine,
  normalizeLessonPlan,
  printHtml,
} from "@/lib/lessonPlan";
import Badge from "@/components/Badge";
import LessonPlanPresenter from "@/components/lessonplan/LessonPlanPresenter";
import WarningsBanner from "./WarningsBanner";

function Section({ title, items, empty = "Chưa có nội dung." }: { title: string; items: string[]; empty?: string }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h4 className="text-sm font-bold uppercase tracking-wide text-slate-500">{title}</h4>
      {items.length ? (
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700">
          {items.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-400">{empty}</p>
      )}
    </section>
  );
}

function ActionList({ items }: { items: string[] }) {
  if (!items.length) return <p className="text-sm text-slate-400">—</p>;
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-700">
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

/** Giáo án: xem trên trang, in, tải HTML tự chứa và trình chiếu từng hoạt động. */
export default function LessonPlanResult({ content, title }: { content: any; title?: string }) {
  const lp = useMemo(() => normalizeLessonPlan(content), [content]);
  const [presenting, setPresenting] = useState(false);
  const displayTitle = lp.title || title || lp.topic || "Giáo án";
  const learner = lp.grade_level === "mamnon" ? "trẻ" : "học sinh";
  const total = activitiesTotal(lp);
  // Kiểm tra bằng code: tổng thời lượng các hoạt động phải khớp thời lượng tiết.
  const durationMismatch = lp.duration_minutes > 0 && total > 0 && total !== lp.duration_minutes;

  const html = () => buildLessonPlanHtml(lp, displayTitle);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xl font-bold text-slate-900">{displayTitle}</h3>
          <p className="mt-1 text-sm text-slate-500">{lessonMetaLine(lp)}</p>
          {lp.activities.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge color="indigo">{lp.activities.length} hoạt động</Badge>
              {total > 0 && <Badge color={durationMismatch ? "amber" : "emerald"}>Tổng {total} phút</Badge>}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary !py-2 text-xs"
            onClick={() => setPresenting(true)}
            disabled={lp.activities.length === 0 && lp.objectives.length === 0}
          >
            🖥 Trình chiếu
          </button>
          <button type="button" className="btn-secondary !py-2 text-xs" onClick={() => printHtml(html())}>
            🖨 In
          </button>
          <button
            type="button"
            className="btn-emerald !py-2 text-xs"
            onClick={() =>
              downloadFile(`${slugify(displayTitle, "giao-an")}.html`, html(), "text/html;charset=utf-8")
            }
          >
            ⬇ Tải HTML
          </button>
        </div>
      </div>

      <WarningsBanner warnings={lp.warnings} />
      {durationMismatch && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Tổng thời lượng các hoạt động ({total} phút) khác thời lượng tiết ({lp.duration_minutes} phút) — thầy cô
          điều chỉnh lại khi dạy.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Mục tiêu" items={lp.objectives} />
        <Section title="Chuẩn bị" items={lp.materials} />
      </div>

      <section>
        <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Tiến trình hoạt động</h4>
        {lp.activities.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 py-8 text-center text-sm text-slate-400">
            Kết quả chưa có hoạt động nào.
          </p>
        ) : (
          <ol className="space-y-3">
            {lp.activities.map((a, i) => (
              <li key={i} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3">
                  <p className="font-semibold text-slate-900">
                    <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    {a.title}
                  </p>
                  {a.duration_minutes > 0 && (
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-500">
                      {a.duration_minutes} phút
                    </span>
                  )}
                </div>
                <div className="grid gap-4 p-5 md:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-indigo-700">Giáo viên</p>
                    <ActionList items={a.teacher_actions} />
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-emerald-700">
                      {learner === "trẻ" ? "Trẻ" : "Học sinh"}
                    </p>
                    <ActionList items={a.student_actions} />
                  </div>
                </div>
                {a.resources.length > 0 && (
                  <p className="border-t border-slate-100 px-5 py-2.5 text-xs text-slate-600">
                    <span className="font-semibold text-slate-700">Học liệu: </span>
                    {a.resources.join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Đánh giá" items={lp.assessment} />
        <Section title="Phân hoá / hỗ trợ" items={lp.differentiation} />
      </div>

      <p className="text-xs text-amber-600">
        Giáo án do AI gợi ý — thầy cô rà soát, điều chỉnh cho phù hợp lớp và {learner} trước khi dùng.
      </p>

      {presenting && (
        <LessonPlanPresenter lp={lp} title={displayTitle} onClose={() => setPresenting(false)} />
      )}
    </div>
  );
}
