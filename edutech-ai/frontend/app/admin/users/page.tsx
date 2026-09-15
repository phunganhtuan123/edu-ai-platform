"use client";

import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPatch } from "@/lib/api";
import { User, formatDate } from "@/lib/types";
import AppShell, { Spinner, useCurrentUser } from "@/components/AppShell";
import Badge from "@/components/Badge";
import Modal from "@/components/Modal";

const STATUS_TABS: { key: string; label: string }[] = [
  { key: "pending", label: "Chờ duyệt" },
  { key: "active", label: "Hoạt động" },
  { key: "disabled", label: "Đã khóa" },
  { key: "", label: "Tất cả" },
];

function StatusBadge({ status }: { status: User["status"] }) {
  if (status === "active") return <Badge color="emerald">Hoạt động</Badge>;
  if (status === "pending") return <Badge color="amber">Chờ duyệt</Badge>;
  if (status === "disabled") return <Badge color="rose">Đã khóa</Badge>;
  return <Badge>{status}</Badge>;
}

function AdminUsers() {
  const me = useCurrentUser();
  const [tab, setTab] = useState("pending");
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (status: string) => {
    setUsers(null);
    setError(null);
    try {
      const data: any = await apiGet(
        `/admin/users${status ? `?status=${status}` : ""}`
      );
      setUsers((Array.isArray(data) ? data : data?.users || []) as User[]);
    } catch (e: any) {
      setError(e?.message || "Không tải được danh sách người dùng.");
    }
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  async function doAction(user: User, action: "approve" | "disable" | "enable") {
    setBusyId(String(user.id));
    setError(null);
    try {
      await apiPatch(`/admin/users/${user.id}`, { action });
      await load(tab);
    } catch (e: any) {
      setError(e?.message || "Thao tác thất bại.");
    } finally {
      setBusyId(null);
    }
  }

  async function doDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await apiDelete(`/admin/users/${deleteTarget.id}`);
      setDeleteTarget(null);
      await load(tab);
    } catch (e: any) {
      setError(e?.message || "Xóa thất bại.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Quản trị người dùng
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Duyệt tài khoản mới, khóa hoặc xóa người dùng.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              tab === t.key
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="card overflow-hidden !p-0">
        {users === null && !error ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : (users || []).length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">
            Không có người dùng nào trong nhóm này.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3 font-semibold">Người dùng</th>
                  <th className="px-5 py-3 font-semibold">Trạng thái</th>
                  <th className="px-5 py-3 font-semibold">Job / tháng</th>
                  <th className="px-5 py-3 font-semibold">Ngày tạo</th>
                  <th className="px-5 py-3 text-right font-semibold">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody>
                {(users || []).map((u) => {
                  const isSelf = me && String(me.id) === String(u.id);
                  const busy = busyId === String(u.id);
                  return (
                    <tr
                      key={String(u.id)}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
                    >
                      <td className="px-5 py-3.5">
                        <div className="font-medium text-slate-900">
                          {u.name}
                          {u.role === "admin" && (
                            <span className="ml-2 align-middle">
                              <Badge color="indigo">Admin</Badge>
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">{u.email}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusBadge status={u.status} />
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">
                        {u.jobs_this_month ?? "—"}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">
                        {formatDate(u.created_at) || "—"}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex justify-end gap-2">
                          {u.status === "pending" && (
                            <button
                              disabled={busy}
                              onClick={() => doAction(u, "approve")}
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                            >
                              Duyệt
                            </button>
                          )}
                          {u.status === "active" && !isSelf && (
                            <button
                              disabled={busy}
                              onClick={() => doAction(u, "disable")}
                              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
                            >
                              Khóa
                            </button>
                          )}
                          {u.status === "disabled" && (
                            <button
                              disabled={busy}
                              onClick={() => doAction(u, "enable")}
                              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                            >
                              Mở khóa
                            </button>
                          )}
                          {!isSelf && (
                            <button
                              disabled={busy}
                              onClick={() => setDeleteTarget(u)}
                              className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                            >
                              Xóa
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Xóa người dùng?"
      >
        <p className="text-sm leading-relaxed text-slate-600">
          Bạn có chắc chắn muốn xóa vĩnh viễn tài khoản{" "}
          <span className="font-semibold text-slate-900">
            {deleteTarget?.name}
          </span>{" "}
          ({deleteTarget?.email})? Hành động này không thể hoàn tác.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            className="btn-secondary"
            onClick={() => setDeleteTarget(null)}
          >
            Hủy
          </button>
          <button
            onClick={doDelete}
            disabled={deleting}
            className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
          >
            {deleting ? "Đang xóa…" : "Xóa vĩnh viễn"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <AppShell>
      <AdminUsers />
    </AppShell>
  );
}
