"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { downloadFile } from "@/lib/download";
import {
  FONT_FAMILY,
  MAX_DEPTH,
  MAX_NODES,
  MAX_TAG_LEN,
  MAX_TEXT_LEN,
  clampText,
  type LayoutNode,
  type MindNode,
  type MindmapContent,
  cloneTree,
  collectTags,
  walk,
  computeLayout,
  countNodes,
  depthOf,
  downloadBlob,
  exportSvgString,
  findWithParent,
  indentBranch,
  mindmapToMarkdown,
  newId,
  outdentBranch,
  pathTo,
  slugify,
  svgToPngBlob,
} from "@/lib/mindmap";
import { groupByLiveNodes, runAttachmentUpload, totalBytes, type UploadPhase } from "@/lib/mindmapAttachments";
import MindmapSidePanel, { type NodeActions, type PanelTab } from "./MindmapSidePanel";
import type { AttachmentNotice } from "./MindmapAttachments";
import { useMindmapAttachments } from "./useMindmapAttachments";

interface History {
  past: MindNode[];
  present: MindNode;
  future: MindNode[];
}

interface Editing {
  id: string;
  value: string;
  isNew: boolean;
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 2.5;

function ToolButton({
  onClick,
  disabled,
  title,
  children,
  active,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-lg px-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "bg-indigo-600 text-white"
          : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="mx-1 h-5 w-px bg-slate-200" />;

export default function MindMapEditor({
  initialRoot,
  meta,
  title,
  onSave,
  artifactId,
}: {
  initialRoot: MindNode;
  meta?: Partial<MindmapContent>;
  title?: string;
  /** Lưu cây đã sửa lên máy chủ. Không truyền = chỉ sửa tạm, không lưu.
   *  Có thể trả cây máy chủ đã lưu để đối chiếu id nút trước khi đính kèm tệp. */
  onSave?: (root: MindNode) => Promise<unknown>;
  /** Id kết quả trên máy chủ; không có thì mục Tệp đính kèm bị tắt. */
  artifactId?: number | string;
}) {
  const [hist, setHist] = useState<History>(() => ({
    past: [],
    present: cloneTree(initialRoot),
    future: [],
  }));
  const tree = hist.present;
  const [selectedId, setSelectedId] = useState<string | null>(initialRoot.id);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const [fullscreen, setFullscreen] = useState(false);
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(cloneTree(initialRoot)));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelTab, setPanelTab] = useState<PanelTab>("outline");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const attachments = useMindmapAttachments(artifactId);
  const [attBusy, setAttBusy] = useState<{ phase: UploadPhase; nodeId: string } | null>(null);
  const [attNotice, setAttNotice] = useState<AttachmentNotice | null>(null);
  // Khoá đồng bộ khi đang lưu hoặc tải tệp: mọi thao tác đổi cây/chọn nút bị bỏ qua
  // để không mất thay đổi và không đổi nút đích ngoài ý muốn.
  const lockRef = useRef(false);
  const locked = saving || attBusy != null;

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const activeRef = useRef(false);
  // Chặn kết thúc sửa hai lần (Enter rồi blur khi ô nhập bị gỡ).
  const editOpenRef = useRef(false);

  const beginEdit = useCallback((e: Editing) => {
    editOpenRef.current = true;
    setEditing(e);
  }, []);

  const layout = useMemo(() => computeLayout(tree, collapsed), [tree, collapsed]);
  const dirty = useMemo(() => JSON.stringify(tree) !== savedJson, [tree, savedJson]);
  const total = useMemo(() => countNodes(tree), [tree]);
  const tags = useMemo(() => collectTags(tree), [tree]);
  const attItems = attachments.list.items;
  const attUsed = useMemo(() => totalBytes(attItems), [attItems]);
  // Badge chỉ cho nút còn trong cây hiện tại; tệp của nhánh vừa xoá vẫn còn trên
  // máy chủ và hiện lại khi hoàn tác.
  const attGroups = useMemo(() => {
    const ids = new Set<string>();
    walk(tree, (n) => void ids.add(n.id));
    return groupByLiveNodes(attItems, ids);
  }, [tree, attItems]);

  // ---------- Lịch sử ----------

  const commit = useCallback((next: MindNode) => {
    setHist((h) => ({ past: [...h.past.slice(-49), h.present], present: next, future: [] }));
  }, []);
  const undo = useCallback(() => {
    if (lockRef.current) return;
    editOpenRef.current = false;
    setEditing(null);
    setHist((h) =>
      h.past.length === 0
        ? h
        : {
            past: h.past.slice(0, -1),
            present: h.past[h.past.length - 1],
            future: [h.present, ...h.future],
          }
    );
  }, []);
  const redo = useCallback(() => {
    if (lockRef.current) return;
    editOpenRef.current = false;
    setEditing(null);
    setHist((h) =>
      h.future.length === 0
        ? h
        : { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) }
    );
  }, []);

  // ---------- Khung nhìn ----------

  const fit = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { minX, minY, maxX, maxY } = layout.bounds;
    const pad = 40;
    const bw = maxX - minX + pad * 2;
    const bh = maxY - minY + pad * 2;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const scale = Math.max(MIN_SCALE, Math.min(1.1, cw / bw, ch / bh));
    setView({
      scale,
      tx: cw / 2 - ((minX + maxX) / 2) * scale,
      ty: ch / 2 - ((minY + maxY) / 2) * scale,
    });
  }, [layout]);

  const fitRef = useRef(fit);
  fitRef.current = fit;
  useLayoutEffect(() => {
    fitRef.current();
  }, [fullscreen, panelOpen]);

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    const el = containerRef.current;
    setView((v) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      const px = cx ?? (el ? el.clientWidth / 2 : 0);
      const py = cy ?? (el ? el.clientHeight / 2 : 0);
      const k = scale / v.scale;
      return { scale, tx: px - (px - v.tx) * k, ty: py - (py - v.ty) * k };
    });
  }, []);

  // Cuộn chuột: Ctrl/⌘ + cuộn để phóng to; cuộn thường chỉ di chuyển sơ đồ khi
  // đang làm việc trong khung (đã bấm vào) hoặc toàn màn hình — không chặn cuộn trang.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomAt(Math.exp(-e.deltaY * 0.0025), e.clientX - rect.left, e.clientY - rect.top);
      } else if (activeRef.current || fullscreen) {
        e.preventDefault();
        setView((v) => ({ ...v, tx: v.tx - e.deltaX, ty: v.ty - e.deltaY }));
      }
    };
    const onDocDown = (e: PointerEvent) => {
      if (!el.contains(e.target as Node)) activeRef.current = false;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    document.addEventListener("pointerdown", onDocDown);
    return () => {
      el.removeEventListener("wheel", onWheel);
      document.removeEventListener("pointerdown", onDocDown);
    };
  }, [zoomAt, fullscreen]);

  // Giữ nút đang chọn trong tầm nhìn (vd vừa thêm nút ở mép).
  useEffect(() => {
    const el = containerRef.current;
    const n = selectedId ? layout.byId.get(selectedId) : undefined;
    if (!el || !n) return;
    const margin = 40;
    setView((v) => {
      const left = (n.x - n.w / 2) * v.scale + v.tx;
      const right = (n.x + n.w / 2) * v.scale + v.tx;
      const top = (n.y - n.h / 2) * v.scale + v.ty;
      const bottom = (n.y + n.h / 2) * v.scale + v.ty;
      let dx = 0;
      let dy = 0;
      if (left < margin) dx = margin - left;
      else if (right > el.clientWidth - margin) dx = el.clientWidth - margin - right;
      if (top < margin) dy = margin - top;
      else if (bottom > el.clientHeight - margin) dy = el.clientHeight - margin - bottom;
      return dx || dy ? { ...v, tx: v.tx + dx, ty: v.ty + dy } : v;
    });
  }, [selectedId, layout]);

  useEffect(() => {
    if (!dirty || !onSave) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, onSave]);

  // ---------- Thao tác nút ----------

  function flash(kind: "ok" | "error", text: string) {
    setMessage({ kind, text });
    window.setTimeout(() => setMessage((m) => (m?.text === text ? null : m)), 3500);
  }

  function addChild(id: string) {
    if (lockRef.current) return;
    if (total >= MAX_NODES) return flash("error", `Sơ đồ tối đa ${MAX_NODES} nút.`);
    if (depthOf(tree, id) >= MAX_DEPTH) return flash("error", `Sơ đồ tối đa ${MAX_DEPTH} tầng.`);
    const next = cloneTree(tree);
    const found = findWithParent(next, id);
    if (!found) return;
    const child: MindNode = { id: newId(), text: "", children: [] };
    found.node.children = [...(found.node.children || []), child];
    if (collapsed.has(id)) {
      const c = new Set(collapsed);
      c.delete(id);
      setCollapsed(c);
    }
    commit(next);
    setSelectedId(child.id);
    beginEdit({ id: child.id, value: "", isNew: true });
  }

  function addSibling(id: string) {
    if (lockRef.current) return;
    const found = findWithParent(tree, id);
    if (!found?.parent) return addChild(id);
    if (total >= MAX_NODES) return flash("error", `Sơ đồ tối đa ${MAX_NODES} nút.`);
    const next = cloneTree(tree);
    const f = findWithParent(next, id)!;
    const sib: MindNode = { id: newId(), text: "", children: [] };
    const list = f.parent!.children || [];
    const idx = list.findIndex((c) => c.id === id);
    list.splice(idx + 1, 0, sib);
    f.parent!.children = list;
    commit(next);
    setSelectedId(sib.id);
    beginEdit({ id: sib.id, value: "", isNew: true });
  }

  function remove(id: string) {
    if (lockRef.current) return;
    const found = findWithParent(tree, id);
    if (!found?.parent) return;
    const next = cloneTree(tree);
    const f = findWithParent(next, id)!;
    const list = f.parent!.children || [];
    const idx = list.findIndex((c) => c.id === id);
    list.splice(idx, 1);
    commit(next);
    setSelectedId(list[Math.min(idx, list.length - 1)]?.id || f.parent!.id);
  }

  function move(id: string, dir: -1 | 1) {
    if (lockRef.current) return;
    const found = findWithParent(tree, id);
    if (!found?.parent) return;
    const idx = (found.parent.children || []).findIndex((c) => c.id === id);
    const to = idx + dir;
    if (to < 0 || to >= (found.parent.children || []).length) return;
    const next = cloneTree(tree);
    const list = findWithParent(next, id)!.parent!.children!;
    [list[idx], list[to]] = [list[to], list[idx]];
    commit(next);
  }

  function indent(id: string) {
    if (lockRef.current) return;
    const next = indentBranch(tree, id);
    if (!next) {
      const f = findWithParent(tree, id);
      const first = f?.parent && (f.parent.children || [])[0]?.id === id;
      return flash("error", first ? "Nút đầu nhánh không có nút phía trên để hạ cấp vào." : `Không hạ cấp được — sơ đồ tối đa ${MAX_DEPTH} tầng.`);
    }
    commit(next);
  }

  function outdent(id: string) {
    if (lockRef.current) return;
    const next = outdentBranch(tree, id);
    if (!next) return flash("error", "Nhánh cấp 1 không nâng cấp được nữa.");
    commit(next);
  }

  function rename(id: string, text: string) {
    if (lockRef.current) return;
    const next = cloneTree(tree);
    const f = findWithParent(next, id);
    const value = clampText(text, MAX_TEXT_LEN);
    if (!f || !value) return;
    f.node.text = value;
    commit(next);
  }

  function retag(id: string, tag: string) {
    if (lockRef.current) return;
    const next = cloneTree(tree);
    const f = findWithParent(next, id);
    if (!f) return;
    f.node.tag = clampText(tag, MAX_TAG_LEN) || undefined;
    commit(next);
  }

  /** Chọn nút từ dàn ý/tìm kiếm: mở các nhánh cha đang thu gọn để nút hiện trên sơ đồ. */
  function selectNode(id: string) {
    if (lockRef.current) return;
    const ancestors = pathTo(tree, id).slice(0, -1);
    if (ancestors.some((a) => collapsed.has(a.id))) {
      const c = new Set(collapsed);
      ancestors.forEach((a) => c.delete(a.id));
      setCollapsed(c);
    }
    if (editing) finishEdit("commit");
    setSelectedId(id);
  }

  function openSearch() {
    setPanelOpen(true);
    setPanelTab("outline");
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }

  function startEdit(id: string) {
    if (lockRef.current) return;
    const found = findWithParent(tree, id);
    if (!found) return;
    setSelectedId(id);
    beginEdit({ id, value: found.node.text, isNew: false });
  }

  function finishEdit(mode: "commit" | "cancel") {
    const ed = editing;
    if (!ed || !editOpenRef.current) return;
    editOpenRef.current = false;
    setEditing(null);
    const value = clampText(ed.value, MAX_TEXT_LEN);
    const found = findWithParent(tree, ed.id);
    if (ed.isNew && (mode === "cancel" || !value)) {
      // Bỏ nút vừa thêm mà chưa có chữ — gỡ luôn bước "thêm" khỏi lịch sử.
      setHist((h) =>
        h.past.length === 0
          ? h
          : { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: h.future }
      );
      setSelectedId(found?.parent?.id || tree.id);
    } else if (mode === "commit" && value && found && value !== found.node.text) {
      const next = cloneTree(tree);
      findWithParent(next, ed.id)!.node.text = value;
      if (ed.isNew) setHist((h) => ({ ...h, present: next }));
      else commit(next);
    }
    // Trả focus cho khung vẽ ngay để phím tắt tiếp theo (Ctrl+Z, Tab…) ăn luôn.
    containerRef.current?.focus({ preventScroll: true });
  }

  function toggleCollapse(id: string) {
    const c = new Set(collapsed);
    if (c.has(id)) c.delete(id);
    else c.add(id);
    setCollapsed(c);
  }

  function navigate(key: string) {
    const cur = selectedId ? layout.byId.get(selectedId) : undefined;
    if (!cur) return setSelectedId(tree.id);
    if (key === "ArrowLeft" || key === "ArrowRight") {
      const d = key === "ArrowRight" ? 1 : -1;
      const kids = layout.nodes
        .filter((n) => n.parentId === cur.id && (cur.depth > 0 || n.side === d))
        .sort((a, b) => a.y - b.y);
      if ((cur.depth === 0 || cur.side === d) && kids.length) {
        setSelectedId(kids[Math.floor((kids.length - 1) / 2)].id);
      } else if (cur.depth > 0 && cur.side === -d && cur.parentId) {
        setSelectedId(cur.parentId);
      }
      return;
    }
    const sibs = layout.nodes
      .filter((n) => n.parentId === cur.parentId && n.side === cur.side)
      .sort((a, b) => a.y - b.y);
    const i = sibs.findIndex((n) => n.id === cur.id);
    const j = key === "ArrowUp" ? i - 1 : i + 1;
    if (sibs[j]) setSelectedId(sibs[j].id);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (editing) return;
    const mod = e.ctrlKey || e.metaKey;
    if (lockRef.current) {
      // Đang lưu/tải tệp: bỏ mọi phím tắt sửa cây, chỉ cho thoát toàn màn hình.
      if (mod && ["z", "y", "s"].includes(e.key.toLowerCase())) e.preventDefault();
      else if (e.key === "Escape" && fullscreen) {
        e.preventDefault();
        e.stopPropagation();
        setFullscreen(false);
      }
      return;
    }
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      return e.shiftKey ? redo() : undo();
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      return redo();
    }
    if (mod && e.key.toLowerCase() === "s" && onSave) {
      e.preventDefault();
      return void save();
    }
    if (mod && e.key.toLowerCase() === "f") {
      e.preventDefault();
      return openSearch();
    }
    if (e.key === "Escape" && fullscreen) {
      e.preventDefault();
      e.stopPropagation();
      return setFullscreen(false);
    }
    if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      if (e.altKey && selectedId && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        return move(selectedId, e.key === "ArrowUp" ? -1 : 1);
      }
      if (e.altKey && selectedId && selectedId !== tree.id) {
        return e.key === "ArrowRight" ? indent(selectedId) : outdent(selectedId);
      }
      return navigate(e.key);
    }
    if (!selectedId) return;
    if (e.key === "Tab") {
      e.preventDefault();
      addChild(selectedId);
    } else if (e.key === "Enter") {
      e.preventDefault();
      addSibling(selectedId);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      remove(selectedId);
    } else if (e.key === "F2" || e.key === " ") {
      e.preventDefault();
      startEdit(selectedId);
    }
  }

  // ---------- Kéo nền ----------

  function onPointerDown(e: React.PointerEvent) {
    activeRef.current = true;
    if ((e.target as Element).closest("[data-node]")) return;
    if (editing) finishEdit("commit");
    dragRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    setView((v) => ({ ...v, tx: d.tx + dx, ty: d.ty + dy }));
  }
  function onPointerUp() {
    const d = dragRef.current;
    dragRef.current = null;
    if (d && !d.moved && !lockRef.current) setSelectedId(null);
  }

  // ---------- Lưu & xuất ----------

  async function save() {
    if (!onSave || saving || lockRef.current) return;
    if (editing) finishEdit("commit");
    lockRef.current = true;
    setSaving(true);
    try {
      await onSave(tree);
      setSavedJson(JSON.stringify(tree));
      flash("ok", "Đã lưu sơ đồ.");
    } catch (err: any) {
      flash("error", err?.message || "Lưu thất bại.");
    } finally {
      lockRef.current = false;
      setSaving(false);
    }
  }

  /** Đính kèm tệp vào nút `nodeId` (đã chốt lúc chọn tệp). Cây chưa lưu thì lưu trước. */
  async function attachFile(nodeId: string, file: File) {
    if (lockRef.current || editing) return;
    const root = tree;
    if (!findWithParent(root, nodeId)) return;
    const snapshot = JSON.stringify(root);
    const needsSave = snapshot !== savedJson;
    if (needsSave && !onSave) {
      setAttNotice({ kind: "error", text: "Sơ đồ này không lưu được nên chưa đính kèm tệp.", nodeId });
      return;
    }
    lockRef.current = true;
    setAttNotice(null);
    try {
      const created = await runAttachmentUpload({
        nodeId,
        file,
        usedBytes: attUsed,
        needsSave,
        save: async () => {
          const savedRoot = await onSave!(root);
          setSavedJson(snapshot);
          flash("ok", "Đã tự lưu sơ đồ trước khi đính kèm tệp.");
          return savedRoot;
        },
        upload: () => attachments.upload(nodeId, file),
        onPhase: (phase) => setAttBusy({ phase, nodeId }),
      });
      setAttNotice({ kind: "ok", text: `Đã đính kèm “${created.name}”.`, nodeId });
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        setAttNotice({ kind: "error", text: err?.message || "Tải tệp lên thất bại.", nodeId });
      }
    } finally {
      lockRef.current = false;
      setAttBusy(null);
    }
  }

  const fileBase = slugify(title || tree.text);

  async function exportAs(kind: "png" | "svg" | "md") {
    setExportOpen(false);
    try {
      if (kind === "md") {
        downloadFile(`${fileBase}.md`, mindmapToMarkdown(tree, meta), "text/markdown;charset=utf-8");
        return;
      }
      if (!svgRef.current) return;
      const out = exportSvgString(svgRef.current, layout.bounds);
      if (kind === "svg") {
        downloadFile(`${fileBase}.svg`, out.svg, "image/svg+xml;charset=utf-8");
      } else {
        const blob = await svgToPngBlob(out.svg, out.width, out.height, 2);
        downloadBlob(`${fileBase}.png`, blob);
      }
      if (collapsed.size > 0) flash("ok", "Lưu ý: nhánh đang thu gọn sẽ không có trong file.");
    } catch (err: any) {
      flash("error", err?.message || "Xuất file thất bại.");
    }
  }

  // ---------- Vẽ ----------

  const selected = selectedId ? layout.byId.get(selectedId) : undefined;
  const editNode = editing ? layout.byId.get(editing.id) : undefined;

  // useLayoutEffect: focus ngay khi ô nhập vừa gắn vào DOM, trước phím gõ tiếp
  // theo — tránh chữ đầu tiên lọt xuống khung vẽ và bị hiểu thành phím tắt.
  useLayoutEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
    // Chỉ khi bắt đầu sửa một nút mới, không phải mỗi lần gõ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  function renderNode(n: LayoutNode) {
    const files = attGroups.counts.get(n.id) || 0;
    const left = n.x - n.w / 2;
    const top = n.y - n.h / 2;
    const st = n.style;
    const isRoot = n.depth === 0;
    const isSel = n.id === selectedId;
    const rx = isRoot ? 18 : n.depth === 1 ? 12 : 9;
    const textFill = isRoot ? "#ffffff" : "#0f172a";
    const hasKids = (n.node.children || []).length > 0;
    const toggleX = n.x + n.side * (n.w / 2 + 12);
    return (
      <g
        key={n.id}
        data-node={n.id}
        className="group cursor-pointer"
        onPointerDown={(e) => {
          activeRef.current = true;
          e.stopPropagation();
          if (lockRef.current) return;
          if (editing && editing.id !== n.id) finishEdit("commit");
          setSelectedId(n.id);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          startEdit(n.id);
        }}
      >
        {isSel && (
          <rect
            data-noexport=""
            x={left - 5}
            y={top - 5}
            width={n.w + 10}
            height={n.h + 10}
            rx={rx + 5}
            fill="none"
            stroke="#2563eb"
            strokeWidth={2.5}
          />
        )}
        {isRoot ? (
          <rect x={left} y={top} width={n.w} height={n.h} rx={rx} fill="#1e293b" />
        ) : n.depth === 1 ? (
          <>
            <rect x={left} y={top} width={n.w} height={n.h} rx={rx} fill="#ffffff" />
            <rect
              x={left}
              y={top}
              width={n.w}
              height={n.h}
              rx={rx}
              fill={n.color}
              fillOpacity={0.14}
              stroke={n.color}
              strokeWidth={2}
            />
          </>
        ) : (
          <rect
            x={left}
            y={top}
            width={n.w}
            height={n.h}
            rx={rx}
            fill="#ffffff"
            stroke={n.color}
            strokeOpacity={0.5}
            strokeWidth={1.25}
          />
        )}
        <text
          x={n.x}
          textAnchor="middle"
          fontSize={st.size}
          fontWeight={st.weight}
          fill={textFill}
          fontFamily={FONT_FAMILY}
        >
          {n.lines.map((line, i) => (
            <tspan key={i} x={n.x} y={top + st.padY + i * st.lineH + st.lineH * 0.74}>
              {line || (editing?.id === n.id ? "" : "…")}
            </tspan>
          ))}
        </text>
        {n.node.tag && (
          <text
            x={n.x}
            y={top + st.padY + n.lines.length * st.lineH + 12}
            textAnchor="middle"
            fontSize={11}
            fontWeight={500}
            fill={n.color}
            fontFamily={FONT_FAMILY}
          >
            {n.node.tag}
          </text>
        )}
        {files > 0 && (
          // Badge số tệp: chỉ trên màn hình (data-noexport), bấm để mở mục Tệp đính kèm.
          <g
            data-noexport=""
            onClick={(e) => {
              e.stopPropagation();
              setPanelOpen(true);
              setPanelTab("inspector");
            }}
          >
            <title>{`${files} tệp đính kèm — bấm để xem`}</title>
            <rect x={left + n.w - 22} y={top - 9} width={30} height={17} rx={8.5} fill="#fef3c7" stroke="#f59e0b" strokeWidth={1} />
            <text
              x={left + n.w - 7}
              y={top + 3}
              textAnchor="middle"
              fontSize={10}
              fontWeight={600}
              fill="#92400e"
              fontFamily={FONT_FAMILY}
            >
              {`📎${files > 99 ? "99+" : files}`}
            </text>
          </g>
        )}
        {!isRoot && hasKids && n.hiddenCount > 0 && (
          <g
            onPointerDown={(e) => {
              e.stopPropagation();
              toggleCollapse(n.id);
            }}
          >
            <circle cx={toggleX} cy={n.y} r={10} fill={n.color} />
            <text
              x={toggleX}
              y={n.y + 3.5}
              textAnchor="middle"
              fontSize={10}
              fontWeight={700}
              fill="#ffffff"
              fontFamily={FONT_FAMILY}
            >
              {n.hiddenCount > 99 ? "99+" : n.hiddenCount}
            </text>
          </g>
        )}
        {!isRoot && hasKids && n.hiddenCount === 0 && (
          <g
            data-noexport=""
            className={isSel ? "" : "opacity-0 group-hover:opacity-100"}
            onPointerDown={(e) => {
              e.stopPropagation();
              toggleCollapse(n.id);
            }}
          >
            <circle cx={toggleX} cy={n.y} r={8} fill="#ffffff" stroke={n.color} strokeWidth={1.5} />
            <path
              d={`M ${toggleX - 4} ${n.y} H ${toggleX + 4}`}
              stroke={n.color}
              strokeWidth={1.75}
              strokeLinecap="round"
            />
          </g>
        )}
      </g>
    );
  }

  // Dữ liệu cho bảng Thuộc tính: vị trí nút trong nhóm anh em quyết định nút nào bấm được.
  const selFound = selectedId ? findWithParent(tree, selectedId) : null;
  const selSiblings = selFound?.parent?.children || [];
  const selIdx = selFound?.parent ? selSiblings.findIndex((c) => c.id === selectedId) : -1;
  const selectedInfo = selFound
    ? {
        node: selFound.node,
        depth: depthOf(tree, selFound.node.id),
        parentText: selFound.parent ? selFound.parent.text || "(trống)" : null,
      }
    : null;
  const nodeActions: NodeActions | null =
    selFound && selectedId
      ? {
          canMoveUp: selIdx > 0,
          canMoveDown: selIdx >= 0 && selIdx < selSiblings.length - 1,
          canIndent: selIdx > 0,
          canOutdent: !!selFound.parent && selFound.parent.id !== tree.id,
          moveUp: () => move(selectedId, -1),
          moveDown: () => move(selectedId, 1),
          indent: () => indent(selectedId),
          outdent: () => outdent(selectedId),
          addChild: () => addChild(selectedId),
          addSibling: () => addSibling(selectedId),
          remove: () => remove(selectedId),
        }
      : null;

  const canUndo = hist.past.length > 0;
  const canRedo = hist.future.length > 0;

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-[60] flex flex-col bg-white"
          : "flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white"
      }
    >
      {/* Thanh công cụ */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50/80 px-2 py-1.5">
        <ToolButton title="Thêm nhánh con (Tab)" disabled={!selectedId || locked} onClick={() => selectedId && addChild(selectedId)}>
          ＋ Nhánh con
        </ToolButton>
        <ToolButton
          title="Thêm nút cùng cấp (Enter)"
          disabled={!selectedId || locked}
          onClick={() => selectedId && addSibling(selectedId)}
        >
          ＋ Cùng cấp
        </ToolButton>
        <ToolButton title="Sửa chữ (F2 hoặc bấm đúp)" disabled={!selectedId || locked} onClick={() => selectedId && startEdit(selectedId)}>
          ✎ Sửa
        </ToolButton>
        <ToolButton
          title="Xoá nút và các nhánh con (Delete)"
          disabled={!selectedId || selectedId === tree.id || locked}
          onClick={() => selectedId && remove(selectedId)}
        >
          🗑 Xoá
        </ToolButton>
        <ToolButton
          title="Đưa lên (Alt + ↑)"
          disabled={!selectedId || selectedId === tree.id || locked}
          onClick={() => selectedId && move(selectedId, -1)}
        >
          ↑
        </ToolButton>
        <ToolButton
          title="Đưa xuống (Alt + ↓)"
          disabled={!selectedId || selectedId === tree.id || locked}
          onClick={() => selectedId && move(selectedId, 1)}
        >
          ↓
        </ToolButton>
        <Sep />
        <ToolButton title="Hoàn tác (Ctrl/⌘ + Z)" disabled={!canUndo || locked} onClick={undo}>
          ↶
        </ToolButton>
        <ToolButton title="Làm lại (Ctrl/⌘ + Shift + Z)" disabled={!canRedo || locked} onClick={redo}>
          ↷
        </ToolButton>
        <Sep />
        <ToolButton title="Thu nhỏ" onClick={() => zoomAt(1 / 1.2)}>
          −
        </ToolButton>
        <span className="w-11 text-center text-xs tabular-nums text-slate-500">
          {Math.round(view.scale * 100)}%
        </span>
        <ToolButton title="Phóng to" onClick={() => zoomAt(1.2)}>
          +
        </ToolButton>
        <ToolButton title="Vừa khung" onClick={fit}>
          ⤢ Vừa khung
        </ToolButton>
        {collapsed.size > 0 && (
          <ToolButton title="Mở rộng tất cả nhánh" onClick={() => setCollapsed(new Set())}>
            Mở hết
          </ToolButton>
        )}
        <ToolButton
          title={panelOpen ? "Ẩn dàn ý & thuộc tính" : "Hiện dàn ý & thuộc tính (Ctrl/⌘ + F để tìm)"}
          active={panelOpen}
          onClick={() => setPanelOpen((o) => !o)}
        >
          ☰ Dàn ý
        </ToolButton>
        <ToolButton
          title={fullscreen ? "Thoát toàn màn hình (Esc)" : "Toàn màn hình"}
          active={fullscreen}
          onClick={() => setFullscreen((f) => !f)}
        >
          {fullscreen ? "✕ Thoát" : "⛶ Toàn màn hình"}
        </ToolButton>

        <div className="ml-auto flex items-center gap-1.5">
          <div className="relative">
            <button
              type="button"
              className="btn-secondary !px-3 !py-1.5 text-xs"
              onClick={() => setExportOpen((o) => !o)}
            >
              ⬇ Tải về
            </button>
            {exportOpen && (
              <div className="absolute right-0 z-10 mt-1 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg">
                <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => exportAs("png")}>
                  Ảnh PNG (in, chiếu)
                </button>
                <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => exportAs("svg")}>
                  Ảnh SVG (phóng không vỡ)
                </button>
                <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => exportAs("md")}>
                  Dàn ý Markdown
                </button>
              </div>
            )}
          </div>
          {onSave && (
            <button
              type="button"
              className="btn-primary !px-3 !py-1.5 text-xs"
              disabled={!dirty || locked}
              onClick={save}
              title="Lưu (Ctrl/⌘ + S)"
            >
              {saving || attBusy?.phase === "saving" ? "Đang lưu…" : dirty ? "💾 Lưu" : "✓ Đã lưu"}
            </button>
          )}
        </div>
      </div>

      <div className={`flex min-h-0 flex-col lg:flex-row ${fullscreen ? "flex-1" : ""}`}>
      {/* Vùng vẽ. Không dùng flex-1 khi xếp cột mà khung ngoài không có chiều cao
          cố định — vùng vẽ chỉ chứa phần tử absolute nên sẽ sập về 0. */}
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label="Vùng vẽ sơ đồ tư duy — dùng phím mũi tên để chọn nút"
        className={`relative min-w-0 select-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-200 ${
          fullscreen ? "min-h-[240px] flex-1" : "h-[420px] sm:h-[560px] lg:flex-1"
        }`}
        style={{
          backgroundColor: "#f8fafc",
          backgroundImage: "radial-gradient(#e2e8f0 1px, transparent 1px)",
          backgroundSize: `${20 * view.scale}px ${20 * view.scale}px`,
          backgroundPosition: `${view.tx}px ${view.ty}px`,
          touchAction: "none",
        }}
      >
        <svg
          ref={svgRef}
          className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing"
          fontFamily={FONT_FAMILY}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <g data-viewport="" transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
            {layout.edges.map((e) => (
              <path
                key={`${e.from}-${e.to}`}
                d={e.d}
                fill="none"
                stroke={e.color}
                strokeWidth={e.width}
                strokeLinecap="round"
                strokeOpacity={0.85}
              />
            ))}
            {layout.nodes.map(renderNode)}
          </g>
        </svg>

        {editing && editNode && (
          <textarea
            ref={editRef}
            value={editing.value}
            rows={1}
            maxLength={MAX_TEXT_LEN}
            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
            onBlur={() => finishEdit("commit")}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                finishEdit("commit");
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                finishEdit("cancel");
              }
            }}
            placeholder="Nhập nội dung…"
            className="absolute z-10 resize-none rounded-lg border-2 border-blue-500 bg-white px-2 py-1 text-center text-slate-900 shadow-lg outline-none"
            style={{
              left: (editNode.x - Math.max(editNode.w, 180) / 2) * view.scale + view.tx,
              top: (editNode.y - editNode.h / 2) * view.scale + view.ty,
              width: Math.max(editNode.w, 180) * view.scale,
              minHeight: editNode.h * view.scale,
              fontSize: Math.max(12, editNode.style.size * view.scale),
              fontWeight: editNode.style.weight,
              lineHeight: 1.3,
            }}
          />
        )}

        {message && (
          <div
            className={`pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full px-4 py-2 text-xs font-medium shadow ${
              message.kind === "ok" ? "bg-slate-800 text-white" : "bg-rose-600 text-white"
            }`}
          >
            {message.text}
          </div>
        )}
      </div>

      {panelOpen && (
        <aside
          className={`shrink-0 border-t border-slate-200 bg-white lg:w-72 lg:border-l lg:border-t-0 ${
            fullscreen ? "h-72 lg:h-auto" : "h-80 lg:h-[560px]"
          }`}
        >
          <MindmapSidePanel
            ref={searchRef}
            tab={panelTab}
            onTab={setPanelTab}
            root={tree}
            selectedId={selectedId}
            collapsed={collapsed}
            onSelect={selectNode}
            onToggle={toggleCollapse}
            selected={selectedInfo}
            tags={tags}
            onRename={rename}
            onRetag={retag}
            actions={nodeActions}
            query={query}
            onQuery={setQuery}
            attachCounts={attGroups.counts}
            locked={locked}
            attachments={
              selectedId && selFound
                ? {
                    nodeId: selectedId,
                    available: artifactId != null,
                    list: attachments.list,
                    items: attItems.filter((a) => a.node_id === selectedId),
                    orphans: attGroups.orphans,
                    usedBytes: attUsed,
                    busy: attBusy,
                    locked,
                    willSaveFirst: dirty,
                    notice: attNotice,
                    onPick: (file) => attachFile(selectedId, file),
                    onRetry: attachments.reload,
                    onDownload: attachments.download,
                    onDelete: attachments.remove,
                  }
                : null
            }
          />
        </aside>
      )}
      </div>

      <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 px-3 py-2 text-[11px] text-slate-500">
        <span className="hidden sm:inline">
          <b>Tab</b> nhánh con · <b>Enter</b> cùng cấp · <b>bấm đúp</b>/<b>F2</b> sửa · <b>Del</b> xoá ·{" "}
          <b>↑↓←→</b> chọn nút · <b>Alt+↑↓</b> đổi thứ tự · <b>Alt+←→</b> nâng/hạ cấp · <b>Ctrl/⌘+F</b> tìm ·{" "}
          <b>Ctrl/⌘+Z</b> hoàn tác · kéo nền để dời · <b>Ctrl/⌘+cuộn</b> phóng to
        </span>
        <span className="sm:hidden">Chạm nút để chọn · kéo nền để dời · sửa trong mục Thuộc tính</span>
        <span className="tabular-nums">
          {total} nút{selected ? ` · đang chọn: ${selected.node.text || "(trống)"}` : ""}
        </span>
      </div>
    </div>
  );
}
