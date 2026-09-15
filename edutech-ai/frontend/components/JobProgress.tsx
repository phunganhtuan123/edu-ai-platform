"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet } from "@/lib/api";
import type { Job } from "@/lib/types";
import { Spinner } from "./AppShell";

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} phút ${s.toString().padStart(2, "0")} giây` : `${s} giây`;
}

/**
 * Polls GET /api/jobs/:id every 2s and shows progress states.
 * Calls onDone(job) once the job reaches "done".
 */
export default function JobProgress({
  jobId,
  onDone,
  onReset,
  runningLabel = "Đang sinh nội dung…",
}: {
  jobId: number | string;
  onDone: (job: Job) => void;
  onReset?: () => void;
  runningLabel?: string;
}) {
  const [job, setJob] = useState<Job | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [pollError, setPollError] = useState<string | null>(null);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    doneRef.current = false;
    setJob(null);
    setElapsed(0);
    setPollError(null);
    const startedAt = Date.now();

    const tick = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    let stopped = false;
    async function poll() {
      try {
        const data: any = await apiGet(`/jobs/${jobId}`);
        const j: Job = (data && (data.job || data)) as Job;
        if (stopped) return;
        setPollError(null);
        setJob(j);
        if (j.status === "done" && !doneRef.current) {
          doneRef.current = true;
          onDoneRef.current(j);
        }
        if (j.status === "done" || j.status === "failed") {
          clearInterval(interval);
          clearInterval(tick);
        }
      } catch (e: any) {
        if (!stopped) setPollError(e?.message || "Lỗi kết nối");
      }
    }
    const interval = setInterval(poll, 2000);
    poll();

    return () => {
      stopped = true;
      clearInterval(interval);
      clearInterval(tick);
    };
  }, [jobId]);

  const status = job?.status;

  if (status === "failed") {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-xl">⚠️</span>
          <div className="flex-1">
            <p className="font-semibold text-rose-800">Tạo nội dung thất bại</p>
            <p className="mt-1 text-sm text-rose-700">
              {job?.error || "Đã xảy ra lỗi không xác định. Vui lòng thử lại."}
            </p>
            {onReset && (
              <button onClick={onReset} className="btn-secondary mt-4">
                Thử lại
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (status === "done") {
    return null;
  }

  const queued = !status || status === "queued";

  return (
    <div className="card flex flex-col items-center gap-4 py-10 text-center">
      <Spinner />
      <div>
        <p className="font-semibold text-slate-900">
          {queued ? "Đang xếp hàng…" : runningLabel}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {queued
            ? "Job đang chờ đến lượt xử lý trên server AI."
            : `Đã chạy ${formatElapsed(elapsed)}. Sinh nội dung trên server AI có thể mất 1–5 phút.`}
        </p>
        {pollError && (
          <p className="mt-2 text-xs text-amber-600">
            Mất kết nối tạm thời, đang thử lại… ({pollError})
          </p>
        )}
      </div>
    </div>
  );
}
