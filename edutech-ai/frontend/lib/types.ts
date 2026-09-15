// Shared types + defensive normalizers for backend payloads.

export interface User {
  id: number | string;
  name: string;
  email: string;
  role: "admin" | "teacher";
  status: "pending" | "active" | "disabled";
  created_at?: string;
  jobs_this_month?: number;
}

export interface Project {
  id: number | string;
  name: string;
  subject: string;
  grade_level: string;
  created_at?: string;
}

export interface CatalogEntry {
  code: string;
  name: string;
  enabled: boolean;
}

export interface Catalog {
  subjects: CatalogEntry[];
  grade_levels: CatalogEntry[];
}

export interface Job {
  id: number | string;
  type: "quiz" | "exam" | "writing" | "activity";
  status: "queued" | "running" | "done" | "failed";
  error?: string;
  created_at?: string;
  started_at?: string;
  finished_at?: string;
  artifact?: Artifact;
}

export interface Artifact {
  id: number | string;
  job_id?: number | string;
  project_id?: number | string;
  type: string;
  title?: string;
  content: any;
  created_at?: string;
}

// ---------- Quiz ----------

export interface QuizQuestion {
  question: string;
  options: string[];
  correct_index: number;
  explanation?: string;
  bloom_level?: string;
}

export interface QuizContent {
  questions: QuizQuestion[];
  warnings: string[];
}

function asArray(x: any): any[] {
  return Array.isArray(x) ? x : [];
}

function str(x: any): string {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

export function normalizeQuiz(content: any): QuizContent {
  const c = content || {};
  const rawQuestions = asArray(c.questions ?? c.items ?? c.quiz ?? content);
  const questions: QuizQuestion[] = rawQuestions.map((q: any) => {
    const options = asArray(q?.options ?? q?.choices ?? q?.answers).map(str);
    let correct =
      q?.correct_index ?? q?.answer_index ?? q?.correctIndex ?? q?.correct;
    if (typeof correct === "string") {
      const letterIdx = "ABCD".indexOf(correct.trim().toUpperCase());
      if (letterIdx >= 0) correct = letterIdx;
      else {
        const found = options.findIndex((o) => o === correct);
        correct = found >= 0 ? found : parseInt(correct, 10) || 0;
      }
    }
    if (typeof correct !== "number" || correct < 0 || correct >= options.length) {
      correct = 0;
    }
    return {
      question: str(q?.question ?? q?.text ?? q?.prompt),
      options,
      correct_index: correct,
      explanation: str(q?.explanation ?? q?.rationale ?? ""),
      bloom_level: str(q?.bloom_level ?? q?.bloom ?? q?.level ?? ""),
    };
  });
  const warnings = asArray(c.warnings ?? c.validation_warnings).map(str);
  return { questions, warnings };
}

// ---------- Exam ----------

export interface ExamQuestion {
  number: number;
  options: string[];
  correct_index: number;
  explanation?: string;
}

export interface ExamContent {
  title: string;
  instruction: string;
  passage: string;
  questions: ExamQuestion[];
  warnings: string[];
}

export function normalizeExam(content: any): ExamContent {
  const c = content || {};
  const section = c.section ?? c.exam ?? c;
  const rawQuestions = asArray(section.questions ?? section.items);
  const startNumber = Number(section.start_number ?? section.startNumber ?? 1) || 1;
  const questions: ExamQuestion[] = rawQuestions.map((q: any, i: number) => {
    const options = asArray(q?.options ?? q?.choices).map(str);
    let correct =
      q?.correct_index ?? q?.answer_index ?? q?.correctIndex ?? q?.correct;
    if (typeof correct === "string") {
      const letterIdx = "ABCD".indexOf(correct.trim().toUpperCase());
      if (letterIdx >= 0) correct = letterIdx;
      else {
        const found = options.findIndex((o) => o === correct);
        correct = found >= 0 ? found : parseInt(correct, 10) || 0;
      }
    }
    if (typeof correct !== "number" || correct < 0 || correct >= options.length) {
      correct = 0;
    }
    return {
      number: Number(q?.number ?? q?.no ?? startNumber + i) || startNumber + i,
      options,
      correct_index: correct,
      explanation: str(q?.explanation ?? ""),
    };
  });
  return {
    title: str(section.title ?? c.title ?? ""),
    instruction: str(section.instruction ?? section.instructions ?? ""),
    passage: str(section.passage ?? section.text ?? section.body ?? ""),
    questions,
    warnings: asArray(c.warnings ?? section.warnings).map(str),
  };
}

// ---------- Writing ----------

export interface WritingCriterion {
  name: string;
  score: number;
  max_score: number;
  comment: string;
}

export interface WritingError {
  quote: string;
  fix: string;
  explanation: string;
}

export interface WritingContent {
  overall_score: number;
  max_score: number;
  criteria: WritingCriterion[];
  errors: WritingError[];
  overall_feedback: string;
}

export function normalizeWriting(content: any): WritingContent {
  const c = content || {};
  const criteria = asArray(c.criteria ?? c.rubric).map((r: any) => ({
    name: str(r?.name ?? r?.criterion ?? r?.title),
    score: Number(r?.score ?? 0) || 0,
    max_score: Number(r?.max_score ?? r?.max ?? 10) || 10,
    comment: str(r?.comment ?? r?.feedback ?? r?.nhan_xet ?? ""),
  }));
  const errors = asArray(c.errors ?? c.mistakes).map((e: any) => ({
    quote: str(e?.quote ?? e?.original ?? e?.text),
    fix: str(e?.fix ?? e?.correction ?? e?.suggestion ?? e?.fixed),
    explanation: str(e?.explanation ?? e?.reason ?? ""),
  }));
  return {
    overall_score: Number(c.overall_score ?? c.score ?? c.total_score ?? 0) || 0,
    max_score: Number(c.max_score ?? c.overall_max ?? 10) || 10,
    criteria,
    errors,
    overall_feedback: str(
      c.overall_feedback ?? c.feedback ?? c.general_feedback ?? ""
    ),
  };
}

// ---------- Activity ----------

export function activityHtml(content: any): string {
  if (typeof content === "string") return content;
  return str(content?.html ?? content?.content ?? "");
}

// ---------- Models / catalog ----------

export function normalizeModels(data: any): string[] {
  const raw = asArray(data?.models ?? data?.data ?? data);
  return raw
    .map((m: any) => (typeof m === "string" ? m : str(m?.name ?? m?.model ?? m?.id)))
    .filter(Boolean);
}

export function normalizeCatalog(data: any): Catalog {
  const entry = (e: any): CatalogEntry => ({
    code: str(e?.code ?? e?.id ?? e?.value),
    name: str(e?.name ?? e?.label ?? e?.title),
    enabled: Boolean(e?.enabled),
  });
  return {
    subjects: asArray(data?.subjects).map(entry),
    grade_levels: asArray(
      data?.grade_levels ?? data?.grades ?? data?.gradeLevels
    ).map(entry),
  };
}

// ---------- Labels ----------

export const JOB_TYPE_LABELS: Record<string, string> = {
  quiz: "Trắc nghiệm",
  exam: "Đề thi",
  writing: "Chấm bài viết",
  activity: "Hoạt động tương tác",
};

export const BLOOM_LABELS: Record<string, string> = {
  remember: "Nhận biết",
  knowledge: "Nhận biết",
  nhan_biet: "Nhận biết",
  understand: "Thông hiểu",
  comprehension: "Thông hiểu",
  thong_hieu: "Thông hiểu",
  apply: "Vận dụng",
  application: "Vận dụng",
  van_dung: "Vận dụng",
};

export function bloomLabel(level?: string): string {
  if (!level) return "";
  return BLOOM_LABELS[level.toLowerCase().trim()] || level;
}

export function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDateTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
