"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type LessonActivity, type LessonPlanContent, lessonMetaLine } from "@/lib/lessonPlan";

type Slide =
  | { kind: "cover" }
  | { kind: "materials" }
  | { kind: "activity"; index: number; activity: LessonActivity }
  | { kind: "wrap" };

function buildSlides(lp: LessonPlanContent): Slide[] {
  const slides: Slide[] = [{ kind: "cover" }];
  if (lp.materials.length) slides.push({ kind: "materials" });
  lp.activities.forEach((activity, index) => slides.push({ kind: "activity", index, activity }));
  if (lp.assessment.length || lp.differentiation.length) slides.push({ kind: "wrap" });
  return slides;
}

function mmss(sec: number): string {
  const s = Math.abs(sec);
  const m = Math.floor(s / 60);
  return `${sec < 0 ? "+" : ""}${m}:${String(s % 60).padStart(2, "0")}`;
}

function Bullets({ items, empty = "—" }: { items: string[]; empty?: string }) {
  if (!items.length) return <p className="text-slate-400">{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.map((t, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-[0.55em] h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

/** Đồng hồ đếm ngược cho một hoạt động; quá giờ thì đếm tiếp số phút vượt. */
function ActivityTimer({ minutes }: { minutes: number }) {
  const total = minutes * 60;
  const [left, setLeft] = useState(total);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setLeft((s) => s - 1), 1000);
    return () => window.clearInterval(t);
  }, [running]);

  if (!minutes) return null;
  const over = left < 0;
  return (
    <div className="flex items-center gap-2">
      <span
        className={`rounded-xl px-3 py-1.5 font-mono text-xl font-bold tabular-nums ${
          over ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-800"
        }`}
        role="timer"
        title={over ? "Đã quá thời lượng dự kiến" : "Thời gian còn lại"}
      >
        {mmss(left)}
      </span>
      {/* Chỉ đọc cho trình đọc màn hình một lần khi hết giờ, không đọc từng giây. */}
      <span className="sr-only" aria-live="polite">
        {left <= 0 && running ? "Hết thời lượng dự kiến của hoạt động" : ""}
      </span>
      <button
        type="button"
        className="btn-secondary !px-3 !py-1.5 text-xs"
        onClick={() => setRunning((r) => !r)}
      >
        {running ? "⏸ Dừng" : "▶ Bấm giờ"}
      </button>
      <button
        type="button"
        className="btn-secondary !px-3 !py-1.5 text-xs"
        aria-label="Đặt lại đồng hồ"
        title="Đặt lại đồng hồ"
        onClick={() => {
          setRunning(false);
          setLeft(total);
        }}
      >
        ↺
      </button>
    </div>
  );
}

/**
 * Trình chiếu giáo án toàn màn hình: mỗi hoạt động một trang, chữ to cho máy
 * chiếu. ← → / Space / PageUp PageDown để chuyển, Esc để thoát.
 */
export default function LessonPlanPresenter({
  lp,
  title,
  onClose,
}: {
  lp: LessonPlanContent;
  title: string;
  onClose: () => void;
}) {
  const slides = useMemo(() => buildSlides(lp), [lp]);
  const [i, setI] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const learner = lp.grade_level === "mamnon" ? "Trẻ" : "Học sinh";

  const go = useCallback(
    (d: number) => setI((x) => Math.min(slides.length - 1, Math.max(0, x + d))),
    [slides.length]
  );

  const close = useCallback(() => {
    if (typeof document !== "undefined" && document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    const el = rootRef.current;
    // Trả focus về nút đã mở trình chiếu khi đóng.
    const opener = document.activeElement as HTMLElement | null;
    el?.focus();
    // Toàn màn hình thật nếu trình duyệt cho phép; không được thì vẫn phủ kín cửa sổ.
    el?.requestFullscreen?.().catch(() => undefined);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, []);

  // Nút "Tiếp"/"Trước" bị vô hiệu ở trang cuối/đầu làm mất focus — kéo focus về
  // hộp thoại để phím tắt vẫn chạy.
  useEffect(() => {
    const el = rootRef.current;
    if (el && !el.contains(document.activeElement)) el.focus();
  }, [i]);

  /** Giữ Tab/Shift+Tab quanh vòng trong hộp thoại. */
  function trapTab(e: React.KeyboardEvent) {
    const root = rootRef.current;
    if (!root) return;
    const items = Array.from(
      root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === root)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      return close();
    }
    if (e.key === "Tab") return trapTab(e);
    const target = e.target as HTMLElement;
    // Ô nhập: để nguyên mọi phím. Nút: Space/Enter phải kích hoạt nút, không chuyển trang.
    if (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
    if (target.tagName === "BUTTON" && (e.key === " " || e.key === "Enter")) return;
    if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
      e.preventDefault();
      go(1);
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      go(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      setI(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setI(slides.length - 1);
    }
  }

  const slide = slides[i];

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Trình chiếu: ${title}`}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[70] flex flex-col bg-white text-slate-900 outline-none"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2 sm:px-8">
        <p className="min-w-0 truncate text-sm font-medium text-slate-500">{title}</p>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm tabular-nums text-slate-500">
            {i + 1}/{slides.length}
          </span>
          <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" onClick={close}>
            ✕ Thoát (Esc)
          </button>
        </div>
      </div>
      <div className="h-1 bg-slate-100">
        <div
          className="h-full bg-indigo-500 transition-all duration-300"
          style={{ width: `${((i + 1) / slides.length) * 100}%` }}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-12 sm:py-12">
        <div className="mx-auto max-w-6xl text-[clamp(1.05rem,1.6vw,1.6rem)] leading-relaxed">
          {slide.kind === "cover" && (
            <div>
              <p className="text-[0.7em] font-bold uppercase tracking-[0.18em] text-indigo-600">
                Kế hoạch bài dạy
              </p>
              <h1 className="mt-3 text-[clamp(1.8rem,4vw,3.4rem)] font-extrabold leading-tight">
                {title}
              </h1>
              <p className="mt-3 text-slate-500">{lessonMetaLine(lp)}</p>
              {lp.objectives.length > 0 && (
                <div className="mt-10">
                  <h2 className="mb-4 text-[0.8em] font-bold uppercase tracking-wider text-slate-500">
                    Mục tiêu
                  </h2>
                  <Bullets items={lp.objectives} />
                </div>
              )}
            </div>
          )}

          {slide.kind === "materials" && (
            <div>
              <h1 className="text-[clamp(1.6rem,3.2vw,2.8rem)] font-extrabold">Chuẩn bị</h1>
              <div className="mt-8">
                <Bullets items={lp.materials} />
              </div>
            </div>
          )}

          {slide.kind === "activity" && (
            <div key={slide.index}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[0.7em] font-bold uppercase tracking-[0.18em] text-indigo-600">
                    Hoạt động {slide.index + 1}/{lp.activities.length}
                    {slide.activity.duration_minutes ? ` · ${slide.activity.duration_minutes} phút` : ""}
                  </p>
                  <h1 className="mt-2 text-[clamp(1.6rem,3.2vw,2.8rem)] font-extrabold leading-tight">
                    {slide.activity.title}
                  </h1>
                </div>
                <ActivityTimer minutes={slide.activity.duration_minutes} />
              </div>
              <div className="mt-8 grid gap-6 md:grid-cols-2">
                <section className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-6">
                  <h2 className="mb-4 text-[0.8em] font-bold uppercase tracking-wider text-indigo-700">
                    Giáo viên
                  </h2>
                  <Bullets items={slide.activity.teacher_actions} />
                </section>
                <section className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-6">
                  <h2 className="mb-4 text-[0.8em] font-bold uppercase tracking-wider text-emerald-700">
                    {learner}
                  </h2>
                  <Bullets items={slide.activity.student_actions} />
                </section>
              </div>
              {slide.activity.resources.length > 0 && (
                <p className="mt-6 text-[0.85em] text-slate-600">
                  <span className="font-semibold text-slate-800">Học liệu: </span>
                  {slide.activity.resources.join(" · ")}
                </p>
              )}
            </div>
          )}

          {slide.kind === "wrap" && (
            <div className="grid gap-10 md:grid-cols-2">
              <div>
                <h1 className="text-[clamp(1.4rem,2.6vw,2.2rem)] font-extrabold">Đánh giá</h1>
                <div className="mt-6">
                  <Bullets items={lp.assessment} />
                </div>
              </div>
              <div>
                <h1 className="text-[clamp(1.4rem,2.6vw,2.2rem)] font-extrabold">Phân hoá / hỗ trợ</h1>
                <div className="mt-6">
                  <Bullets items={lp.differentiation} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 sm:px-8">
        <button type="button" className="btn-secondary" disabled={i === 0} onClick={() => go(-1)}>
          ← Trước
        </button>
        <div className="hidden gap-1.5 sm:flex" role="group" aria-label="Chọn trang">
          {slides.map((_, k) => (
            <button
              key={k}
              type="button"
              aria-label={`Trang ${k + 1}`}
              aria-current={k === i ? "step" : undefined}
              onClick={() => setI(k)}
              className={`h-2.5 w-2.5 rounded-full transition ${k === i ? "bg-indigo-600" : "bg-slate-300 hover:bg-slate-400"}`}
            />
          ))}
        </div>
        <button
          type="button"
          className="btn-primary"
          disabled={i === slides.length - 1}
          onClick={() => go(1)}
        >
          Tiếp →
        </button>
      </div>
    </div>
  );
}
