"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError, setToken } from "@/lib/api";
import Logo from "@/components/Logo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const data: any = await api("/auth/login", {
        method: "POST",
        body: { email, password },
        noAuthRedirect: true,
      });
      const token = data?.token || data?.access_token || data?.jwt;
      if (!token) throw new Error("Phản hồi đăng nhập không hợp lệ.");
      setToken(token);
      router.replace("/");
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 403) {
        const code = (err.code || "").toLowerCase();
        const msg = (err.message || "").toLowerCase();
        if (code === "pending" || msg.includes("pending") || msg.includes("chờ duyệt")) {
          router.replace("/cho-duyet");
          return;
        }
        if (code === "disabled" || msg.includes("disabled") || msg.includes("khóa")) {
          setError("Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.");
        } else {
          setError(err.message);
        }
      } else {
        setError(err?.message || "Đăng nhập thất bại.");
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-emerald-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo size="lg" />
        </div>
        <div className="card !p-8">
          <h1 className="text-xl font-bold text-slate-900">Đăng nhập</h1>
          <p className="mt-1 text-sm text-slate-500">
            Trợ lý AI soạn bài cho giáo viên tiếng Anh
          </p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                className="input"
                placeholder="giaovien@truong.edu.vn"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="password">
                Mật khẩu
              </label>
              <input
                id="password"
                type="password"
                required
                className="input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full"
            >
              {submitting ? "Đang đăng nhập…" : "Đăng nhập"}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-500">
            Chưa có tài khoản?{" "}
            <Link
              href="/register"
              className="font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Đăng ký
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
