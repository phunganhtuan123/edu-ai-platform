"use client";

import { useState } from "react";
import { useJobFlow } from "@/lib/useJobFlow";
import { normalizeQuiz, type Artifact } from "@/lib/types";
import JobProgress from "@/components/JobProgress";
import QuizResult from "@/components/results/QuizResult";

export default function QuizTab({
  projectId,
  model,
  gradeLevel,
  onArtifactCreated,
}: {
  projectId: string;
  model: string;
  gradeLevel: string;
  onArtifactCreated: (a: Artifact) => void;
}) {
  const [text, setText] = useState("");
  const [numQuestions, setNumQuestions] = useState(5);
  const flow = useJobFlow(projectId, onArtifactCreated);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    flow.submit("quiz", model, {
      text: text.trim(),
      num_questions: numQuestions,
      grade_level: gradeLevel,
    });
  }

  if (flow.artifact) {
    return (
      <div className="space-y-4">
        <button className="btn-secondary" onClick={flow.reset}>
          ← Tạo bộ trắc nghiệm khác
        </button>
        <QuizResult
          content={normalizeQuiz(flow.artifact.content)}
          title={flow.artifact.title || "Trắc nghiệm"}
          artifactId={flow.artifact.id}
        />
      </div>
    );
  }

  if (flow.jobId != null) {
    return (
      <JobProgress
        jobId={flow.jobId}
        onDone={flow.handleDone}
        onReset={flow.reset}
        runningLabel="Đang sinh câu hỏi…"
      />
    );
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-5">
      <div>
        <h3 className="font-semibold text-slate-900">
          Sinh trắc nghiệm từ văn bản
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Dán đoạn văn bản tiếng Anh (bài đọc, đoạn hội thoại…), AI sẽ sinh câu
          hỏi trắc nghiệm 4 lựa chọn kèm đáp án và giải thích.
        </p>
      </div>
      <div>
        <label className="label" htmlFor="quiz-text">
          Văn bản tiếng Anh
        </label>
        <textarea
          id="quiz-text"
          required
          rows={10}
          className="input resize-y font-mono text-[13px]"
          placeholder="Paste the English text here…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div className="max-w-xs">
        <label className="label" htmlFor="quiz-num">
          Số câu hỏi (3–20)
        </label>
        <input
          id="quiz-num"
          type="number"
          min={3}
          max={20}
          required
          className="input"
          value={numQuestions}
          onChange={(e) => setNumQuestions(Number(e.target.value))}
        />
      </div>
      {flow.submitError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {flow.submitError}
        </div>
      )}
      <button
        type="submit"
        className="btn-primary"
        disabled={
          flow.submitting ||
          !text.trim() ||
          !model ||
          numQuestions < 3 ||
          numQuestions > 20
        }
      >
        {flow.submitting ? "Đang gửi…" : "✨ Sinh trắc nghiệm"}
      </button>
      {!model && (
        <p className="text-xs text-amber-600">
          Chưa chọn model AI — hãy chọn model ở góc phải phía trên.
        </p>
      )}
    </form>
  );
}
