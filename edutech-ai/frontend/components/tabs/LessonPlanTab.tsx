"use client";

import { useState } from "react";
import { useJobFlow } from "@/lib/useJobFlow";
import type { Artifact } from "@/lib/types";
import {
  DURATION_MAX,
  DURATION_MIN,
  GRADE_LABELS,
  MAMNON_AGE_GROUPS,
  SUBJECT_LABELS,
  classOptions,
  defaultDuration,
  durationPresets,
} from "@/lib/lessonPlan";
import JobProgress from "@/components/JobProgress";
import LessonPlanResult from "@/components/results/LessonPlanResult";

// Gợi ý tên bài theo cấp — chỉ để bấm nhanh, không giới hạn nội dung.
const TOPIC_HINTS: Record<string, { placeholder: string; suggestions: string[] }> = {
  mamnon: {
    placeholder: "VD: Bé tìm hiểu về các con vật nuôi trong gia đình",
    suggestions: ["Gia đình của bé", "Con vật nuôi trong nhà", "Các loại quả", "Phương tiện giao thông"],
  },
  tieuhoc: {
    placeholder: "VD: Phép cộng trong phạm vi 10",
    suggestions: [],
  },
  thcs: {
    placeholder: "VD: Unit 3 — Community service (Lesson 1: Getting started)",
    suggestions: [],
  },
  thpt: {
    placeholder: "VD: Unit 5 — Inventions (Reading)",
    suggestions: [],
  },
};

export default function LessonPlanTab({
  projectId,
  model,
  gradeLevel,
  subject,
  onArtifactCreated,
}: {
  projectId: string;
  model: string;
  gradeLevel: string;
  subject: string;
  onArtifactCreated: (a: Artifact) => void;
}) {
  const isMamnon = gradeLevel === "mamnon";
  const classes = classOptions(gradeLevel);
  const hints = TOPIC_HINTS[gradeLevel] || TOPIC_HINTS.thcs;

  const [topic, setTopic] = useState("");
  const [ageGroup, setAgeGroup] = useState("mg_nho");
  const [className, setClassName] = useState(classes[0] || "");
  const [duration, setDuration] = useState(() => defaultDuration(gradeLevel, "mg_nho"));
  const [objectives, setObjectives] = useState("");
  const [materials, setMaterials] = useState("");
  const [notes, setNotes] = useState("");
  const flow = useJobFlow(projectId, onArtifactCreated);

  const ageInfo = MAMNON_AGE_GROUPS.find((a) => a.key === ageGroup);
  const durationValid = duration >= DURATION_MIN && duration <= DURATION_MAX;

  function chooseAgeGroup(key: string) {
    setAgeGroup(key);
    setDuration(defaultDuration("mamnon", key));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!durationValid) return;
    const input: Record<string, unknown> = {
      topic: topic.trim(),
      duration_minutes: duration,
    };
    // Mầm non theo nhóm tuổi; phổ thông theo lớp. Cấp học/môn backend lấy từ dự án.
    if (isMamnon) input.age_group = ageGroup;
    else if (className) input.class_name = className;
    if (objectives.trim()) input.objectives = objectives.trim();
    if (materials.trim()) input.materials = materials.trim();
    if (notes.trim()) input.notes = notes.trim();
    flow.submit("lesson_plan", model, input);
  }

  if (flow.artifact) {
    return (
      <div className="space-y-4">
        <button className="btn-secondary" onClick={flow.reset}>
          ← Soạn giáo án khác
        </button>
        <LessonPlanResult content={flow.artifact.content} title={flow.artifact.title} />
      </div>
    );
  }

  if (flow.jobId != null) {
    return (
      <JobProgress
        jobId={flow.jobId}
        onDone={flow.handleDone}
        onReset={flow.reset}
        runningLabel="Đang soạn giáo án…"
      />
    );
  }

  const subjectName = SUBJECT_LABELS[subject] || subject;
  const gradeName = GRADE_LABELS[gradeLevel] || gradeLevel;

  return (
    <form onSubmit={onSubmit} className="card space-y-5">
      <div>
        <h3 className="font-semibold text-slate-900">Giáo án điện tử</h3>
        <p className="mt-1 text-sm text-slate-500">
          AI soạn khung kế hoạch bài dạy cho{" "}
          <span className="font-medium text-slate-700">
            {subjectName} · {gradeName}
          </span>
          : mục tiêu, chuẩn bị, tiến trình hoạt động của giáo viên và{" "}
          {isMamnon ? "trẻ" : "học sinh"}, đánh giá, phân hoá. Kết quả xem, in, tải
          HTML hoặc trình chiếu trên lớp.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="lp-topic">
          {isMamnon ? "Tên hoạt động / đề tài" : "Tên bài học"}
        </label>
        <input
          id="lp-topic"
          required
          maxLength={200}
          className="input"
          placeholder={hints.placeholder}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
        {hints.suggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {hints.suggestions.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTopic(t)}
                className={`rounded-full border px-2.5 py-1 text-xs transition ${
                  topic === t
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr,200px]">
        {isMamnon ? (
          <div>
            <label className="label" htmlFor="lp-age">
              Nhóm / lớp
            </label>
            <select
              id="lp-age"
              className="input"
              value={ageGroup}
              onChange={(e) => chooseAgeGroup(e.target.value)}
            >
              {MAMNON_AGE_GROUPS.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.name_vi}
                </option>
              ))}
            </select>
            {ageInfo && (
              <p className="mt-1 text-xs text-slate-500">
                Thời lượng một hoạt động học thường {ageInfo.range} ở độ tuổi này.
              </p>
            )}
          </div>
        ) : classes.length > 0 ? (
          <div>
            <label className="label" htmlFor="lp-class">
              Lớp
            </label>
            <select
              id="lp-class"
              className="input"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
            >
              {classes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div />
        )}
        <div>
          <label className="label" htmlFor="lp-duration">
            Thời lượng (phút)
          </label>
          <input
            id="lp-duration"
            type="number"
            min={DURATION_MIN}
            max={DURATION_MAX}
            required
            className="input"
            value={duration || ""}
            onChange={(e) => setDuration(Math.round(Number(e.target.value)) || 0)}
          />
          <div className="mt-1.5 flex flex-wrap gap-1">
            {durationPresets(gradeLevel).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setDuration(m)}
                className={`rounded-md px-2 py-0.5 text-xs font-medium transition ${
                  duration === m
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {m}′
              </button>
            ))}
          </div>
          {!durationValid && (
            <p className="mt-1 text-xs text-rose-600">
              Từ {DURATION_MIN} đến {DURATION_MAX} phút.
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="lp-objectives">
            Mục tiêu mong muốn{" "}
            <span className="font-normal text-slate-400">(không bắt buộc)</span>
          </label>
          <textarea
            id="lp-objectives"
            rows={4}
            maxLength={1500}
            className="input resize-y"
            placeholder={
              isMamnon
                ? "Mỗi dòng một mục tiêu.\nVD: Trẻ gọi đúng tên 3–4 con vật nuôi"
                : "Mỗi dòng một mục tiêu.\nVD: Học sinh sử dụng được từ vựng về hoạt động cộng đồng"
            }
            value={objectives}
            onChange={(e) => setObjectives(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="lp-materials">
            Đồ dùng / học liệu sẵn có{" "}
            <span className="font-normal text-slate-400">(không bắt buộc)</span>
          </label>
          <textarea
            id="lp-materials"
            rows={4}
            maxLength={1500}
            className="input resize-y"
            placeholder={"Mỗi dòng một thứ.\nVD: Tranh ảnh, máy chiếu, phiếu học tập"}
            value={materials}
            onChange={(e) => setMaterials(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="lp-notes">
          Ghi chú cho AI{" "}
          <span className="font-normal text-slate-400">(không bắt buộc)</span>
        </label>
        <textarea
          id="lp-notes"
          rows={3}
          maxLength={1000}
          className="input resize-y"
          placeholder={
            isMamnon
              ? "VD: Lớp có nhiều trẻ mới đi học; ưu tiên hoạt động vận động nhẹ."
              : "VD: Lớp đông, trình độ không đều; cần một hoạt động nhóm."
          }
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
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
        disabled={flow.submitting || !topic.trim() || !model || !durationValid}
      >
        {flow.submitting ? "Đang gửi…" : "✨ Soạn giáo án"}
      </button>
      {!model && (
        <p className="text-xs text-amber-600">
          Chưa chọn model AI — hãy chọn model ở góc phải phía trên.
        </p>
      )}
    </form>
  );
}
