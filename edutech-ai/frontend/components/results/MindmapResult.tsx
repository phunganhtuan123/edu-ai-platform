"use client";

import { apiPut } from "@/lib/api";
import { normalizeMindmap, type MindNode } from "@/lib/mindmap";
import Badge from "@/components/Badge";
import MindMapEditor from "@/components/mindmap/MindMapEditor";
import WarningsBanner from "./WarningsBanner";

/** Sơ đồ tư duy: thông tin chung + cảnh báo + trình sửa sơ đồ (lưu lên máy chủ). */
export default function MindmapResult({
  content,
  title,
  artifactId,
  onSaved,
}: {
  content: any;
  title?: string;
  artifactId?: number | string;
  onSaved?: () => void;
}) {
  const mm = normalizeMindmap(content);

  async function save(root: MindNode) {
    if (artifactId == null) return;
    const res = await apiPut<{ artifact?: { content?: { root?: unknown } } }>(`/artifacts/${artifactId}/mindmap`, { root });
    onSaved?.();
    // Cây máy chủ đã lưu: editor đối chiếu id nút trước khi đính kèm tệp.
    return res?.artifact?.content?.root;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge color="indigo">{mm.map_type_name}</Badge>
        {mm.age_group_name && <Badge color="emerald">{mm.age_group_name}</Badge>}
        {mm.weeks > 0 && <Badge color="slate">{mm.weeks} tuần</Badge>}
      </div>
      <WarningsBanner warnings={mm.warnings} />
      <MindMapEditor
        // Đổi artifact thì dựng lại editor từ đầu, không giữ lịch sử của sơ đồ cũ.
        key={String(artifactId ?? mm.topic)}
        initialRoot={mm.root}
        meta={mm}
        title={title || mm.topic}
        onSave={artifactId != null ? save : undefined}
        artifactId={artifactId}
      />
      <p className="text-xs text-amber-600">
        Sơ đồ do AI gợi ý — thầy cô điều chỉnh cho phù hợp lớp mình trước khi dùng.
      </p>
    </div>
  );
}
