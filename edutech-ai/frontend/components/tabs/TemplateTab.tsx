"use client";

import { useState } from "react";
import { useJobFlow } from "@/lib/useJobFlow";
import {
  normalizeExam,
  normalizeTemplateSpec,
  TEMPLATE_KIND_LABELS,
  type Artifact,
  type TemplateKind,
  type TemplateSection,
} from "@/lib/types";
import JobProgress from "@/components/JobProgress";
import ExamResult from "@/components/results/ExamResult";
import WarningsBanner from "@/components/results/WarningsBanner";

const DIFFICULTIES = [
  { key: "easy", label: "Dễ", cefr: "A1 / A2" },
  { key: "medium", label: "Trung bình", cefr: "B1 / B2" },
  { key: "hard", label: "Khó", cefr: "B2+ / C1" },
];

/**
 * Module 5 — Nhân đề theo mẫu.
 *
 * Hai bước tách rời có chủ đích: bước phân tích chạy vài giây, giáo viên DUYỆT
 * bản mô tả cấu trúc, rồi mới chạy bước sinh (vài phút). Nếu model đọc sai
 * khung bài mẫu thì sửa ngay ở đây, không phải chờ hết bước 2 mới biết.
 */
export default function TemplateTab({
  projectId,
  model,
  onArtifactCreated,
}: {
  projectId: string;
  model: string;
  gradeLevel: string;
  onArtifactCreated: (a: Artifact) => void;
}) {
  const [sample, setSample] = useState("");
  const [sections, setSections] = useState<TemplateSection[] | null>(null);
  const [specTitle, setSpecTitle] = useState("");
  const [specWarnings, setSpecWarnings] = useState<string[]>([]);
  const [topic, setTopic] = useState("");
  const [vocabulary, setVocabulary] = useState("");
  const [grammar, setGrammar] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [withTranscript, setWithTranscript] = useState(false);

  const analyze = useJobFlow(projectId);
  const generate = useJobFlow(projectId, onArtifactCreated);

  function onAnalyzeDone(job: any) {
    analyze.handleDone(job).then((art) => {
      if (!art) return;
      const { spec, warnings } = normalizeTemplateSpec(art.content);
      setSections(spec.sections);
      setSpecTitle(spec.title);
      setSpecWarnings(warnings);
    });
  }

  function patchSection(i: number, patch: Partial<TemplateSection>) {
    setSections((cur) =>
      cur ? cur.map((s, j) => (j === i ? { ...s, ...patch } : s)) : cur
    );
  }

  function removeSection(i: number) {
    setSections((cur) => (cur ? cur.filter((_, j) => j !== i) : cur));
  }

  function restart() {
    setSections(null);
    setSpecWarnings([]);
    analyze.reset();
    generate.reset();
  }

  // ----- Kết quả cuối
  if (generate.artifact) {
    return (
      <div className="space-y-4">
        <button className="btn-secondary" onClick={restart}>
          ← Nhân đề khác
        </button>
        <ExamResult
          content={normalizeExam(generate.artifact.content)}
          title={generate.artifact.title || "Đề nhân từ mẫu"}
          artifactId={generate.artifact.id}
        />
      </div>
    );
  }

  if (generate.jobId != null) {
    return (
      <JobProgress
        jobId={generate.jobId}
        onDone={generate.handleDone}
        onReset={generate.reset}
        runningLabel="Đang sinh bộ bài mới…"
      />
    );
  }

  // ----- Bước 2: duyệt cấu trúc rồi sinh
  if (sections) {
    const total = sections.reduce((n, s) => n + (s.count || 0), 0);
    const hasMaterial = !!(topic.trim() || vocabulary.trim() || grammar.trim());
    return (
      <div className="space-y-5">
        <div className="card space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-900">
                Bước 2 — Duyệt cấu trúc bài mẫu
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Đây là cấu trúc AI đọc được từ bài mẫu của bạn. Sửa cho khớp
                trước khi sinh — bước sau sẽ dựng đúng theo khung này.
              </p>
            </div>
            <button className="btn-secondary !py-2 text-xs" onClick={restart}>
              ← Đổi bài mẫu
            </button>
          </div>

          <WarningsBanner warnings={specWarnings} />

          <div>
            <label className="label" htmlFor="tpl-title">
              Tên bài
            </label>
            <input
              id="tpl-title"
              className="input"
              value={specTitle}
              onChange={(e) => setSpecTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <span className="label">Các phần ({total} câu)</span>
            {sections.map((s, i) => (
              <div
                key={i}
                className="grid gap-2 rounded-xl border border-slate-300 p-3 sm:grid-cols-[1fr,170px,90px,auto]"
              >
                <input
                  className="input !py-2 text-sm"
                  value={s.name}
                  onChange={(e) => patchSection(i, { name: e.target.value })}
                />
                <select
                  className="input !py-2 text-sm"
                  value={s.kind}
                  onChange={(e) =>
                    patchSection(i, { kind: e.target.value as TemplateKind })
                  }
                >
                  {Object.entries(TEMPLATE_KIND_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={30}
                  className="input !py-2 text-sm"
                  value={s.count}
                  onChange={(e) =>
                    patchSection(i, { count: Number(e.target.value) || 1 })
                  }
                />
                <button
                  type="button"
                  onClick={() => removeSection(i)}
                  className="rounded-lg px-2 text-sm text-slate-400 hover:text-rose-600"
                  title="Bỏ phần này"
                >
                  ✕
                </button>
                {s.notes && (
                  <p className="text-xs text-slate-500 sm:col-span-4">
                    {s.notes}
                  </p>
                )}
              </div>
            ))}
            {sections.length === 0 && (
              <p className="text-sm text-rose-600">
                Đã bỏ hết các phần — bấm "Đổi bài mẫu" để phân tích lại.
              </p>
            )}
          </div>
        </div>

        <div className="card space-y-4">
          <div>
            <h3 className="font-semibold text-slate-900">
              Nội dung mới cho bộ bài
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Khung giữ nguyên như trên, chỉ nội dung là mới. Cần ít nhất một
              trong ba ô dưới.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="tpl-topic">
              Chủ đề
            </label>
            <input
              id="tpl-topic"
              className="input"
              placeholder="VD: Environment, Sports…"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="tpl-vocab">
                Từ vựng mới
              </label>
              <textarea
                id="tpl-vocab"
                className="input min-h-[80px]"
                placeholder="recycle, landfill, emission…"
                value={vocabulary}
                onChange={(e) => setVocabulary(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="tpl-grammar">
                Cấu trúc ngữ pháp
              </label>
              <textarea
                id="tpl-grammar"
                className="input min-h-[80px]"
                placeholder="present perfect, relative clauses…"
                value={grammar}
                onChange={(e) => setGrammar(e.target.value)}
              />
            </div>
          </div>

          <div>
            <span className="label">Độ khó</span>
            <div className="flex flex-wrap gap-2">
              {DIFFICULTIES.map((d) => (
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
                    name="tpl-difficulty"
                    checked={difficulty === d.key}
                    onChange={() => setDifficulty(d.key)}
                    className="h-4 w-4 accent-indigo-600"
                  />
                  <span>
                    {d.label}{" "}
                    <span className="text-xs text-slate-500">{d.cefr}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-amber-600">
              Mức độ khó do AI diễn giải nên có thể lệch — giáo viên vui lòng
              duyệt lại.
            </p>
          </div>

          <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={withTranscript}
              onChange={(e) => setWithTranscript(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-indigo-600"
            />
            <span>
              Viết đoạn văn dưới dạng lời nói (transcript phần nghe)
              <span className="mt-0.5 block text-[11px] text-slate-500">
                Chỉ ra transcript dạng chữ — chưa có file audio.
              </span>
            </span>
          </label>

          {generate.submitError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {generate.submitError}
            </div>
          )}
          <button
            className="btn-primary"
            disabled={
              generate.submitting ||
              !model ||
              sections.length === 0 ||
              !hasMaterial
            }
            onClick={() =>
              generate.submit("template_generate", model, {
                spec: { title: specTitle, sections },
                topic: topic.trim(),
                vocabulary: vocabulary.trim(),
                grammar: grammar.trim(),
                difficulty,
                with_transcript: withTranscript,
              })
            }
          >
            {generate.submitting ? "Đang gửi…" : "✨ Sinh bộ bài mới"}
          </button>
          {!hasMaterial && (
            <p className="text-xs text-slate-500">
              Nhập chủ đề, từ vựng hoặc ngữ pháp mới thì mới sinh được.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ----- Bước 1: phân tích bài mẫu
  if (analyze.jobId != null) {
    return (
      <JobProgress
        jobId={analyze.jobId}
        onDone={onAnalyzeDone}
        onReset={analyze.reset}
        runningLabel="Đang đọc cấu trúc bài mẫu…"
      />
    );
  }

  return (
    <div className="card space-y-5">
      <div>
        <h3 className="font-semibold text-slate-900">
          Bước 1 — Dán bài tập mẫu
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Dán một bài tập có sẵn (đề cũ, bài trong sách). AI chỉ đọc cấu trúc,
          không giải và không chép lại nội dung.
        </p>
      </div>
      <textarea
        className="input min-h-[220px] font-serif"
        placeholder="Dán nguyên bài tập mẫu vào đây…"
        value={sample}
        onChange={(e) => setSample(e.target.value)}
      />
      <p className="text-xs text-slate-500">
        {sample.trim().length.toLocaleString("vi-VN")} ký tự (tối thiểu 50)
      </p>
      {analyze.submitError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {analyze.submitError}
        </div>
      )}
      <button
        className="btn-primary"
        disabled={analyze.submitting || sample.trim().length < 50 || !model}
        onClick={() =>
          analyze.submit("template_analyze", model, {
            sample_text: sample.trim(),
          })
        }
      >
        {analyze.submitting ? "Đang gửi…" : "🔍 Phân tích cấu trúc"}
      </button>
      {!model && (
        <p className="text-xs text-amber-600">
          Chưa chọn model AI — hãy chọn model ở góc phải phía trên.
        </p>
      )}
    </div>
  );
}
