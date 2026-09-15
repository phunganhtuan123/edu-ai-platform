"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiDelete, apiGet } from "@/lib/api";
import AppShell from "@/components/AppShell";

type Status = {
  configured: boolean;
  connected: boolean;
  google_email?: string;
  connected_at?: string;
  reason?: string;
};

/**
 * Phần đọc query string phải nằm trong <Suspense>: Next 14 không prerender
 * được component dùng useSearchParams, thiếu bọc là `next build` gãy ở bước
 * xuất trang tĩnh (không phải lỗi runtime nên tsc không bắt được).
 */
function SettingsContent() {
  const params = useSearchParams();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callbackResult = params.get("google");
  const callbackMessage = params.get("msg");

  const load = useCallback(() => {
    apiGet<Status>("/google/status")
      .then(setStatus)
      .catch((e: any) => setError(e?.message || "Không đọc được trạng thái."));
  }, []);

  useEffect(load, [load]);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const data: any = await apiGet("/google/auth-url");
      window.location.href = data.url;
    } catch (e: any) {
      setError(e?.message || "Không lấy được liên kết uỷ quyền.");
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      await apiDelete("/google/account");
      load();
    } catch (e: any) {
      setError(e?.message || "Không gỡ được liên kết.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Cài đặt</h1>
          <p className="mt-1 text-sm text-slate-500">
            Nối tài khoản Google để xuất đề đã soạn thành Google Form chấm điểm
            tự động.
          </p>
        </div>

        {callbackResult === "ok" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Đã nối tài khoản Google.
          </div>
        )}
        {callbackResult === "loi" && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            Nối tài khoản không thành công.
            {callbackMessage ? ` ${decodeURIComponent(callbackMessage)}` : ""}
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="card space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-slate-900">Google Forms</h2>
              <p className="mt-1 text-sm text-slate-500">
                Ứng dụng chỉ tạo form mới trong Drive của bạn. Không đọc, không
                sửa các file sẵn có.
              </p>
            </div>
            {status?.connected && (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                Đã nối
              </span>
            )}
          </div>

          {!status && <p className="text-sm text-slate-500">Đang tải…</p>}

          {status && !status.configured && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {status.reason ||
                "Máy chủ chưa cấu hình OAuth Google."}{" "}
              Các tính năng khác vẫn dùng bình thường.
            </div>
          )}

          {status?.configured && status.connected && (
            <div className="space-y-3">
              <p className="text-sm text-slate-700">
                Tài khoản:{" "}
                <span className="font-medium">{status.google_email || "—"}</span>
              </p>
              <button
                className="btn-secondary"
                disabled={busy}
                onClick={disconnect}
              >
                Gỡ liên kết
              </button>
            </div>
          )}

          {status?.configured && !status.connected && (
            <button className="btn-primary" disabled={busy} onClick={connect}>
              {busy ? "Đang chuyển…" : "Nối tài khoản Google"}
            </button>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <p className="text-sm text-slate-500">Đang tải…</p>
        </AppShell>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
