"use client";

import {
  activityHtml,
  normalizeExam,
  normalizeQuiz,
  normalizeWriting,
  type Artifact,
} from "@/lib/types";
import QuizResult from "./results/QuizResult";
import ExamResult from "./results/ExamResult";
import WritingResult from "./results/WritingResult";
import ActivityResult from "./results/ActivityResult";

/** Renders a saved artifact by type (used by the history panel). */
export default function ArtifactView({ artifact }: { artifact: Artifact }) {
  const type = (artifact.type || "").toLowerCase();
  switch (type) {
    case "quiz":
      return (
        <QuizResult
          content={normalizeQuiz(artifact.content)}
          title={artifact.title || "Trắc nghiệm"}
          artifactId={artifact.id}
        />
      );
    case "exam":
      return (
        <ExamResult
          content={normalizeExam(artifact.content)}
          title={artifact.title || "Đề thi"}
          artifactId={artifact.id}
        />
      );
    // Module 5 tạo ra đề có cùng hình dạng content với module 2.
    case "template_generate":
      return (
        <ExamResult
          content={normalizeExam(artifact.content)}
          title={artifact.title || "Đề nhân từ mẫu"}
          artifactId={artifact.id}
        />
      );
    case "writing":
      return <WritingResult content={normalizeWriting(artifact.content)} />;
    case "activity":
      return (
        <ActivityResult
          html={activityHtml(artifact.content)}
          title={artifact.title || "Hoạt động tương tác"}
        />
      );
    default:
      return (
        <pre className="overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100">
          {JSON.stringify(artifact.content, null, 2)}
        </pre>
      );
  }
}
