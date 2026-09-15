"use client";

import { useMemo, useState } from "react";
import { useJobFlow } from "@/lib/useJobFlow";
import { activityHtml, normalizeQuiz, type Artifact } from "@/lib/types";
import JobProgress from "@/components/JobProgress";
import ActivityResult from "@/components/results/ActivityResult";

export default function ActivityTab({
  projectId,
  model,
  gradeLevel,
  artifacts,
  onArtifactCreated,
}: {
  projectId: string;
  model: string;
  gradeLevel: string;
  artifacts: Artifact[];
  onArtifactCreated: (a: Artifact) => void;
}) {
  const quizArtifacts = useMemo(
    () => artifacts.filter((a) => a.type === "quiz"),
    [artifacts]
  );

  const [source, setSource] = useState<"artifact" | "json">("artifact");
  const [sourceArtifactId, setSourceArtifactId] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [title, setTitle] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const flow = useJobFlow(projectId, onArtifactCreated);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    let questions: unknown[] = [];
    let srcId: string | undefined;

    if (source === "artifact") {
      const art = quizArtifacts.find(
        (a) => String(a.id) === sourceArtifactId
      );
      if (!art) {
        setFormError("Hãy chọn một bộ trắc nghiệm nguồn.");
        return;
      }
      srcId = String(art.id);
      questions = normalizeQuiz(art.content).questions;
    } else {
      try {
        const parsed = JSON.parse(jsonText);
        questions = normalizeQuiz(parsed).questions;
      } catch {
        setFormError("JSON không hợp lệ. Hãy dán đúng nội dung JSON đã xuất từ tab Trắc nghiệm.");
        return;
      }
    }

    if (!questions.length) {
      setFormError("Không tìm thấy câu hỏi nào trong nguồn đã chọn.");
      return;
    }

    flow.submit("activity", model, {
      title: title.trim(),
      grade_level: gradeLevel,
      source_artifact_id: srcId,
      questions,
    });
  }

  if (flow.artifact) {
    return (
      <div className="space-y-4">
        <button className="btn-secondary" onClick={flow.reset}>
          ← Tạo hoạt động khác
        </button>
        <ActivityResult
          html={activityHtml(flow.artifact.content)}
          title={flow.artifact.title || title || "Hoạt động tương tác"}
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
        runningLabel="Đang tạo hoạt động…"
      />
    );
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-5">
      <div>
        <h3 className="font-semibold text-slate-900">
          Tạo hoạt động tương tác
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Biến bộ câu hỏi trắc nghiệm thành quiz game HTML tự chứa, chạy
          offline, có tính điểm — chiếu lên màn hình hoặc gửi cho học sinh.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="activity-title">
          Tiêu đề hoạt động
        </label>
        <input
          id="activity-title"
          type="text"
          required
          className="input"
          placeholder="VD: Ôn tập Unit 3 — Vocabulary game"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div>
        <span className="label">Nguồn câu hỏi</span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSource("artifact")}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              source === "artifact"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
            }`}
          >
            Từ trắc nghiệm đã sinh
          </button>
          <button
            type="button"
            onClick={() => setSource("json")}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              source === "json"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
            }`}
          >
            Dán JSON
          </button>
        </div>
      </div>

      {source === "artifact" ? (
        quizArtifacts.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Project này chưa có bộ trắc nghiệm nào. Hãy sinh trắc nghiệm ở tab
            &quot;Trắc nghiệm&quot; trước, hoặc chọn &quot;Dán JSON&quot;.
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="activity-source">
              Bộ trắc nghiệm nguồn
            </label>
            <select
              id="activity-source"
              className="input"
              value={sourceArtifactId}
              onChange={(e) => setSourceArtifactId(e.target.value)}
            >
              <option value="">— Chọn bộ trắc nghiệm —</option>
              {quizArtifacts.map((a) => (
                <option key={String(a.id)} value={String(a.id)}>
                  {a.title || `Trắc nghiệm #${a.id}`} (
                  {normalizeQuiz(a.content).questions.length} câu)
                </option>
              ))}
            </select>
          </div>
        )
      ) : (
        <div>
          <label className="label" htmlFor="activity-json">
            JSON câu hỏi
          </label>
          <textarea
            id="activity-json"
            rows={8}
            className="input resize-y font-mono text-[12px]"
            placeholder='{"questions": [{"question": "...", "options": ["...","...","...","..."], "correct_index": 0}]}'
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
          />
        </div>
      )}

      {(formError || flow.submitError) && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {formError || flow.submitError}
        </div>
      )}

      <button
        type="submit"
        className="btn-primary"
        disabled={flow.submitting || !title.trim() || !model}
      >
        {flow.submitting ? "Đang gửi…" : "🎮 Tạo hoạt động"}
      </button>
      {!model && (
        <p className="text-xs text-amber-600">
          Chưa chọn model AI — hãy chọn model ở góc phải phía trên.
        </p>
      )}
    </form>
  );
}
