"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/api";
import { useJobFlow } from "@/lib/useJobFlow";
import { normalizeExam, type Artifact, type ExamMeta } from "@/lib/types";
import JobProgress from "@/components/JobProgress";
import ExamResult from "@/components/results/ExamResult";

// KHÔNG hardcode danh sách phần thi ở đây. Bảng phần thi là của backend
// (GET /api/meta/exam-parts, spec mục 2a) — hai app của EdTech Corner đánh số
// phần lệch nhau chính vì mỗi nơi giữ một bảng riêng.

export default function ExamTab({
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
  const [meta, setMeta] = useState<ExamMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState("medium");
  const [sourceMode, setSourceMode] = useState("keep");
  const [sourceText, setSourceText] = useState("");
  const [topic, setTopic] = useState("");
  const [startNumber, setStartNumber] = useState(1);
  const flow = useJobFlow(projectId, onArtifactCreated);

  useEffect(() => {
    let cancelled = false;
    apiGet("/meta/exam-parts")
      .then((data: any) => {
        if (cancelled) return;
        setMeta(data as ExamMeta);
        const first = (data?.exam_parts || []).find((p: any) => p.enabled);
        if (first) setSelected([first.id]);
        const defDiff = (data?.difficulties || [])[1] || (data?.difficulties || [])[0];
        if (defDiff) setDifficulty(defDiff.key);
      })
      .catch((e: any) => {
        if (!cancelled) setMetaError(e?.message || "Không tải được bảng phần thi.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const parts = meta?.exam_parts ?? [];
  const limits = meta?.source_limits ?? { min_chars: 50, max_chars: 20000 };
  const charCount = sourceText.trim().length;

  // Chọn phần theo đúng thứ tự trong bảng, không theo thứ tự bấm — số câu
  // trong đề phải chạy theo trật tự phần thi.
  const orderedSelection = useMemo(
    () => parts.filter((p) => selected.includes(p.id)).map((p) => p.id),
    [parts, selected]
  );
  const selectedParts = parts.filter((p) => orderedSelection.includes(p.id));
  const totalQuestions = selectedParts.reduce((n, p) => n + p.default_count, 0);
  const unconfirmed = selectedParts.filter((p) => !p.count_confirmed);

  const sourceTooShort = charCount > 0 && charCount < limits.min_chars;
  const sourceTooLong = charCount > limits.max_chars;
  const needsTopic = charCount === 0 && !topic.trim();
  const canSubmit =
    !!model &&
    orderedSelection.length > 0 &&
    !sourceTooShort &&
    !sourceTooLong &&
    !needsTopic;

  function togglePart(id: string) {
    setSelected((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    flow.submit("exam", model, {
      parts: orderedSelection,
      topic: topic.trim(),
      source_text: sourceText.trim(),
      source_mode: sourceMode,
      difficulty,
      start_number: startNumber,
      grade_level: gradeLevel,
    });
  }

  if (flow.artifact) {
    return (
      <div className="space-y-4">
        <button className="btn-secondary" onClick={flow.reset}>
          ← Tạo đề khác
        </button>
        <ExamResult
          content={normalizeExam(flow.artifact.content)}
          title={flow.artifact.title || "Đề thi"}
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
        runningLabel="Đang sinh đề thi…"
      />
    );
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-5">
      <div>
        <h3 className="font-semibold text-slate-900">Sinh đề đúng format thi</h3>
        <p className="mt-1 text-sm text-slate-500">
          Format đề do hệ thống quyết định, AI chỉ điền nội dung. Chọn nhiều
          phần thì số câu chạy liên tục từ phần này sang phần kia.
        </p>
      </div>

      {metaError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {metaError}
        </div>
      )}
      {!meta && !metaError && (
        <p className="text-sm text-slate-500">Đang tải bảng phần thi…</p>
      )}

      {parts.length > 0 && (
        <div>
          <span className="label">Phần thi (chọn một hoặc nhiều)</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {parts.map((p) => {
              const checked = selected.includes(p.id);
              return (
                <label
                  key={p.id}
                  className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                    !p.enabled
                      ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                      : checked
                        ? "cursor-pointer border-indigo-500 bg-indigo-50 font-medium text-indigo-800"
                        : "cursor-pointer border-slate-300 bg-white text-slate-700 hover:border-indigo-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={!p.enabled}
                    checked={checked}
                    onChange={() => togglePart(p.id)}
                    className="mt-0.5 h-4 w-4 accent-indigo-600"
                  />
                  <span className="flex-1">
                    <span className="block">{p.name_vi}</span>
                    <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                      {p.cefr} · {p.default_count} câu
                      {!p.count_confirmed && " (số câu tạm)"}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          {selectedParts.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              Đã chọn {selectedParts.length} phần · khoảng {totalQuestions} câu ·
              câu {startNumber}–{startNumber + totalQuestions - 1}
            </p>
          )}
          {unconfirmed.length > 0 && (
            <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
              Số câu của {unconfirmed.map((p) => p.name_vi).join(", ")} chưa đối
              chiếu đề minh hoạ Bộ GD&amp;ĐT 2/2025 — kiểm tra lại trước khi dùng
              cho học sinh.
            </div>
          )}
          {selectedParts.length >= 4 && (
            <p className="mt-2 text-xs text-slate-500">
              Chọn nhiều phần thì chạy lâu: mỗi phần là một lượt gọi model, có
              thể vài phút một phần.
            </p>
          )}
        </div>
      )}

      {meta && (
        <div>
          <span className="label">Độ khó</span>
          <div className="flex flex-wrap gap-2">
            {meta.difficulties.map((d) => (
              <label
                key={d.key}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition ${
                  difficulty === d.key
                    ? "border-indigo-500 bg-indigo-50 font-medium text-indigo-800"
                    : "border-slate-300 bg-white text-slate-700 hover:border-indigo-300"
                }`}
              >
                <input
                  type="radio"
                  name="exam-difficulty"
                  value={d.key}
                  checked={difficulty === d.key}
                  onChange={() => setDifficulty(d.key)}
                  className="h-4 w-4 accent-indigo-600"
                />
                <span>
                  {d.name_vi}{" "}
                  <span className="text-xs text-slate-500">{d.cefr}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-amber-600">
            {meta.difficulty_notice}
          </p>
        </div>
      )}

      <div>
        <label className="label" htmlFor="exam-source">
          Văn bản nguồn{" "}
          <span className="font-normal text-slate-400">
            (không bắt buộc — bỏ trống thì AI tự viết theo chủ đề)
          </span>
        </label>
        <textarea
          id="exam-source"
          className="input min-h-[140px] font-serif"
          placeholder="Dán đoạn tiếng Anh vào đây…"
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
        />
        <div className="mt-1 flex justify-between text-xs">
          <span
            className={
              sourceTooShort || sourceTooLong
                ? "font-medium text-rose-600"
                : "text-slate-500"
            }
          >
            {charCount.toLocaleString("vi-VN")} ký tự
            {sourceTooShort && ` — tối thiểu ${limits.min_chars}`}
            {sourceTooLong && ` — tối đa ${limits.max_chars.toLocaleString("vi-VN")}, cần cắt bớt`}
          </span>
          <span className="text-slate-400">
            {limits.min_chars}–{limits.max_chars.toLocaleString("vi-VN")} ký tự
          </span>
        </div>
      </div>

      {meta && charCount > 0 && (
        <div>
          <span className="label">Cách dùng văn bản</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {meta.source_modes.map((m) => (
              <label
                key={m.key}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                  sourceMode === m.key
                    ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                    : "border-slate-300 bg-white text-slate-700 hover:border-indigo-300"
                }`}
              >
                <input
                  type="radio"
                  name="exam-source-mode"
                  value={m.key}
                  checked={sourceMode === m.key}
                  onChange={() => setSourceMode(m.key)}
                  className="mt-0.5 h-4 w-4 accent-indigo-600"
                />
                <span className="flex-1">
                  <span className="block font-medium">{m.name_vi}</span>
                  <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                    {m.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-[1fr,160px]">
        <div>
          <label className="label" htmlFor="exam-topic">
            Chủ đề{" "}
            {charCount === 0 && (
              <span className="font-normal text-rose-500">(bắt buộc)</span>
            )}
          </label>
          <input
            id="exam-topic"
            type="text"
            className="input"
            placeholder="VD: School clubs, Environment day…"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="exam-start">
            Bắt đầu từ câu số
          </label>
          <input
            id="exam-start"
            type="number"
            min={1}
            max={99}
            required
            className="input"
            value={startNumber}
            onChange={(e) => setStartNumber(Number(e.target.value) || 1)}
          />
        </div>
      </div>

      {flow.submitError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {flow.submitError}
        </div>
      )}
      <button
        type="submit"
        className="btn-primary"
        disabled={flow.submitting || !canSubmit}
      >
        {flow.submitting ? "Đang gửi…" : "✨ Sinh đề thi"}
      </button>
      {!model && (
        <p className="text-xs text-amber-600">
          Chưa chọn model AI — hãy chọn model ở góc phải phía trên.
        </p>
      )}
    </form>
  );
}
