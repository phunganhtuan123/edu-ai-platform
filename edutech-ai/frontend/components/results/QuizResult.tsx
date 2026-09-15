"use client";

import { useEffect, useState } from "react";
import { downloadFile, quizToMarkdown } from "@/lib/download";
import { QuizContent, QuizQuestion, bloomLabel } from "@/lib/types";
import Badge from "@/components/Badge";
import WarningsBanner from "./WarningsBanner";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/**
 * Editable quiz result: teacher can edit question text and options,
 * correct answer highlighted, explanation + bloom chips, export MD/JSON.
 */
export default function QuizResult({
  content,
  title = "Trắc nghiệm",
}: {
  content: QuizContent;
  title?: string;
}) {
  const [questions, setQuestions] = useState<QuizQuestion[]>(content.questions);

  useEffect(() => {
    setQuestions(content.questions);
  }, [content]);

  function updateQuestion(i: number, patch: Partial<QuizQuestion>) {
    setQuestions((prev) =>
      prev.map((q, idx) => (idx === i ? { ...q, ...patch } : q))
    );
  }

  function updateOption(i: number, j: number, value: string) {
    setQuestions((prev) =>
      prev.map((q, idx) =>
        idx === i
          ? { ...q, options: q.options.map((o, oj) => (oj === j ? value : o)) }
          : q
      )
    );
  }

  const edited: QuizContent = { questions, warnings: content.warnings };

  return (
    <div className="space-y-4">
      <WarningsBanner warnings={content.warnings} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {questions.length} câu hỏi — bạn có thể sửa trực tiếp nội dung bên
          dưới trước khi tải về.
        </p>
        <div className="flex gap-2">
          <button
            className="btn-secondary !py-2 text-xs"
            onClick={() =>
              downloadFile(
                "trac-nghiem.md",
                quizToMarkdown(edited, title),
                "text/markdown;charset=utf-8"
              )
            }
          >
            ⬇ Tải Markdown
          </button>
          <button
            className="btn-secondary !py-2 text-xs"
            onClick={() =>
              downloadFile(
                "trac-nghiem.json",
                JSON.stringify({ questions }, null, 2),
                "application/json;charset=utf-8"
              )
            }
          >
            ⬇ Tải JSON
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {questions.map((q, i) => (
          <div key={i} className="card !p-5">
            <div className="flex items-start gap-3">
              <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-3">
                <textarea
                  className="input min-h-[44px] resize-y font-medium"
                  rows={2}
                  value={q.question}
                  onChange={(e) =>
                    updateQuestion(i, { question: e.target.value })
                  }
                />
                <div className="space-y-2">
                  {q.options.map((opt, j) => {
                    const isCorrect = j === q.correct_index;
                    return (
                      <div
                        key={j}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 ${
                          isCorrect
                            ? "border-emerald-300 bg-emerald-50"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <button
                          type="button"
                          title="Đặt làm đáp án đúng"
                          onClick={() => updateQuestion(i, { correct_index: j })}
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                            isCorrect
                              ? "bg-emerald-600 text-white"
                              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                          }`}
                        >
                          {LETTERS[j] || j + 1}
                        </button>
                        <input
                          className="w-full border-0 bg-transparent p-1 text-sm outline-none"
                          value={opt}
                          onChange={(e) => updateOption(i, j, e.target.value)}
                        />
                        {isCorrect && (
                          <span className="shrink-0 text-xs font-semibold text-emerald-600">
                            Đáp án
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {(q.explanation || q.bloom_level) && (
                  <div className="flex flex-wrap items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
                    {q.bloom_level && (
                      <Badge color="indigo">{bloomLabel(q.bloom_level)}</Badge>
                    )}
                    {q.explanation && (
                      <p className="min-w-0 flex-1 text-sm text-slate-600">
                        <span className="font-medium text-slate-700">
                          Giải thích:
                        </span>{" "}
                        {q.explanation}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
