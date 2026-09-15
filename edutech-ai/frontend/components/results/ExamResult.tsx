"use client";

import { downloadFile, examToMarkdown } from "@/lib/download";
import { ExamContent, ExamSection } from "@/lib/types";
import WarningsBanner from "./WarningsBanner";
import GoogleFormsExport from "@/components/GoogleFormsExport";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/**
 * Bố cục đề: từng phần thi nối tiếp nhau, số câu chạy liên tục, đáp án gom ở
 * cuối cho giáo viên. Ba dạng bài hiển thị khác nhau:
 *  - cloze    : đoạn văn có chỗ trống, lựa chọn xếp ngang một dòng
 *  - reading  : đoạn văn + câu hỏi có đề, lựa chọn xuống dòng
 *  - ordering : các câu a/b/c/d rời + lựa chọn là thứ tự sắp xếp
 */
function SectionBlock({ part }: { part: ExamSection }) {
  return (
    <div className="mb-8 last:mb-0">
      {part.part_name && (
        <h4 className="mb-2 text-sm font-bold uppercase tracking-wide text-indigo-700">
          {part.part_name}
        </h4>
      )}
      {part.instruction && (
        <p className="mb-4 text-sm font-medium italic text-slate-700">
          {part.instruction}
        </p>
      )}
      {part.title && (
        <h5 className="mb-2 text-center text-base font-bold uppercase tracking-wide text-slate-900">
          {part.title}
        </h5>
      )}
      {part.passage && (
        <div className="mb-6 whitespace-pre-wrap rounded-xl border-2 border-slate-300 bg-slate-50 p-5 font-serif text-[15px] leading-relaxed text-slate-800">
          {part.passage}
        </div>
      )}

      <div className={part.kind === "cloze" ? "space-y-3" : "space-y-5"}>
        {part.questions.map((q) => (
          <div key={q.number} className="text-sm leading-relaxed text-slate-800">
            {q.prompt ? (
              <>
                <p className="whitespace-pre-wrap">
                  <span className="font-bold">Question {q.number}:</span>{" "}
                  {q.prompt}
                </p>
                <div className="mt-1.5 grid gap-1 sm:grid-cols-2">
                  {q.options.map((opt, j) => (
                    <p key={j}>
                      <span className="font-semibold">
                        {LETTERS[j] || j + 1}.
                      </span>{" "}
                      {opt}
                    </p>
                  ))}
                </div>
              </>
            ) : (
              <p>
                <span className="font-bold">Question {q.number}:</span>{" "}
                {q.options.map((opt, j) => (
                  <span key={j} className="mr-4 whitespace-nowrap">
                    <span className="font-semibold">
                      {LETTERS[j] || j + 1}.
                    </span>{" "}
                    {opt}
                  </span>
                ))}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ExamResult({
  content,
  title = "Đề thi",
  artifactId,
}: {
  content: ExamContent;
  title?: string;
  /** Có id thì hiện nút xuất Google Forms (spec mục 2b). */
  artifactId?: number | string;
}) {
  const allQuestions = content.parts.flatMap((p) => p.questions);

  return (
    <div className="space-y-4">
      <WarningsBanner warnings={content.warnings} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {content.parts.length > 1
            ? `${content.parts.length} phần, ${allQuestions.length} câu — số câu chạy liên tục.`
            : "Bố cục đề theo đúng format thi."}{" "}
          Phần đáp án dành cho giáo viên ở cuối.
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
        {artifactId != null && <GoogleFormsExport artifactId={artifactId} />}
      </div>

      <div className="card !p-6 sm:!p-8">
        {content.parts.map((part, i) => (
          <SectionBlock key={`${part.part_id}-${i}`} part={part} />
        ))}

        <div className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <h4 className="text-sm font-bold uppercase tracking-wide text-emerald-800">
            Đáp án (dành cho giáo viên)
          </h4>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
            {allQuestions.map((q) => (
              <p key={q.number} className="text-sm text-emerald-900">
                <span className="font-semibold">Question {q.number}:</span>{" "}
                {LETTERS[q.correct_index] || "?"}
              </p>
            ))}
          </div>
          {allQuestions.some((q) => q.explanation) && (
            <ul className="mt-4 space-y-1.5 border-t border-emerald-200 pt-3 text-sm text-emerald-800">
              {allQuestions
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
