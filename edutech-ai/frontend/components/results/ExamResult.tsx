"use client";

import { downloadFile, examToMarkdown } from "@/lib/download";
import { ExamContent } from "@/lib/types";
import WarningsBanner from "./WarningsBanner";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/** Exam layout: instruction, boxed passage with blanks, inline questions, answer key. */
export default function ExamResult({
  content,
  title = "Đề thi",
}: {
  content: ExamContent;
  title?: string;
}) {
  return (
    <div className="space-y-4">
      <WarningsBanner warnings={content.warnings} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Bố cục đề theo đúng format thi — phần đáp án dành cho giáo viên ở
          cuối.
        </p>
        <button
          className="btn-secondary !py-2 text-xs"
          onClick={() =>
            downloadFile(
              "de-thi.md",
              examToMarkdown(content, title),
              "text/markdown;charset=utf-8"
            )
          }
        >
          ⬇ Tải Markdown
        </button>
      </div>

      <div className="card !p-6 sm:!p-8">
        {content.title && (
          <h3 className="mb-3 text-center text-base font-bold uppercase tracking-wide text-slate-900">
            {content.title}
          </h3>
        )}
        {content.instruction && (
          <p className="mb-4 text-sm font-medium italic text-slate-700">
            {content.instruction}
          </p>
        )}
        {content.passage && (
          <div className="mb-6 whitespace-pre-wrap rounded-xl border-2 border-slate-300 bg-slate-50 p-5 font-serif text-[15px] leading-relaxed text-slate-800">
            {content.passage}
          </div>
        )}
        <div className="space-y-3">
          {content.questions.map((q) => (
            <p key={q.number} className="text-sm leading-relaxed text-slate-800">
              <span className="font-bold">Question {q.number}:</span>{" "}
              {q.options.map((opt, j) => (
                <span key={j} className="mr-4 whitespace-nowrap">
                  <span className="font-semibold">{LETTERS[j] || j + 1}.</span>{" "}
                  {opt}
                </span>
              ))}
            </p>
          ))}
        </div>

        <div className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <h4 className="text-sm font-bold uppercase tracking-wide text-emerald-800">
            Đáp án (dành cho giáo viên)
          </h4>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
            {content.questions.map((q) => (
              <p key={q.number} className="text-sm text-emerald-900">
                <span className="font-semibold">Question {q.number}:</span>{" "}
                {LETTERS[q.correct_index] || "?"}
              </p>
            ))}
          </div>
          {content.questions.some((q) => q.explanation) && (
            <ul className="mt-4 space-y-1.5 border-t border-emerald-200 pt-3 text-sm text-emerald-800">
              {content.questions
                .filter((q) => q.explanation)
                .map((q) => (
                  <li key={q.number}>
                    <span className="font-semibold">Q{q.number}:</span>{" "}
                    {q.explanation}
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
