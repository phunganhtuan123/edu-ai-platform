"use client";

import { useState } from "react";
import { useJobFlow } from "@/lib/useJobFlow";
import { normalizeExam, type Artifact } from "@/lib/types";
import JobProgress from "@/components/JobProgress";
import ExamResult from "@/components/results/ExamResult";

const FORMATS: { code: string; label: string; enabled: boolean }[] = [
  { code: "notice", label: "Điền từ vào thông báo", enabled: true },
  { code: "leaflet", label: "Điền từ vào tờ rơi", enabled: true },
  { code: "arrange", label: "Sắp xếp đoạn", enabled: false },
  { code: "reading", label: "Đọc hiểu", enabled: false },
];

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
  const [format, setFormat] = useState("notice");
  const [topic, setTopic] = useState("");
  const [startNumber, setStartNumber] = useState(1);
  const flow = useJobFlow(projectId, onArtifactCreated);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    flow.submit("exam", model, {
      section: format,
      topic: topic.trim(),
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
        <h3 className="font-semibold text-slate-900">
          Sinh đề đúng format thi
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Format đề do hệ thống quyết định, AI chỉ điền nội dung — đúng chuẩn
          cấu trúc đề thi.
        </p>
      </div>
      <div>
        <span className="label">Dạng bài</span>
        <div className="grid gap-2 sm:grid-cols-2">
          {FORMATS.map((f) => (
            <label
              key={f.code}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                !f.enabled
                  ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                  : format === f.code
                    ? "cursor-pointer border-indigo-500 bg-indigo-50 font-medium text-indigo-800"
                    : "cursor-pointer border-slate-300 bg-white text-slate-700 hover:border-indigo-300"
              }`}
            >
              <input
                type="radio"
                name="exam-format"
                value={f.code}
                disabled={!f.enabled}
                checked={format === f.code}
                onChange={() => setFormat(f.code)}
                className="h-4 w-4 accent-indigo-600"
              />
              <span className="flex-1">{f.label}</span>
              {!f.enabled && (
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                  Sắp có
                </span>
              )}
            </label>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr,160px]">
        <div>
          <label className="label" htmlFor="exam-topic">
            Chủ đề
          </label>
          <input
            id="exam-topic"
            type="text"
            required
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
        disabled={flow.submitting || !topic.trim() || !model}
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
