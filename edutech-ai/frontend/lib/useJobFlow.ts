"use client";

import { useState } from "react";
import { apiGet, apiPost } from "./api";
import type { Artifact, Job } from "./types";

/**
 * Shared job flow: submit job -> poll (via <JobProgress/>) -> artifact.
 */
export function useJobFlow(
  projectId: string,
  onArtifactCreated?: (artifact: Artifact) => void
) {
  const [jobId, setJobId] = useState<string | number | null>(null);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(type: string, model: string, input: unknown) {
    setSubmitting(true);
    setSubmitError(null);
    setArtifact(null);
    setJobId(null);
    try {
      const data: any = await apiPost(`/projects/${projectId}/jobs`, {
        type,
        model,
        input,
      });
      const id =
        data?.job?.id ?? data?.id ?? data?.job_id ?? data?.jobId ?? null;
      if (id == null) throw new Error("Không nhận được mã job từ máy chủ.");
      setJobId(id);
    } catch (e: any) {
      setSubmitError(e?.message || "Không tạo được job.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDone(job: Job): Promise<Artifact | null> {
    let art: Artifact | null = (job as any).artifact || null;
    if (!art) {
      // Fallback: find the artifact for this job in the project list.
      try {
        const data: any = await apiGet(`/projects/${projectId}/artifacts`);
        const list: Artifact[] = Array.isArray(data)
          ? data
          : data?.artifacts || [];
        art =
          list.find((a) => String(a.job_id) === String(job.id)) ||
          list[0] ||
          null;
      } catch {
        // ignore
      }
    }
    if (art) {
      setArtifact(art);
      onArtifactCreated?.(art);
    }
    return art;
  }

  function reset() {
    setJobId(null);
    setArtifact(null);
    setSubmitError(null);
  }

  return {
    jobId,
    artifact,
    submitError,
    submitting,
    submit,
    handleDone,
    reset,
  };
}
