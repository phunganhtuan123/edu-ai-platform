"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, apiBlob } from "@/lib/api";
import { downloadBlob } from "@/lib/mindmap";
import type { MindAttachment } from "@/lib/mindmapAttachments";

// Danh sách tệp đính kèm của một sơ đồ, tách hẳn khỏi cây (không nhét file vào
// cây, không vào lịch sử hoàn tác). Mọi request gắn AbortSignal của "đời" hiện
// tại: đổi artifact hoặc gỡ editor thì huỷ và bỏ qua kết quả trễ.

export interface AttachmentList {
  status: "idle" | "loading" | "ready" | "error";
  items: MindAttachment[];
  error: string | null;
}

export function useMindmapAttachments(artifactId: number | string | undefined) {
  const [list, setList] = useState<AttachmentList>({ status: "idle", items: [], error: null });
  const lifeRef = useRef<AbortController | null>(null);
  const loadRef = useRef<AbortController | null>(null);
  const base = artifactId != null ? `/artifacts/${encodeURIComponent(String(artifactId))}/mindmap/attachments` : null;

  const load = useCallback(() => {
    if (!base || !lifeRef.current) return;
    loadRef.current?.abort();
    const ctrl = new AbortController();
    loadRef.current = ctrl;
    const life = lifeRef.current;
    setList((l) => ({ ...l, status: "loading", error: null }));
    api<{ attachments?: MindAttachment[] }>(base, { signal: ctrl.signal })
      .then((res) => {
        if (ctrl.signal.aborted || life.signal.aborted) return;
        setList({ status: "ready", items: Array.isArray(res?.attachments) ? res.attachments : [], error: null });
      })
      .catch((err: any) => {
        if (ctrl.signal.aborted || life.signal.aborted) return;
        setList({ status: "error", items: [], error: err?.message || "Không tải được danh sách tệp đính kèm." });
      });
  }, [base]);

  useEffect(() => {
    if (!base) {
      setList({ status: "idle", items: [], error: null });
      return;
    }
    const life = new AbortController();
    lifeRef.current = life;
    load();
    return () => {
      life.abort();
      loadRef.current?.abort();
      if (lifeRef.current === life) lifeRef.current = null;
    };
  }, [base, load]);

  /** Tải tệp lên nút `nodeId`. Ném lỗi nếu thất bại hoặc sơ đồ đã đổi/gỡ. */
  const upload = useCallback(
    async (nodeId: string, file: File) => {
      const life = lifeRef.current;
      if (!base || !life) throw new Error("Sơ đồ chưa được lưu trên máy chủ.");
      const form = new FormData();
      form.append("node_id", nodeId);
      form.append("file", file, file.name);
      const res = await api<{ attachment?: MindAttachment }>(base, { method: "POST", form, signal: life.signal });
      const created = res?.attachment;
      if (!created || typeof created.id !== "number") throw new Error("Máy chủ trả dữ liệu tệp không hợp lệ.");
      if (!life.signal.aborted) {
        setList((l) => ({ ...l, items: [...l.items.filter((a) => a.id !== created.id), created] }));
      }
      return created;
    },
    [base]
  );

  const remove = useCallback(
    async (att: MindAttachment) => {
      const life = lifeRef.current;
      if (!base || !life) return;
      await api(`${base}/${att.id}`, { method: "DELETE", signal: life.signal });
      if (!life.signal.aborted) setList((l) => ({ ...l, items: l.items.filter((a) => a.id !== att.id) }));
    },
    [base]
  );

  /** Tải về qua fetch có JWT ở header → blob URL (downloadBlob tự thu hồi URL). */
  const download = useCallback(
    async (att: MindAttachment) => {
      const life = lifeRef.current;
      if (!base || !life) return;
      const blob = await apiBlob(`${base}/${att.id}`, life.signal);
      if (!life.signal.aborted) downloadBlob(att.name, blob);
    },
    [base]
  );

  return { list, reload: load, upload, remove, download };
}
