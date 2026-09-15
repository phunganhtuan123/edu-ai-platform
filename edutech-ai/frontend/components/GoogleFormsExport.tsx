"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";

type Status = {
  configured: boolean;
  connected: boolean;
  google_email?: string;
  reason?: string;
};

type FormResult = {
  form_id: string;
  edit_url: string;
  responder_url: string;
};

/**
 * Nút xuất một kết quả sang Google Forms (spec mục 2b).
 *
 * Google là tính năng TUỲ CHỌN: máy chủ chưa cấu hình hoặc giáo viên chưa nối
 * tài khoản thì nút chỉ mờ đi kèm lời giải thích — không chặn gì khác.
 */
export default function GoogleFormsExport({
  artifactId,
  existing,
}: {
  artifactId: number | string;
  existing?: FormResult | null;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [form, setForm] = useState<FormResult | null>(existing || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<Status>("/google/status")
      .then((s) => !cancelled && setStatus(s))
      .catch(() => !cancelled && setStatus({ configured: false, connected: false }));
    return () => {
      cancelled = true;
    };
  }, []);

  async function onExport() {
    setBusy(true);
    setError(null);
    try {
      const data: any = await apiPost(`/artifacts/${artifactId}/export/google-forms`);
      setForm(data.form as FormResult);
    } catch (e: any) {
      setError(e?.message || "Không xuất được sang Google Forms.");
    } finally {
      setBusy(false);
    }
  }

  if (form) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
        <p className="font-medium text-emerald-800">Đã tạo Google Form</p>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
          <a
            href={form.edit_url}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-emerald-700 underline"
          >
            Mở để sửa
          </a>
          <a
            href={form.responder_url}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-emerald-700 underline"
          >
            Link gửi học sinh
          </a>
        </div>
      </div>
    );
  }

  const disabled = !status?.configured || !status?.connected || busy;

  return (
    <div>
      <button
        className="btn-secondary !py-2 text-xs"
        disabled={disabled}
        onClick={onExport}
        title={
          !status?.configured
            ? status?.reason || "Máy chủ chưa cấu hình Google"
            : !status?.connected
              ? "Bạn chưa nối tài khoản Google"
              : undefined
        }
      >
        {busy ? "Đang tạo form…" : "📋 Xuất Google Forms"}
      </button>
      {status && !status.configured && (
        <p className="mt-1 text-[11px] text-slate-500">
          {status.reason || "Máy chủ chưa cấu hình Google."}
        </p>
      )}
      {status?.configured && !status.connected && (
        <p className="mt-1 text-[11px] text-slate-500">
          Chưa nối tài khoản Google —{" "}
          <a href="/cai-dat" className="font-medium text-indigo-600 underline">
            nối ở trang Cài đặt
          </a>
          .
        </p>
      )}
      {error && <p className="mt-1 text-[11px] text-rose-600">{error}</p>}
    </div>
  );
}
