import type { ExamContent, QuizContent, WritingContent } from "./types";
import { bloomLabel } from "./types";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

export function downloadFile(
  filename: string,
  content: string,
  mime = "text/plain;charset=utf-8"
) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Quiz Markdown: numbered questions, A-D options, answer key at the end.
 */
export function quizToMarkdown(quiz: QuizContent, title = "Trắc nghiệm"): string {
  const lines: string[] = [`# ${title}`, ""];
  quiz.questions.forEach((q, i) => {
    lines.push(`${i + 1}. ${q.question}`);
    q.options.forEach((opt, j) => {
      lines.push(`${LETTERS[j] || j + 1}. ${opt}`);
    });
    lines.push("");
  });
  lines.push("## Đáp án", "");
  quiz.questions.forEach((q, i) => {
    let line = `${i + 1}. ${LETTERS[q.correct_index] || "?"}`;
    if (q.explanation) line += ` — ${q.explanation}`;
    lines.push(line);
  });
  lines.push("");
  return lines.join("\n");
}

export function examToMarkdown(exam: ExamContent, title = "Đề thi"): string {
  const lines: string[] = [`# ${exam.title || title}`, ""];
  if (exam.instruction) {
    lines.push(`*${exam.instruction}*`, "");
  }
  if (exam.passage) {
    lines.push("---", "", exam.passage, "", "---", "");
  }
  exam.questions.forEach((q) => {
    const opts = q.options
      .map((opt, j) => `${LETTERS[j] || j + 1}. ${opt}`)
      .join("   ");
    lines.push(`**Question ${q.number}:** ${opts}`, "");
  });
  lines.push("## Đáp án (dành cho giáo viên)", "");
  exam.questions.forEach((q) => {
    let line = `Question ${q.number}: ${LETTERS[q.correct_index] || "?"}`;
    if (q.explanation) line += ` — ${q.explanation}`;
    lines.push(line);
  });
  lines.push("");
  return lines.join("\n");
}

export function writingToMarkdown(
  w: WritingContent,
  title = "Kết quả chấm bài viết"
): string {
  const lines: string[] = [`# ${title}`, ""];
  lines.push(`**Điểm tổng:** ${w.overall_score}/${w.max_score}`, "");
  if (w.criteria.length) {
    lines.push("## Chấm theo tiêu chí", "");
    lines.push("| Tiêu chí | Điểm | Nhận xét |");
    lines.push("|---|---|---|");
    w.criteria.forEach((c) => {
      lines.push(
        `| ${c.name} | ${c.score}/${c.max_score} | ${c.comment.replace(/\n/g, " ")} |`
      );
    });
    lines.push("");
  }
  if (w.errors.length) {
    lines.push("## Lỗi cụ thể", "");
    w.errors.forEach((e, i) => {
      lines.push(`${i + 1}. **"${e.quote}"** → **"${e.fix}"**`);
      if (e.explanation) lines.push(`   - ${e.explanation}`);
    });
    lines.push("");
  }
  if (w.overall_feedback) {
    lines.push("## Nhận xét chung", "", w.overall_feedback, "");
  }
  return lines.join("\n");
}
