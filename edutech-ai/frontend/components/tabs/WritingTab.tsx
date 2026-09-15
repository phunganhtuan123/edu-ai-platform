"use client";

import { useState } from "react";
import { useJobFlow } from "@/lib/useJobFlow";
import { normalizeWriting, type Artifact } from "@/lib/types";
import JobProgress from "@/components/JobProgress";
import WritingResult from "@/components/results/WritingResult";

export default function WritingTab({
  projectId,
  model,
  gradeLevel,
  onArtifactCreated,
}: {
  projectId: string;
  model: string;
  gradeLevel: string;
  onArtifactCreated: (a: Artifact) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [essay, setEssay] = useState("");
  const flow = useJobFlow(projectId, onArtifactCreated);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    flow.submit("writing", model, {
      prompt_text: prompt.trim(),
      student_text: essay.trim(),
      grade_level: gradeLevel,
    });
  }

  if (flow.artifact) {
    return (
      <div className="space-y-4">
        <button className="btn-secondary" onClick={flow.reset}>
          ← Chấm bài khác
        </button>
        <WritingResult content={normalizeWriting(flow.artifact.content)} />
      </div>
    );
  }

  if (flow.jobId != null) {
    return (
      <JobProgress
        jobId={flow.jobId}
        onDone={flow.handleDone}
        onReset={flow.reset}
        runningLabel="Đang chấm bài viết…"
      />
    );
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-5">
      <div>
        <h3 className="font-semibold text-slate-900">Chấm bài viết</h3>
        <p className="mt-1 text-sm text-slate-500">
          AI chấm theo rubric (task response, vocabulary, grammar, coherence),
          nhận xét bằng tiếng Việt kèm lỗi cụ thể và cách sửa.
        </p>
      </div>
      <div>
        <label className="label" htmlFor="writing-prompt">
          Đề bài
        </label>
        <textarea
          id="writing-prompt"
          required
          rows={3}
          className="input resize-y"
          placeholder="VD: Write a paragraph (100–120 words) about your favorite hobby."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </div>
      <div>
        <label className="label" htmlFor="writing-essay">
          Bài làm của học sinh
        </label>
        <textarea
          id="writing-essay"
          required
          rows={10}
          className="input resize-y font-mono text-[13px]"
          placeholder="Paste the student's writing here…"
          value={essay}
          onChange={(e) => setEssay(e.target.value)}
        />
      </div>
      {flow.submitError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {flow.submitError}
        </div>
      )}
      <button
        type="submit"
        className="btn-primary"
        disabled={flow.submitting || !prompt.trim() || !essay.trim() || !model}
      >
        {flow.submitting ? "Đang gửi…" : "✨ Chấm bài"}
      </button>
      {!model && (
        <p className="text-xs text-amber-600">
          Chưa chọn model AI — hãy chọn model ở góc phải phía trên.
        </p>
      )}
    </form>
  );
}
