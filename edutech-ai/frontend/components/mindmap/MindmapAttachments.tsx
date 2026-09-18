"use client";

import { useEffect, useRef, useState } from "react";
import {
  ATTACHMENT_ACCEPT,
  MAX_ATTACHMENT_BYTES,
  MAX_MAP_ATTACHMENT_BYTES,
  type MindAttachment,
  type UploadPhase,
  formatBytes,
} from "@/lib/mindmapAttachments";
import type { AttachmentList } from "./useMindmapAttachments";

// Mục "Tệp đính kèm" trong tab Thuộc tính: tải Word/Excel lên nút đang chọn,
// xem danh sách, tải về, gỡ (xoá thật trên máy chủ — không hoàn tác được).

export interface AttachmentNotice {
  kind: "ok" | "error";
  text: string;
  nodeId: string;
}

export interface AttachmentsProps {
  nodeId: string;
  /** false khi sơ đồ chưa có trên máy chủ (không có artifactId). */
  available: boolean;
  list: AttachmentList;
  items: MindAttachment[];
  orphans: MindAttachment[];
  usedBytes: number;
  busy: { phase: UploadPhase; nodeId: string } | null;
  /** Editor đang lưu/tải — khoá nút chọn tệp. */
  locked: boolean;
  /** Cây có thay đổi chưa lưu → chọn tệp sẽ lưu cây trước. */
  willSaveFirst: boolean;
  notice: AttachmentNotice | null;
  onPick: (file: File) => void;
  onRetry: () => void;
  onDownload: (att: MindAttachment) => Promise<void>;
  onDelete: (att: MindAttachment) => Promise<void>;
}

function fileIcon(name: string) {
  return /\.xlsx?$/i.test(name) ? "📊" : "📄";
}

function AttachmentRow({
  att,
  locked,
  onDownload,
  onDelete,
}: {
  att: MindAttachment;
  locked: boolean;
  onDownload: (att: MindAttachment) => Promise<void>;
  onDelete: (att: MindAttachment) => Promise<void>;
}) {
  const [state, setState] = useState<"idle" | "downloading" | "confirm" | "deleting">("idle");
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true; // StrictMode chạy setup→cleanup→setup
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (state === "confirm") cancelRef.current?.focus();
  }, [state]);

  async function run(kind: "downloading" | "deleting", fn: () => Promise<void>) {
    setState(kind);
    setError(null);
    try {
      await fn();
      if (aliveRef.current) setState("idle");
    } catch (err: any) {
      if (!aliveRef.current || err?.name === "AbortError") return;
      setState("idle");
      setError(err?.message || (kind === "deleting" ? "Gỡ tệp thất bại." : "Tải tệp thất bại."));
    }
  }

  const busy = locked || state === "downloading" || state === "deleting";
  return (
    <li className="rounded-lg border border-slate-200 px-2 py-1.5">
      <div className="flex items-center gap-2">
        <span aria-hidden className="shrink-0 text-base leading-none">
          {fileIcon(att.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] text-slate-800" title={att.name}>
            {att.name}
          </span>
          <span className="block text-[11px] tabular-nums text-slate-400">{formatBytes(att.size)}</span>
        </span>
        <button
          type="button"
          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-40"
          disabled={busy}
          aria-label={`Tải về ${att.name}`}
          onClick={() => run("downloading", () => onDownload(att))}
        >
          {state === "downloading" ? "Đang tải…" : "⬇ Tải"}
        </button>
        <button
          type="button"
          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-40"
          disabled={busy || state === "confirm"}
          aria-label={`Gỡ ${att.name}`}
          onClick={() => setState("confirm")}
        >
          {state === "deleting" ? "Đang gỡ…" : "Gỡ"}
        </button>
      </div>
      {state === "confirm" && (
        <div
          role="alertdialog"
          aria-label={`Xác nhận gỡ ${att.name}`}
          className="mt-1.5 rounded-lg bg-rose-50 px-2 py-2 text-xs text-rose-800"
          onKeyDown={(e) => {
            // Esc chỉ huỷ xác nhận, không đóng hộp thoại xem kết quả bên ngoài.
            if (e.key === "Escape") {
              e.stopPropagation();
              setState("idle");
            }
          }}
        >
          <p>
            Gỡ “{att.name}”? Tệp bị <b>xoá vĩnh viễn</b> khỏi máy chủ — <b>không hoàn tác được</b> (Ctrl/⌘ + Z
            cũng không khôi phục).
          </p>
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              className="rounded-md bg-rose-600 px-2.5 py-1 font-medium text-white hover:bg-rose-700 disabled:opacity-40"
              disabled={locked}
              onClick={() => run("deleting", () => onDelete(att))}
            >
              Gỡ vĩnh viễn
            </button>
            <button
              ref={cancelRef}
              type="button"
              className="rounded-md border border-rose-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => setState("idle")}
            >
              Huỷ
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-1 text-[11px] text-rose-600">
          {error}
        </p>
      )}
    </li>
  );
}

export default function MindmapAttachments(p: AttachmentsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const mine = p.busy?.nodeId === p.nodeId ? p.busy : null;
  const ready = p.list.status === "ready";
  const canPick = p.available && ready && !p.locked;
  const notice = p.notice?.nodeId === p.nodeId ? p.notice : null;
  const pct = Math.min(100, Math.round((p.usedBytes / MAX_MAP_ATTACHMENT_BYTES) * 100));

  return (
    <section aria-labelledby="mm-attach-title" className="border-t border-slate-100 pt-4">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h4 id="mm-attach-title" className="text-xs font-semibold text-slate-600">
          Tệp đính kèm{p.items.length > 0 && ` (${p.items.length})`}
        </h4>
        {p.available && ready && (
          <span className="text-[11px] tabular-nums text-slate-400" title="Tổng dung lượng tệp của cả sơ đồ">
            {formatBytes(p.usedBytes)} / {formatBytes(MAX_MAP_ATTACHMENT_BYTES)}
          </span>
        )}
      </div>

      {!p.available ? (
        <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-500">
          Chỉ đính kèm được khi sơ đồ đã lưu trên máy chủ. Hãy mở sơ đồ từ mục kết quả đã lưu.
        </p>
      ) : p.list.status === "error" ? (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-700">
          <p>{p.list.error}</p>
          <button type="button" className="mt-1.5 font-semibold underline" onClick={p.onRetry}>
            Thử lại
          </button>
        </div>
      ) : !ready ? (
        <p className="py-2 text-xs text-slate-400" aria-live="polite">
          Đang tải danh sách tệp…
        </p>
      ) : (
        <>
          <div
            className="mb-2 h-1 overflow-hidden rounded-full bg-slate-100"
            role="meter"
            aria-label="Dung lượng tệp đính kèm của sơ đồ"
            aria-valuemin={0}
            aria-valuemax={MAX_MAP_ATTACHMENT_BYTES}
            aria-valuenow={p.usedBytes}
            aria-valuetext={`${formatBytes(p.usedBytes)} trên ${formatBytes(MAX_MAP_ATTACHMENT_BYTES)}`}
          >
            <div className={`h-full ${pct >= 90 ? "bg-rose-500" : "bg-indigo-500"}`} style={{ width: `${pct}%` }} />
          </div>
          {p.items.length === 0 ? (
            <p className="py-1 text-xs text-slate-400">Nút này chưa có tệp nào.</p>
          ) : (
            <ul className="space-y-1.5" aria-label="Tệp của nút đang chọn">
              {p.items.map((a) => (
                <AttachmentRow
                  key={a.id}
                  att={a}
                  locked={p.locked}
                  onDownload={p.onDownload}
                  onDelete={p.onDelete}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {p.available && (
        <div className="mt-2">
          <input
            ref={inputRef}
            type="file"
            accept={ATTACHMENT_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = ""; // cho phép chọn lại cùng tệp sau khi lỗi
              if (f) p.onPick(f);
            }}
          />
          <button
            type="button"
            className="btn-secondary w-full !py-2 text-xs"
            disabled={!canPick}
            aria-describedby="mm-attach-hint"
            onClick={() => inputRef.current?.click()}
          >
            {mine?.phase === "saving"
              ? "Đang lưu sơ đồ…"
              : mine?.phase === "uploading"
                ? "Đang tải tệp lên…"
                : "📎 Đính kèm Word / Excel"}
          </button>
          <p id="mm-attach-hint" className="mt-1 text-[11px] leading-snug text-slate-400">
            .doc, .docx, .xls, .xlsx · tối đa {formatBytes(MAX_ATTACHMENT_BYTES)}/tệp,{" "}
            {formatBytes(MAX_MAP_ATTACHMENT_BYTES)}/sơ đồ.
            {p.willSaveFirst && " Sơ đồ đang có thay đổi chưa lưu — sẽ được lưu trước khi tải tệp."}
          </p>
        </div>
      )}

      <div aria-live="polite" className="mt-1.5 text-xs">
        {mine && (
          <p className="text-slate-500">
            {mine.phase === "saving"
              ? "Đang lưu sơ đồ trước khi tải tệp (tạm khoá chỉnh sửa)…"
              : "Đang tải tệp lên (tạm khoá chỉnh sửa)…"}
          </p>
        )}
        {!mine && notice && (
          <p role={notice.kind === "error" ? "alert" : undefined} className={notice.kind === "error" ? "text-rose-600" : "text-emerald-700"}>
            {notice.text}
          </p>
        )}
      </div>

      {p.available && ready && p.orphans.length > 0 && (
        <details className="mt-3 rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-600">
          <summary className="cursor-pointer select-none font-medium">
            {p.orphans.length} tệp thuộc nhánh đã xoá ({formatBytes(p.orphans.reduce((s, a) => s + a.size, 0))})
          </summary>
          <p className="mt-1 text-[11px] text-slate-500">
            Vẫn tính vào dung lượng sơ đồ. Hoàn tác việc xoá nhánh để tệp hiện lại trên nút, hoặc tải về / gỡ tại đây.
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {p.orphans.map((a) => (
              <AttachmentRow
                key={a.id}
                att={a}
                locked={p.locked}
                onDownload={p.onDownload}
                onDelete={p.onDelete}
              />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
