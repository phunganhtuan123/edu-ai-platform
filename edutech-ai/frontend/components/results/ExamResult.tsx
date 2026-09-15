"use client";

import { useEffect, useMemo, useState } from "react";
import { buildInteractiveHtml, printExam, slugify } from "@/lib/examHtml";
import { downloadFile } from "@/lib/download";
import { ExamContent, ExamSection } from "@/lib/types";
import WarningsBanner from "./WarningsBanner";
import GoogleFormsExport from "@/components/GoogleFormsExport";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/**
 * Đề thi làm được trực tiếp: câu hỏi bên trái, đoạn văn bên phải (dính mép
 * trên khi cuộn), giáo viên chọn đáp án rồi nộp bài để tự kiểm tra chất lượng
 * đề trước khi in cho học sinh.
 */

function questionKey(part: ExamSection, number: number) {
  return `q_${part.part_id}_${number}`;
}

function PartBlock({
  part,
  answers,
  onPick,
  graded,
}: {
  part: ExamSection;
  answers: Record<string, number>;
  onPick: (key: string, index: number) => void;
  graded: boolean;
}) {
  const hasPassage = !!part.passage;
  return (
    <div className="mb-8 last:mb-0">
      {part.part_name && (
        <h4 className="mb-2 border-b border-slate-200 pb-2 font-serif text-base font-bold text-indigo-900">
          {part.part_name}
        </h4>
      )}
      {part.instruction && (
        <p className="mb-4 font-serif text-sm italic text-slate-700">
          {part.instruction}
        </p>
      )}

      <div
        className={`grid gap-6 ${hasPassage ? "lg:grid-cols-2" : "grid-cols-1"}`}
      >
        {/* TRÁI: câu hỏi */}
        <div className="order-2 min-w-0 lg:order-1">
          {part.questions.map((q) => {
            const key = questionKey(part, q.number);
            const picked = answers[key];
            return (
              <div
                key={q.number}
                className="border-b border-slate-200 py-4 last:border-b-0"
              >
                <p className="mb-2 font-serif text-sm font-bold text-indigo-900">
                  Question {q.number}
                  {q.tested_point && (
                    <span className="ml-2 rounded-sm border border-slate-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {q.tested_point}
                    </span>
                  )}
                </p>

                {part.kind === "ordering" && q.prompt ? (
                  <div className="mb-3 space-y-1 rounded-sm border border-slate-200 bg-slate-50 p-3">
                    {q.prompt
                      .split("\n")
                      .filter(Boolean)
                      .map((line, k) => (
                        <p
                          key={k}
                          className="rounded-sm border border-slate-200 bg-white px-3 py-1.5 font-serif text-sm"
                        >
                          {line}
                        </p>
                      ))}
                  </div>
                ) : q.prompt ? (
                  <p className="mb-2 font-serif text-sm text-slate-800">
                    {q.prompt}
                  </p>
                ) : (
                  <p className="mb-2 font-serif text-sm text-slate-600">
                    Chọn đáp án đúng cho chỗ trống ({q.number}).
                  </p>
                )}

                <div className="space-y-1.5">
                  {q.options.map((opt, j) => {
                    const isPicked = picked === j;
                    const isCorrect = q.correct_index === j;
                    let cls =
                      "border-slate-300 bg-white hover:border-indigo-300";
                    if (graded && isCorrect)
                      cls = "border-emerald-400 bg-emerald-50";
                    else if (graded && isPicked)
                      cls = "border-rose-400 bg-rose-50";
                    else if (isPicked) cls = "border-rose-700 bg-rose-50/60";
                    return (
                      <label
                        key={j}
                        className={`flex cursor-pointer items-start gap-2.5 rounded-sm border px-3 py-2 text-sm transition ${cls}`}
                      >
                        <input
                          type="radio"
                          name={key}
                          checked={isPicked}
                          disabled={graded}
                          onChange={() => onPick(key, j)}
                          className="mt-1 h-4 w-4 accent-rose-700"
                        />
                        <span>
                          <span className="font-semibold">
                            {LETTERS[j] || j + 1}.
                          </span>{" "}
                          {opt}
                        </span>
                      </label>
                    );
                  })}
                </div>

                {graded && q.explanation && (
                  <p className="mt-2 rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    {q.explanation}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* PHẢI: đoạn văn, dính mép trên khi cuộn */}
        {hasPassage && (
          <div className="order-1 min-w-0 lg:order-2">
            <div className="lg:sticky lg:top-4">
              <div className="rounded-sm border border-slate-300 bg-white p-4">
                <h5 className="mb-3 border-b border-slate-200 pb-2 font-serif text-xs uppercase tracking-widest text-slate-500">
                  Passage with Blanks
                </h5>
                {part.title && (
                  <p className="mb-2 font-serif font-bold text-slate-900">
                    {part.title}
                  </p>
                )}
                <div className="max-h-[70vh] overflow-y-auto whitespace-pre-wrap rounded-sm border border-slate-200 bg-slate-50 p-4 font-serif text-[15px] leading-relaxed text-slate-800">
                  {part.passage}
                </div>
              </div>
            </div>
          </div>
        )}
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
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [graded, setGraded] = useState(false);

  // Đổi đề thì xoá bài làm cũ, nếu không đáp án của đề trước dính sang đề sau.
  useEffect(() => {
    setAnswers({});
    setGraded(false);
  }, [content]);

  const allQuestions = useMemo(
    () =>
      content.parts.flatMap((p) =>
        p.questions.map((q) => ({ part: p, q, key: questionKey(p, q.number) }))
      ),
    [content]
  );

  const score = allQuestions.filter(
    ({ q, key }) => answers[key] === q.correct_index
  ).length;
  const answered = allQuestions.filter(({ key }) => answers[key] != null).length;
  const total = allQuestions.length;
  const pct = total ? Math.round((score / total) * 100) : 0;

  const fileBase = slugify(title);

  return (
    <div className="space-y-4">
      <WarningsBanner warnings={content.warnings} />

      <div className="card !p-6 sm:!p-8">
        {content.parts.map((part, i) => (
          <PartBlock
            key={`${part.part_id}-${i}`}
            part={part}
            answers={answers}
            graded={graded}
            onPick={(key, index) =>
              setAnswers((cur) => ({ ...cur, [key]: index }))
            }
          />
        ))}
      </div>

      {/* Xuất file */}
      <div className="card !p-5">
        <p className="mb-3 text-sm font-semibold text-slate-800">Xuất đề</p>
        <div className="flex flex-wrap items-start gap-3">
          <button
            className="btn-secondary !py-2 text-xs"
            onClick={() => printExam(content, title)}
          >
            ⬇ Xuất PDF
          </button>
          <button
            className="btn-secondary !py-2 text-xs"
            onClick={() =>
              downloadFile(
                `${fileBase}.html`,
                buildInteractiveHtml(content, title),
                "text/html;charset=utf-8"
              )
            }
          >
            ⬇ Xuất HTML
          </button>
          {artifactId != null && <GoogleFormsExport artifactId={artifactId} />}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          PDF mở hộp thoại in của trình duyệt — chọn "Lưu thành PDF". File HTML
          chạy offline, học sinh mở lên làm và tự chấm được.
        </p>
      </div>

      {/* Nộp bài */}
      <div className="card !p-5">
        {!graded ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">
                Thử làm đề này
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Đã chọn {answered}/{total} câu — nộp để xem đáp án và giải
                thích ngay tại chỗ.
              </p>
            </div>
            <button
              className="btn-primary"
              disabled={total === 0}
              onClick={() => {
                setGraded(true);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              ✅ Nộp bài
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p
                className={`text-lg font-bold ${
                  pct >= 80
                    ? "text-emerald-700"
                    : pct >= 60
                      ? "text-amber-700"
                      : "text-rose-700"
                }`}
              >
                Kết quả: {score}/{total} ({pct}%)
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Đáp án đúng viền xanh, câu chọn sai viền đỏ, giải thích nằm ngay
                dưới mỗi câu.
              </p>
            </div>
            <button
              className="btn-secondary"
              onClick={() => {
                setAnswers({});
                setGraded(false);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              ↺ Làm lại
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
