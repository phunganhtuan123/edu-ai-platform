"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getToken } from "@/lib/api";

/**
 * Nút hành động trên trang giới thiệu. Token nằm ở localStorage nên chỉ biết
 * đã đăng nhập hay chưa sau khi trang chạy ở trình duyệt; trước đó hiện nút
 * mặc định cho khách.
 */
export default function AuthCta({ variant = "hero" }: { variant?: "hero" | "nav" }) {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(Boolean(getToken()));
  }, []);

  if (variant === "nav") {
    return loggedIn ? (
      <Link href="/projects" className="btn-primary !py-2">
        Vào không gian làm việc
      </Link>
    ) : (
      <div className="flex items-center gap-2">
        <Link
          href="/login"
          className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          Đăng nhập
        </Link>
        <Link href="/register" className="btn-primary !py-2">
          Đăng ký
        </Link>
      </div>
    );
  }

  return loggedIn ? (
    <div className="flex flex-wrap gap-3">
      <Link href="/projects" className="btn-primary !px-6 !py-3 text-base">
        Mở danh sách dự án →
      </Link>
    </div>
  ) : (
    <div className="flex flex-wrap gap-3">
      <Link href="/register" className="btn-primary !px-6 !py-3 text-base">
        Đăng ký tài khoản giáo viên
      </Link>
      <Link href="/login" className="btn-secondary !px-6 !py-3 text-base">
        Tôi đã có tài khoản
      </Link>
    </div>
  );
}
