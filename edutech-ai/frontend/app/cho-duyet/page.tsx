"use client";

import Link from "next/link";
import Logo from "@/components/Logo";

export default function ChoDuyetPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-emerald-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Link href="/" aria-label="Về trang giới thiệu">
            <Logo size="lg" />
          </Link>
        </div>
        <div className="card !p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-2xl">
            ⏳
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            Tài khoản đang chờ quản trị viên duyệt
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Tài khoản của bạn đã được tạo nhưng chưa được kích hoạt. Vui lòng
            chờ quản trị viên duyệt, sau đó đăng nhập lại để bắt đầu sử dụng.
          </p>
          <Link href="/login" className="btn-primary mt-6 w-full">
            Về trang đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}
