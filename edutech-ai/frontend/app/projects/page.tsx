"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import {
  Catalog,
  CatalogEntry,
  Project,
  formatDate,
  normalizeCatalog,
} from "@/lib/types";
import AppShell, { Spinner } from "@/components/AppShell";
import Badge from "@/components/Badge";
import Modal from "@/components/Modal";

function catalogName(entries: CatalogEntry[], code: string): string {
  return entries.find((e) => e.code === code)?.name || code;
}

function CatalogSelect({
  label,
  entries,
  value,
  onChange,
}: {
  label: string;
  entries: CatalogEntry[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-2">
        {entries.map((e) => {
          const selected = value === e.code;
          return (
            <button
              key={e.code}
              type="button"
              disabled={!e.enabled}
              onClick={() => e.enabled && onChange(e.code)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium transition ${
                !e.enabled
                  ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                  : selected
                    ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                    : "border-slate-300 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
              }`}
            >
              {e.name}
              {!e.enabled && (
                <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                  Sắp có
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Mầm non không chia môn: cấp Mầm non chỉ đi với "Giáo dục mầm non" và ngược
// lại. Backend cũng chặn cặp sai (SubjectGradeCompatible).
const GRADE_MAMNON = "mamnon";
const SUBJECT_MAMNON = "mamnon_chung";

function compatible(subject: string, grade: string): boolean {
  return (subject === SUBJECT_MAMNON) === (grade === GRADE_MAMNON);
}

function Dashboard() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [grade, setGrade] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiGet<any>("/projects").then((d) =>
        (Array.isArray(d) ? d : d?.projects || []) as Project[]
      ),
      apiGet<any>("/meta/catalog").then(normalizeCatalog),
    ])
      .then(([ps, cat]) => {
        setProjects(ps);
        setCatalog(cat);
        const firstGrade = cat.grade_levels.find(
          (g) => g.enabled && g.code !== GRADE_MAMNON
        ) || cat.grade_levels.find((g) => g.enabled);
        if (firstGrade) {
          setGrade(firstGrade.code);
          const firstSubject = cat.subjects.find(
            (s) => s.enabled && compatible(s.code, firstGrade.code)
          );
          if (firstSubject) setSubject(firstSubject.code);
        }
      })
      .catch((e: any) => setLoadError(e?.message || "Không tải được dữ liệu."));
  }, []);

  function chooseGrade(g: string) {
    setGrade(g);
    if (catalog && !compatible(subject, g)) {
      const s = catalog.subjects.find((x) => x.enabled && compatible(x.code, g));
      setSubject(s ? s.code : "");
    }
  }

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !subject || !grade) return;
    setCreating(true);
    setCreateError(null);
    try {
      const data: any = await apiPost("/projects", {
        name: name.trim(),
        subject,
        grade_level: grade,
      });
      const project: Project = (data?.project || data) as Project;
      setProjects((prev) => [project, ...(prev || [])]);
      setModalOpen(false);
      setName("");
    } catch (err: any) {
      setCreateError(err?.message || "Tạo project thất bại.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dự án</h1>
          <p className="mt-1 text-sm text-slate-500">
            Mỗi dự án gắn với một cấp học và môn học, lưu lại mọi kết quả AI.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setModalOpen(true)}>
          <span className="text-base leading-none">+</span> Tạo project
        </button>
      </div>

      {loadError && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {loadError}
        </div>
      )}

      {projects === null && !loadError ? (
        <div className="flex justify-center py-24">
          <Spinner />
        </div>
      ) : projects && projects.length === 0 ? (
        <div className="card flex flex-col items-center py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-3xl">
            📚
          </div>
          <h2 className="text-lg font-semibold text-slate-900">
            Chưa có project nào
          </h2>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            Tạo project đầu tiên để bắt đầu sinh trắc nghiệm, đề thi và các
            hoạt động cho lớp của bạn.
          </p>
          <button
            className="btn-primary mt-6"
            onClick={() => setModalOpen(true)}
          >
            Tạo project đầu tiên
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(projects || []).map((p) => (
            <Link
              key={String(p.id)}
              href={`/projects/${p.id}`}
              className="card group transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 text-lg font-bold text-white">
                {p.name.trim().charAt(0).toUpperCase() || "P"}
              </div>
              <h3 className="mt-4 font-semibold text-slate-900 group-hover:text-indigo-700">
                {p.name}
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge color="indigo">
                  {catalog
                    ? catalogName(catalog.subjects, p.subject)
                    : p.subject}
                </Badge>
                <Badge color="emerald">
                  {catalog
                    ? catalogName(catalog.grade_levels, p.grade_level)
                    : p.grade_level}
                </Badge>
              </div>
              {p.created_at && (
                <p className="mt-3 text-xs text-slate-400">
                  Tạo ngày {formatDate(p.created_at)}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Tạo project mới"
      >
        <form onSubmit={createProject} className="space-y-5">
          <div>
            <label className="label" htmlFor="project-name">
              Tên project
            </label>
            <input
              id="project-name"
              type="text"
              required
              className="input"
              placeholder="VD: Lớp 9A1 — Học kỳ 1"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {catalog ? (
            <>
              <CatalogSelect
                label="Cấp học"
                entries={catalog.grade_levels}
                value={grade}
                onChange={chooseGrade}
              />
              <CatalogSelect
                label={grade === GRADE_MAMNON ? "Chương trình" : "Môn học"}
                entries={catalog.subjects.filter((s) => compatible(s.code, grade))}
                value={subject}
                onChange={setSubject}
              />
            </>
          ) : (
            <p className="text-sm text-slate-500">Đang tải danh mục…</p>
          )}
          {createError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {createError}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setModalOpen(false)}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={creating || !name.trim() || !subject || !grade}
            >
              {creating ? "Đang tạo…" : "Tạo project"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}
