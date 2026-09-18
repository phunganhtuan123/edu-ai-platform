"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import {
  JOB_TYPE_LABELS,
  type UsagePage,
  type User,
  formatDateTime,
  formatNumber,
  normalizeUsage,
} from "@/lib/types";
import AppShell, { Spinner } from "@/components/AppShell";
import Badge from "@/components/Badge";
import AdminNav from "@/components/admin/AdminNav";

const PAGE_SIZES = [20, 50, 100];

const STATUS: Record<string, { label: string; color: "emerald" | "amber" | "rose" | "slate" | "indigo" }> = {
  done: { label: "Xong", color: "emerald" },
  running: { label: "Đang chạy", color: "indigo" },
  queued: { label: "Chờ", color: "amber" },
  failed: { label: "Lỗi", color: "rose" },
};

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function positiveInt(v: string | null, fallback: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function UsageHistory() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const userId = params.get("user_id") || "";
  const page = positiveInt(params.get("page"), 1);
  const rawSize = positiveInt(params.get("page_size"), 20);
  const pageSize = PAGE_SIZES.includes(rawSize) ? rawSize : 20;

  const [data, setData] = useState<UsagePage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  // Danh sách người dùng cho bộ lọc — lỗi ở đây không chặn trang.
  useEffect(() => {
    apiGet<any>("/admin/users")
      .then((d) => setUsers((Array.isArray(d) ? d : d?.users || []) as User[]))
      .catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Xoá số liệu của bộ lọc/trang trước ngay khi đổi, tránh gán token cho sai người.
    setData(null);
    setLoading(true);
    setError(null);
    const q = new URLSearchParams();
    if (userId) q.set("user_id", userId);
    q.set("page", String(page));
    q.set("page_size", String(pageSize));
    apiGet<any>(`/admin/usage?${q.toString()}`)
      .then((d) => {
        if (!cancelled) setData(normalizeUsage(d, page, pageSize));
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message || "Không tải được lịch sử sử dụng AI.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, page, pageSize, reloadKey]);

  const setQuery = useCallback(
    (next: { user_id?: string; page?: number; page_size?: number }) => {
      const q = new URLSearchParams();
      const uid = next.user_id !== undefined ? next.user_id : userId;
      if (uid) q.set("user_id", uid);
      const p = next.page ?? page;
      if (p > 1) q.set("page", String(p));
      const ps = next.page_size ?? pageSize;
      if (ps !== 20) q.set("page_size", String(ps));
      const qs = q.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, userId, page, pageSize]
  );

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  const from = data && data.total > 0 ? (page - 1) * pageSize + 1 : 0;
  const to = data ? Math.min(data.total, (page - 1) * pageSize + data.items.length) : 0;
  const s = data?.summary;
  const unrecorded = s ? s.job_count - s.recorded_job_count : 0;
  const filteredUser = users.find((u) => String(u.id) === userId);

  return (
    <div>
      <AdminNav />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Lịch sử sử dụng AI</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Mỗi lần giáo viên chạy một công cụ AI là một job. Token do máy chủ AI báo về, dùng để theo dõi
            tải hệ thống — đây không phải hoá đơn, hệ thống chưa có thanh toán. Với lượt nhiều bước bị gián
            đoạn, tổng chỉ gồm số token máy chủ đã trả về.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64 max-w-full">
            <label className="label" htmlFor="usage-user">
              Người dùng
            </label>
            <select
              id="usage-user"
              className="input"
              value={userId}
              onChange={(e) => setQuery({ user_id: e.target.value, page: 1 })}
            >
              <option value="">Tất cả người dùng</option>
              {/* Giữ lựa chọn từ đường dẫn dù người dùng đó không có trong danh sách. */}
              {userId && !filteredUser && <option value={userId}>Người dùng #{userId}</option>}
              {users.map((u) => (
                <option key={String(u.id)} value={String(u.id)}>
                  {u.name} — {u.email}
                </option>
              ))}
            </select>
          </div>
          <div className="w-28">
            <label className="label" htmlFor="usage-size">
              Mỗi trang
            </label>
            <select
              id="usage-size"
              className="input"
              value={pageSize}
              onChange={(e) => setQuery({ page_size: Number(e.target.value), page: 1 })}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {s && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Tổng token (đã đo)"
            value={s.recorded_job_count ? formatNumber(s.total_tokens) : "—"}
            hint={filteredUser ? filteredUser.name : userId ? `Người dùng #${userId}` : "Tất cả người dùng"}
          />
          <StatCard label="Token vào (prompt)" value={s.recorded_job_count ? formatNumber(s.prompt_tokens) : "—"} />
          <StatCard label="Token ra (sinh)" value={s.recorded_job_count ? formatNumber(s.completion_tokens) : "—"} />
          <StatCard
            label="Job đã đo / tổng job"
            value={`${formatNumber(s.recorded_job_count)} / ${formatNumber(s.job_count)}`}
            hint={unrecorded > 0 ? `${formatNumber(unrecorded)} lượt chưa có số liệu token` : undefined}
          />
        </div>
      )}
      {s && unrecorded > 0 && (
        <p className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
          {formatNumber(unrecorded)} lượt chưa có số liệu token hiển thị &ldquo;Chưa ghi nhận&rdquo; và không được
          cộng vào tổng: lượt chạy trước khi bật đo token, lượt đang chờ/đang chạy, hoặc lượt mà máy chủ AI không trả
          số liệu. Đó là thiếu số liệu, không phải bằng 0.
        </p>
      )}

      {error && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <span>{error}</span>
          <button className="btn-secondary !py-1.5 text-xs" onClick={() => setReloadKey((k) => k + 1)}>
            Thử lại
          </button>
        </div>
      )}

      {(!error || data) && (
      <div className="card overflow-hidden !p-0">
        {loading && !data ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : !data ? null : data.items.length === 0 && data.total > 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium text-slate-700">Trang {page} không còn dữ liệu</p>
            <button className="btn-secondary mt-4 !py-1.5 text-xs" onClick={() => setQuery({ page: 1 })}>
              Về trang đầu
            </button>
          </div>
        ) : data.items.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm font-medium text-slate-700">Chưa có lượt sử dụng AI nào</p>
              <p className="mt-1 text-xs text-slate-500">
                {userId ? "Người dùng này chưa chạy công cụ AI nào." : "Khi giáo viên chạy công cụ AI, lịch sử sẽ hiện ở đây."}
              </p>
              {userId && (
                <button className="btn-secondary mt-4 !py-1.5 text-xs" onClick={() => setQuery({ user_id: "", page: 1 })}>
                  Xem tất cả người dùng
                </button>
              )}
            </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Thời gian</th>
                  <th className="px-4 py-3 font-semibold">Người dùng</th>
                  <th className="px-4 py-3 font-semibold">Công cụ</th>
                  <th className="px-4 py-3 font-semibold">Trạng thái</th>
                  <th className="px-4 py-3 font-semibold">Model</th>
                  <th className="px-4 py-3 text-right font-semibold">Vào</th>
                  <th className="px-4 py-3 text-right font-semibold">Ra</th>
                  <th className="px-4 py-3 text-right font-semibold">Tổng</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it) => {
                  const st = STATUS[it.status] || { label: it.status || "—", color: "slate" as const };
                  return (
                    <tr key={String(it.id)} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {formatDateTime(it.created_at) || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="text-left font-medium text-slate-900 hover:text-indigo-700"
                          title="Lọc theo người dùng này"
                          onClick={() => setQuery({ user_id: String(it.user_id), page: 1 })}
                        >
                          {it.user_name || `#${it.user_id}`}
                        </button>
                        <div className="text-xs text-slate-500">{it.user_email}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {JOB_TYPE_LABELS[it.type] || it.type || "—"}
                        {it.project_id != null && it.project_id !== "" && (
                          <div className="text-xs text-slate-400">Dự án #{String(it.project_id)}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge color={st.color}>{st.label}</Badge>
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-3 font-mono text-xs text-slate-600" title={it.model}>
                        {it.model || "—"}
                      </td>
                      {it.usage_recorded ? (
                        <>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                            {formatNumber(it.prompt_tokens)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                            {formatNumber(it.completion_tokens)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                            {formatNumber(it.total_tokens)}
                          </td>
                        </>
                      ) : (
                        <td colSpan={3} className="px-4 py-3 text-right text-xs text-slate-400">
                          Chưa ghi nhận
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {data && data.items.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <span className="tabular-nums">
            {formatNumber(from)}–{formatNumber(to)} / {formatNumber(data.total)} job
          </span>
          <div className="flex items-center gap-2">
            <button
              className="btn-secondary !py-1.5 text-xs"
              disabled={page <= 1 || loading}
              onClick={() => setQuery({ page: page - 1 })}
            >
              ← Trước
            </button>
            <span className="tabular-nums">
              Trang {page}/{totalPages}
            </span>
            <button
              className="btn-secondary !py-1.5 text-xs"
              disabled={page >= totalPages || loading}
              onClick={() => setQuery({ page: page + 1 })}
            >
              Sau →
            </button>
          </div>
        </div>
      )}
      <p className="mt-6 text-xs text-slate-400">
        Xem người dùng và tổng token theo người ở{" "}
        <Link href="/admin/users" className="font-medium text-indigo-600 hover:text-indigo-700">
          Quản trị người dùng
        </Link>
        .
      </p>
    </div>
  );
}

export default function AdminUsagePage() {
  return (
    <AppShell>
      {/* useSearchParams cần Suspense khi build tĩnh (Next 14). */}
      <Suspense
        fallback={
          <div className="flex justify-center py-24">
            <Spinner />
          </div>
        }
      >
        <UsageHistory />
      </Suspense>
    </AppShell>
  );
}
