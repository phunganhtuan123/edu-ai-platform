"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import {
  Artifact,
  JOB_TYPE_LABELS,
  Project,
  formatDateTime,
  normalizeModels,
} from "@/lib/types";
import AppShell, { Spinner } from "@/components/AppShell";
import Badge from "@/components/Badge";
import Modal from "@/components/Modal";
import ArtifactView from "@/components/ArtifactView";
import QuizTab from "@/components/tabs/QuizTab";
import ExamTab from "@/components/tabs/ExamTab";
import WritingTab from "@/components/tabs/WritingTab";
import ActivityTab from "@/components/tabs/ActivityTab";

const MODEL_KEY = "edutech_model";

const TABS = [
  { key: "quiz", label: "Trắc nghiệm", icon: "📝" },
  { key: "exam", label: "Đề thi", icon: "📄" },
  { key: "writing", label: "Chấm bài viết", icon: "✍️" },
  { key: "activity", label: "Hoạt động tương tác", icon: "🎮" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const GRADE_LABELS: Record<string, string> = {
  thcs: "THCS",
  thpt: "THPT",
  mamnon: "Mầm non",
  tieuhoc: "Tiểu học",
};

const SUBJECT_LABELS: Record<string, string> = {
  english: "Tiếng Anh",
};

const ARTIFACT_ICONS: Record<string, string> = {
  quiz: "📝",
  exam: "📄",
  writing: "✍️",
  activity: "🎮",
};

function ProjectDetail() {
  const params = useParams<{ id: string }>();
  const projectId = String(params.id);

  const [project, setProject] = useState<Project | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("quiz");
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [viewArtifact, setViewArtifact] = useState<Artifact | null>(null);

  const refreshArtifacts = useCallback(async () => {
    try {
      const data: any = await apiGet(`/projects/${projectId}/artifacts`);
      const list: Artifact[] = Array.isArray(data)
        ? data
        : data?.artifacts || [];
      setArtifacts(list);
    } catch {
      // non-fatal
    }
  }, [projectId]);

  useEffect(() => {
    apiGet<any>(`/projects/${projectId}`)
      .then((d) => setProject((d?.project || d) as Project))
      .catch((e: any) =>
        setLoadError(e?.message || "Không tải được project.")
      );
    refreshArtifacts();
  }, [projectId, refreshArtifacts]);

  useEffect(() => {
    apiGet<any>("/ai/models")
      .then((d) => {
        const list = normalizeModels(d);
        setModels(list);
        let saved: string | null = null;
        try {
          saved = window.localStorage.getItem(MODEL_KEY);
        } catch {
          // ignore
        }
        if (saved && list.includes(saved)) setModel(saved);
        else if (list.length > 0) setModel(list[0]);
      })
      .catch((e: any) =>
        setModelsError(e?.message || "Không tải được danh sách model.")
      );
  }, []);

  function chooseModel(m: string) {
    setModel(m);
    try {
      window.localStorage.setItem(MODEL_KEY, m);
    } catch {
      // ignore
    }
  }

  const onArtifactCreated = useCallback(
    (_a: Artifact) => {
      refreshArtifacts();
    },
    [refreshArtifacts]
  );

  if (loadError) {
    return (
      <div className="card border-rose-200 bg-rose-50 text-center">
        <p className="text-sm text-rose-700">{loadError}</p>
        <Link href="/" className="btn-secondary mt-4">
          ← Về danh sách projects
        </Link>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );
  }

  const gradeLevel = project.grade_level;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/"
            className="text-sm font-medium text-slate-500 hover:text-indigo-600"
          >
            ← Projects
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {project.name}
          </h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge color="indigo">
              {SUBJECT_LABELS[project.subject] || project.subject}
            </Badge>
            <Badge color="emerald">
              {GRADE_LABELS[project.grade_level] || project.grade_level}
            </Badge>
          </div>
        </div>
        <div className="w-full sm:w-64">
          <label className="label" htmlFor="model-select">
            Model AI
          </label>
          <select
            id="model-select"
            className="input"
            value={model}
            onChange={(e) => chooseModel(e.target.value)}
          >
            {models.length === 0 && <option value="">— Không có model —</option>}
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          {modelsError && (
            <p className="mt-1 text-xs text-amber-600">{modelsError}</p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
              tab === t.key
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
            }`}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr),300px]">
        {/* Active tab */}
        <div className="min-w-0">
          {tab === "quiz" && (
            <QuizTab
              projectId={projectId}
              model={model}
              gradeLevel={gradeLevel}
              onArtifactCreated={onArtifactCreated}
            />
          )}
          {tab === "exam" && (
            <ExamTab
              projectId={projectId}
              model={model}
              gradeLevel={gradeLevel}
              onArtifactCreated={onArtifactCreated}
            />
          )}
          {tab === "writing" && (
            <WritingTab
              projectId={projectId}
              model={model}
              gradeLevel={gradeLevel}
              onArtifactCreated={onArtifactCreated}
            />
          )}
          {tab === "activity" && (
            <ActivityTab
              projectId={projectId}
              model={model}
              gradeLevel={gradeLevel}
              artifacts={artifacts}
              onArtifactCreated={onArtifactCreated}
            />
          )}
        </div>

        {/* History panel */}
        <aside className="card !p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Lịch sử</h3>
            <button
              onClick={refreshArtifacts}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              Làm mới
            </button>
          </div>
          {artifacts.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">
              Chưa có kết quả nào được lưu.
            </p>
          ) : (
            <ul className="space-y-2">
              {artifacts.map((a) => (
                <li key={String(a.id)}>
                  <button
                    onClick={() => setViewArtifact(a)}
                    className="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:border-indigo-300 hover:bg-indigo-50/50"
                  >
                    <span className="mt-0.5 text-lg">
                      {ARTIFACT_ICONS[(a.type || "").toLowerCase()] || "📦"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">
                        {a.title ||
                          JOB_TYPE_LABELS[(a.type || "").toLowerCase()] ||
                          a.type}
                      </span>
                      <span className="block text-xs text-slate-400">
                        {JOB_TYPE_LABELS[(a.type || "").toLowerCase()] ||
                          a.type}
                        {a.created_at
                          ? ` · ${formatDateTime(a.created_at)}`
                          : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {/* Artifact viewer */}
      <Modal
        open={viewArtifact !== null}
        onClose={() => setViewArtifact(null)}
        title={
          viewArtifact
            ? viewArtifact.title ||
              JOB_TYPE_LABELS[(viewArtifact.type || "").toLowerCase()] ||
              "Kết quả"
            : ""
        }
        wide
      >
        {viewArtifact && <ArtifactView artifact={viewArtifact} />}
      </Modal>
    </div>
  );
}

export default function ProjectPage() {
  return (
    <AppShell>
      <ProjectDetail />
    </AppShell>
  );
}
