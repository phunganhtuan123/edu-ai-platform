"use client";

import { useEffect } from "react";

export default function Modal({
  open,
  onClose,
  title,
  children,
  wide,
  xwide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
  /** Rộng gần hết màn hình — dùng cho sơ đồ tư duy. */
  xwide?: boolean;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) {
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ${
          xwide ? "max-w-6xl" : wide ? "max-w-2xl" : "max-w-md"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Đóng"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
