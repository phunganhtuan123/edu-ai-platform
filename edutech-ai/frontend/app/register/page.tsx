"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import Logo from "@/components/Logo";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api("/auth/register", {
        method: "POST",
        body: { name, email, password },
        noAuthRedirect: true,
      });
      setSuccess(true);
    } catch (err: any) {
      setError(err?.message || "Đăng ký thất bại.");
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
          {success ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl">
                ✓
              </div>
              <h1 className="text-xl font-bold text-slate-900">
                Đăng ký thành công!
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Tài khoản của bạn đã được tạo và đang{" "}
                <span className="font-semibold text-slate-800">
                  chờ quản trị viên duyệt
                </span>
                . Bạn sẽ đăng nhập được ngay sau khi tài khoản được duyệt.
              </p>
              <Link href="/login" className="btn-primary mt-6 w-full">
                Về trang đăng nhập
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-slate-900">
                Đăng ký tài khoản
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Tài khoản mới cần được quản trị viên duyệt trước khi sử dụng.
              </p>
              <form onSubmit={onSubmit} className="mt-6 space-y-4">
                <div>
                  <label className="label" htmlFor="name">
                    Họ và tên
                  </label>
                  <input
                    id="name"
                    type="text"
                    required
                    className="input"
                    placeholder="Nguyễn Văn A"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
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
                    minLength={6}
                    className="input"
                    placeholder="Ít nhất 6 ký tự"
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
                  {submitting ? "Đang đăng ký…" : "Đăng ký"}
                </button>
              </form>
              <p className="mt-6 text-center text-sm text-slate-500">
                Đã có tài khoản?{" "}
                <Link
                  href="/login"
                  className="font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  Đăng nhập
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
