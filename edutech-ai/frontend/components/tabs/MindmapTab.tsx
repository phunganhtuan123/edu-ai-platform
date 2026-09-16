"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { useJobFlow } from "@/lib/useJobFlow";
import type { MindmapMeta } from "@/lib/mindmap";
import type { Artifact } from "@/lib/types";
import JobProgress from "@/components/JobProgress";
import MindmapResult from "@/components/results/MindmapResult";

// Chủ đề hay dùng trong kế hoạch năm học mầm non — chỉ là gợi ý bấm nhanh.
const TOPIC_SUGGESTIONS = [
  "Trường mầm non",
  "Bản thân",
  "Gia đình",
  "Nghề nghiệp",
  "Thế giới động vật",
  "Thế giới thực vật",
  "Tết và mùa xuân",
  "Phương tiện giao thông",
  "Nước và hiện tượng tự nhiên",
  "Quê hương – Đất nước – Bác Hồ",
  "Trường tiểu học",
];

export default function MindmapTab({
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
  const [meta, setMeta] = useState<MindmapMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [mapType, setMapType] = useState("noi_dung");
  const [ageGroup, setAgeGroup] = useState("mg_nho");
  const [weeks, setWeeks] = useState(2);
  const [notes, setNotes] = useState("");
  const flow = useJobFlow(projectId, onArtifactCreated);

  useEffect(() => {
    apiGet<MindmapMeta>("/meta/mindmap")
      .then(setMeta)
      .catch((e: any) => setMetaError(e?.message || "Không tải được cấu hình sơ đồ."));
  }, []);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    flow.submit("mindmap", model, {
      topic: topic.trim(),
      map_type: mapType,
      age_group: ageGroup,
      weeks,
      notes: notes.trim(),
      grade_level: gradeLevel,
    });
  }

  if (flow.artifact) {
    return (
      <div className="space-y-4">
        <button className="btn-secondary" onClick={flow.reset}>
          ← Tạo sơ đồ khác
        </button>
        <MindmapResult
          content={flow.artifact.content}
          title={flow.artifact.title}
          artifactId={flow.artifact.id}
          onSaved={() => flow.artifact && onArtifactCreated(flow.artifact)}
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
        runningLabel="Đang vẽ sơ đồ tư duy…"
      />
    );
  }

  const domains = meta?.domains?.[ageGroup] || [];

  return (
    <form onSubmit={onSubmit} className="card space-y-5">
      <div>
        <h3 className="font-semibold text-slate-900">Sơ đồ tư duy chủ đề</h3>
        <p className="mt-1 text-sm text-slate-500">
          Nhập chủ đề, AI vẽ sẵn mạng nội dung hoặc mạng hoạt động. Sau đó thầy cô
          sửa trực tiếp trên sơ đồ như XMind — thêm, xoá, đổi chữ, kéo thả khung
          nhìn — rồi tải ảnh về in hoặc chiếu.
        </p>
      </div>

      {metaError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {metaError}
        </div>
      )}

      <div>
        <label className="label" htmlFor="mm-topic">
          Chủ đề / sự kiện
        </label>
        <input
          id="mm-topic"
          required
          maxLength={100}
          className="input"
          placeholder="VD: Gia đình"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {TOPIC_SUGGESTIONS.map((t) => (
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
      </div>

      {meta && (
        <div>
          <span className="label">Loại sơ đồ</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {meta.map_types.map((t) => (
              <label
                key={t.key}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                  mapType === t.key
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-slate-300 bg-white hover:border-indigo-300"
                }`}
              >
                <input
                  type="radio"
                  name="mm-type"
                  checked={mapType === t.key}
                  onChange={() => setMapType(t.key)}
                  className="mt-0.5 h-4 w-4 accent-indigo-600"
                />
                <span>
                  <span className="block font-medium text-slate-800">{t.name_vi}</span>
                  {t.hint && <span className="mt-0.5 block text-xs text-slate-500">{t.hint}</span>}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-[1fr,160px]">
        <div>
          <label className="label" htmlFor="mm-age">
            Nhóm / lớp
          </label>
          <select id="mm-age" className="input" value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
            {(meta?.age_groups || []).map((a) => (
              <option key={a.key} value={a.key}>
                {a.name_vi}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="mm-weeks">
            Số tuần
          </label>
          <input
            id="mm-weeks"
            type="number"
            min={1}
            max={6}
            className="input"
            value={weeks}
            onChange={(e) => setWeeks(Math.min(6, Math.max(1, Number(e.target.value) || 1)))}
          />
        </div>
      </div>

      {mapType === "hoat_dong" && domains.length > 0 && (
        <p className="rounded-xl bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
          Sơ đồ sẽ có đủ {domains.length} nhánh lĩnh vực:{" "}
          {domains.map((d) => d.name_vi).join(" · ")}.
        </p>
      )}

      <div>
        <label className="label" htmlFor="mm-notes">
          Ghi chú cho AI{" "}
          <span className="font-normal text-slate-400">(không bắt buộc)</span>
        </label>
        <textarea
          id="mm-notes"
          rows={3}
          maxLength={1000}
          className="input resize-y"
          placeholder="VD: Lớp có nhiều trẻ mới đi học; nhấn mạnh an toàn khi ở nhà; có ngày hội 20/10."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {flow.submitError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {flow.submitError}
        </div>
      )}
      <button type="submit" className="btn-primary" disabled={flow.submitting || !topic.trim() || !model}>
        {flow.submitting ? "Đang gửi…" : "✨ Vẽ sơ đồ"}
      </button>
      {!model && (
        <p className="text-xs text-amber-600">
          Chưa chọn model AI — hãy chọn model ở góc phải phía trên.
        </p>
      )}
    </form>
  );
}
