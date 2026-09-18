// Sơ đồ tư duy (module 6): kiểu dữ liệu, thao tác cây, bố cục và xuất file.
// Không dùng thư viện ngoài — bố cục tự tính, vẽ bằng SVG.

export interface MindNode {
  id: string;
  text: string;
  /** Nhãn phụ, vd hình thức tổ chức hoạt động ("Hoạt động góc"). */
  tag?: string;
  children?: MindNode[];
}

export interface MindmapContent {
  map_type: string;
  map_type_name: string;
  topic: string;
  age_group: string;
  age_group_name: string;
  weeks: number;
  root: MindNode;
  warnings: string[];
}

export interface MindmapMeta {
  map_types: { key: string; name_vi: string; hint?: string }[];
  age_groups: { key: string; name_vi: string }[];
  domains: Record<string, { key: string; name_vi: string }[]>;
  notice: string;
}

// ---------- Chuẩn hoá dữ liệu từ backend ----------

let idCounter = 0;
export function newId(): string {
  idCounter += 1;
  return `c${Date.now().toString(36)}${idCounter}`;
}

function toNode(x: any): MindNode {
  const children = Array.isArray(x?.children) ? x.children.map(toNode) : [];
  return {
    id: typeof x?.id === "string" && x.id ? x.id : newId(),
    text: typeof x?.text === "string" ? x.text : String(x?.text ?? ""),
    tag: typeof x?.tag === "string" && x.tag ? x.tag : undefined,
    children,
  };
}

/** Đảm bảo id duy nhất (dữ liệu cũ/sửa tay có thể trùng). */
function dedupeIds(root: MindNode) {
  const seen = new Set<string>();
  walk(root, (n) => {
    if (seen.has(n.id)) n.id = newId();
    seen.add(n.id);
  });
}

export function normalizeMindmap(content: any): MindmapContent {
  const c = content || {};
  const root = toNode(c.root || { text: c.topic || "Chủ đề" });
  dedupeIds(root);
  return {
    map_type: String(c.map_type || ""),
    map_type_name: String(c.map_type_name || "Sơ đồ tư duy"),
    topic: String(c.topic || root.text),
    age_group: String(c.age_group || ""),
    age_group_name: String(c.age_group_name || ""),
    weeks: Number(c.weeks) || 0,
    root,
    warnings: Array.isArray(c.warnings) ? c.warnings.map(String) : [],
  };
}

// ---------- Thao tác cây (luôn trên bản sao) ----------

export function walk(n: MindNode, fn: (n: MindNode, parent: MindNode | null) => void, parent: MindNode | null = null) {
  fn(n, parent);
  (n.children || []).forEach((c) => walk(c, fn, n));
}

export function cloneTree(n: MindNode): MindNode {
  return {
    id: n.id,
    text: n.text,
    tag: n.tag,
    children: (n.children || []).map(cloneTree),
  };
}

export function findWithParent(
  root: MindNode,
  id: string
): { node: MindNode; parent: MindNode | null } | null {
  let found: { node: MindNode; parent: MindNode | null } | null = null;
  walk(root, (n, p) => {
    if (!found && n.id === id) found = { node: n, parent: p };
  });
  return found;
}

export function countNodes(n: MindNode): number {
  return 1 + (n.children || []).reduce((s, c) => s + countNodes(c), 0);
}

export const MAX_NODES = 400;
export const MAX_DEPTH = 6;
/** Khớp giới hạn backend khi lưu sơ đồ đã sửa (đếm theo ký tự Unicode). */
export const MAX_TEXT_LEN = 200;
export const MAX_TAG_LEN = 40;

/** Gộp khoảng trắng và cắt theo số ký tự Unicode (không cắt đôi ký tự). */
export function clampText(s: string, max: number): string {
  return Array.from((s || "").replace(/\s+/g, " ").trim()).slice(0, max).join("");
}

export function depthOf(root: MindNode, id: string): number {
  let d = -1;
  const rec = (n: MindNode, depth: number) => {
    if (n.id === id) d = depth;
    (n.children || []).forEach((c) => rec(c, depth + 1));
  };
  rec(root, 0);
  return d;
}

/** Số tầng của nhánh tính cả chính nó (lá = 1). */
export function subtreeHeight(n: MindNode): number {
  return 1 + Math.max(0, ...(n.children || []).map(subtreeHeight));
}

/** Đường từ gốc tới nút (gồm cả hai đầu); rỗng nếu không thấy. */
export function pathTo(root: MindNode, id: string): MindNode[] {
  if (root.id === id) return [root];
  for (const c of root.children || []) {
    const p = pathTo(c, id);
    if (p.length) return [root, ...p];
  }
  return [];
}

/**
 * Chuyển nhánh `id` thành con của `newParentId` tại vị trí `index` (trên bản
 * sao). Trả null nếu nước đi không hợp lệ: gốc, chuyển vào chính nhánh con của
 * mình, hoặc vượt giới hạn tầng.
 */
export function moveBranch(root: MindNode, id: string, newParentId: string, index: number): MindNode | null {
  if (id === root.id) return null;
  const src = findWithParent(root, id);
  if (!src?.parent) return null;
  if (pathTo(src.node, newParentId).length) return null; // đích nằm trong nhánh đang chuyển
  const targetDepth = depthOf(root, newParentId);
  if (targetDepth < 0 || targetDepth + subtreeHeight(src.node) > MAX_DEPTH) return null;

  const next = cloneTree(root);
  const from = findWithParent(next, id)!;
  const fromList = from.parent!.children!;
  const fromIdx = fromList.findIndex((c) => c.id === id);
  fromList.splice(fromIdx, 1);
  const target = findWithParent(next, newParentId)!.node;
  const list = target.children || [];
  list.splice(Math.max(0, Math.min(index, list.length)), 0, from.node);
  target.children = list;
  return next;
}

/** Hạ cấp: thành con cuối của anh em đứng trước (Tab trong XMind/outline). */
export function indentBranch(root: MindNode, id: string): MindNode | null {
  const f = findWithParent(root, id);
  if (!f?.parent) return null;
  const sibs = f.parent.children || [];
  const idx = sibs.findIndex((c) => c.id === id);
  if (idx <= 0) return null;
  const prev = sibs[idx - 1];
  return moveBranch(root, id, prev.id, (prev.children || []).length);
}

/** Nâng cấp: ra ngang hàng với cha, đứng ngay sau cha. */
export function outdentBranch(root: MindNode, id: string): MindNode | null {
  const f = findWithParent(root, id);
  if (!f?.parent) return null;
  const gp = findWithParent(root, f.parent.id)?.parent;
  if (!gp) return null;
  const pIdx = (gp.children || []).findIndex((c) => c.id === f.parent!.id);
  return moveBranch(root, id, gp.id, pIdx + 1);
}

/** Bỏ dấu tiếng Việt + chữ thường để tìm kiếm không phân biệt dấu. */
export function foldText(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
}

/** Mọi nhãn phụ (tag) đang dùng trong sơ đồ — gợi ý khi sửa tag. */
export function collectTags(root: MindNode): string[] {
  const set = new Set<string>();
  walk(root, (n) => {
    if (n.tag) set.add(n.tag);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "vi"));
}

// ---------- Bố cục ----------

export const BRANCH_COLORS = [
  "#6366f1", // indigo
  "#10b981", // emerald
  "#f59e0b", // amber
  "#f43f5e", // rose
  "#0ea5e9", // sky
  "#8b5cf6", // violet
  "#f97316", // orange
  "#14b8a6", // teal
];

export const FONT_FAMILY =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

interface LevelStyle {
  size: number;
  weight: number;
  lineH: number;
  padX: number;
  padY: number;
  maxW: number;
  minW: number;
}

export function levelStyle(depth: number): LevelStyle {
  if (depth === 0)
    return { size: 20, weight: 700, lineH: 26, padX: 24, padY: 16, maxW: 260, minW: 120 };
  if (depth === 1)
    return { size: 15, weight: 600, lineH: 20, padX: 16, padY: 10, maxW: 220, minW: 60 };
  return { size: 13.5, weight: 400, lineH: 18, padX: 12, padY: 7, maxW: 220, minW: 40 };
}

const TAG_SIZE = 11;
const TAG_LINE_H = 16;

export interface LayoutNode {
  id: string;
  node: MindNode;
  parentId: string | null;
  depth: number;
  /** 1 = bên phải gốc, -1 = bên trái, 0 = gốc. */
  side: 1 | -1 | 0;
  x: number; // tâm
  y: number; // tâm
  w: number;
  h: number;
  lines: string[];
  color: string;
  style: LevelStyle;
  hiddenCount: number;
  /** Thứ tự hiển thị trong nhóm anh em (dùng cho phím mũi tên). */
  order: number;
}

export interface LayoutEdge {
  from: string;
  to: string;
  d: string;
  color: string;
  width: number;
}

export interface Layout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  byId: Map<string, LayoutNode>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

let measureCtx: CanvasRenderingContext2D | null = null;
function textWidth(text: string, size: number, weight: number): number {
  if (typeof document !== "undefined") {
    if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
    if (measureCtx) {
      measureCtx.font = `${weight} ${size}px ${FONT_FAMILY}`;
      return measureCtx.measureText(text).width;
    }
  }
  return text.length * size * 0.55;
}

function wrap(text: string, st: LevelStyle): string[] {
  const maxText = st.maxW - st.padX * 2;
  const words = (text || " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const tryLine = cur ? `${cur} ${word}` : word;
    if (textWidth(tryLine, st.size, st.weight) <= maxText) {
      cur = tryLine;
      continue;
    }
    if (cur) lines.push(cur);
    // Từ quá dài (URL, chuỗi liền) — cắt theo ký tự.
    let rest = word;
    while (textWidth(rest, st.size, st.weight) > maxText && rest.length > 1) {
      let i = rest.length - 1;
      while (i > 1 && textWidth(rest.slice(0, i), st.size, st.weight) > maxText) i--;
      lines.push(rest.slice(0, i));
      rest = rest.slice(i);
    }
    cur = rest;
  }
  if (cur) lines.push(cur);
  return lines;
}

const H_GAP = (depth: number) => (depth === 0 ? 64 : depth === 1 ? 40 : 30);
const V_GAP = (depth: number) => (depth === 0 ? 26 : depth === 1 ? 12 : 8);

export function computeLayout(root: MindNode, collapsed: Set<string>): Layout {
  const measured = new Map<string, { w: number; h: number; lines: string[]; style: LevelStyle }>();

  const measure = (n: MindNode, depth: number) => {
    const style = levelStyle(depth);
    const lines = wrap(n.text, style);
    const widest = Math.max(
      ...lines.map((l) => textWidth(l, style.size, style.weight)),
      n.tag ? textWidth(n.tag, TAG_SIZE, 500) + 12 : 0
    );
    const w = Math.max(style.minW, Math.ceil(widest) + style.padX * 2);
    const h = lines.length * style.lineH + style.padY * 2 + (n.tag ? TAG_LINE_H : 0);
    measured.set(n.id, { w, h, lines, style });
    (n.children || []).forEach((c) => measure(c, depth + 1));
  };
  measure(root, 0);

  const visibleChildren = (n: MindNode) => (collapsed.has(n.id) ? [] : n.children || []);

  const heightCache = new Map<string, number>();
  const blockHeight = (n: MindNode, depth: number): number => {
    const cached = heightCache.get(n.id);
    if (cached !== undefined) return cached;
    const kids = visibleChildren(n);
    const own = measured.get(n.id)!.h;
    let sum = 0;
    kids.forEach((c, i) => {
      sum += blockHeight(c, depth + 1) + (i > 0 ? V_GAP(depth + 1) : 0);
    });
    const h = Math.max(own, sum);
    heightCache.set(n.id, h);
    return h;
  };

  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];

  const place = (
    n: MindNode,
    parent: LayoutNode | null,
    depth: number,
    side: 1 | -1,
    cx: number,
    top: number,
    color: string,
    order: number
  ) => {
    const m = measured.get(n.id)!;
    const bh = blockHeight(n, depth);
    const cy = top + bh / 2;
    const ln: LayoutNode = {
      id: n.id,
      node: n,
      parentId: parent ? parent.id : null,
      depth,
      side,
      x: cx,
      y: cy,
      w: m.w,
      h: m.h,
      lines: m.lines,
      color,
      style: m.style,
      hiddenCount: collapsed.has(n.id) ? countNodes(n) - 1 : 0,
      order,
    };
    nodes.push(ln);
    if (parent) edges.push(edgeBetween(parent, ln));
    const kids = visibleChildren(n);
    let total = 0;
    kids.forEach((c, i) => {
      total += blockHeight(c, depth + 1) + (i > 0 ? V_GAP(depth + 1) : 0);
    });
    let start = cy - total / 2;
    kids.forEach((c, i) => {
      const cm = measured.get(c.id)!;
      const ch = blockHeight(c, depth + 1);
      const childX = cx + side * (m.w / 2 + H_GAP(depth) + cm.w / 2);
      place(c, ln, depth + 1, side, childX, start, color, i);
      start += ch + V_GAP(depth + 1);
    });
  };

  // Gốc ở (0,0). Nhánh cấp 1 chia hai bên theo chiều cao, giữ thứ tự theo
  // chiều kim đồng hồ: bên phải trên → dưới, bên trái dưới → trên.
  const rm = measured.get(root.id)!;
  const rootLn: LayoutNode = {
    id: root.id,
    node: root,
    parentId: null,
    depth: 0,
    side: 0,
    x: 0,
    y: 0,
    w: rm.w,
    h: rm.h,
    lines: rm.lines,
    color: "#334155",
    style: rm.style,
    hiddenCount: collapsed.has(root.id) ? countNodes(root) - 1 : 0,
    order: 0,
  };
  nodes.push(rootLn);

  const kids = visibleChildren(root);
  const heights = kids.map((c) => blockHeight(c, 1));
  const totalH = heights.reduce((a, b) => a + b, 0);
  let acc = 0;
  let splitAt = kids.length;
  if (kids.length > 1) {
    splitAt = 1;
    acc = heights[0];
    while (splitAt < kids.length - 1 && acc + heights[splitAt] / 2 <= totalH / 2) {
      acc += heights[splitAt];
      splitAt++;
    }
  }
  const right = kids.slice(0, splitAt).map((c, i) => ({ c, i }));
  const left = kids
    .slice(splitAt)
    .map((c, i) => ({ c, i: i + splitAt }))
    .reverse();

  const layoutSide = (group: { c: MindNode; i: number }[], side: 1 | -1) => {
    let total = 0;
    group.forEach(({ c }, k) => {
      total += blockHeight(c, 1) + (k > 0 ? V_GAP(1) : 0);
    });
    let start = -total / 2;
    group.forEach(({ c, i }, k) => {
      const cm = measured.get(c.id)!;
      const childX = side * (rm.w / 2 + H_GAP(0) + cm.w / 2);
      place(c, rootLn, 1, side, childX, start, BRANCH_COLORS[i % BRANCH_COLORS.length], k);
      start += blockHeight(c, 1) + V_GAP(1);
    });
  };
  layoutSide(right, 1);
  layoutSide(left, -1);

  const byId = new Map(nodes.map((n) => [n.id, n]));
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  nodes.forEach((n) => {
    minX = Math.min(minX, n.x - n.w / 2 - (n.node.children?.length && n.side === -1 ? 24 : 0));
    maxX = Math.max(maxX, n.x + n.w / 2 + (n.node.children?.length && n.side === 1 ? 24 : 0));
    minY = Math.min(minY, n.y - n.h / 2);
    maxY = Math.max(maxY, n.y + n.h / 2);
  });
  return { nodes, edges, byId, bounds: { minX, minY, maxX, maxY } };
}

function edgeBetween(p: LayoutNode, c: LayoutNode): LayoutEdge {
  const side = c.side === 0 ? 1 : c.side;
  const sx = p.depth === 0 ? p.x + side * (p.w / 2 - 8) : p.x + side * (p.w / 2);
  const sy = p.y;
  const ex = c.x - side * (c.w / 2);
  const ey = c.y;
  const dx = (ex - sx) * 0.5;
  return {
    from: p.id,
    to: c.id,
    d: `M ${sx} ${sy} C ${sx + dx} ${sy}, ${ex - dx} ${ey}, ${ex} ${ey}`,
    color: c.color,
    width: c.depth === 1 ? 3 : 2,
  };
}

// ---------- Xuất file ----------

export function slugify(title: string, fallback = "so-do-tu-duy"): string {
  return (
    (title || fallback)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || fallback
  );
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Dàn ý Markdown: gốc là tiêu đề, các nhánh là danh sách lồng nhau. */
export function mindmapToMarkdown(root: MindNode, meta?: Partial<MindmapContent>): string {
  const lines: string[] = [`# ${root.text}`, ""];
  const info = [meta?.map_type_name, meta?.age_group_name, meta?.weeks ? `${meta.weeks} tuần` : ""]
    .filter(Boolean)
    .join(" · ");
  if (info) lines.push(`_${info}_`, "");
  const rec = (n: MindNode, level: number) => {
    const tag = n.tag ? ` _(${n.tag})_` : "";
    const text = level === 0 ? `**${n.text}**` : n.text;
    lines.push(`${"  ".repeat(level)}- ${text}${tag}`);
    (n.children || []).forEach((c) => rec(c, level + 1));
  };
  (root.children || []).forEach((c) => rec(c, 0));
  return lines.join("\n") + "\n";
}

/**
 * Lấy SVG đang hiển thị, bỏ các phần chỉ dùng khi sửa (viền chọn, nút thu gọn),
 * đặt viewBox bao trọn sơ đồ để xuất ra file độc lập.
 */
export function exportSvgString(svg: SVGSVGElement, bounds: Layout["bounds"], pad = 40): {
  svg: string;
  width: number;
  height: number;
} {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll("[data-noexport]").forEach((el) => el.remove());
  const g = clone.querySelector("[data-viewport]");
  if (g) g.removeAttribute("transform");
  const x = bounds.minX - pad;
  const y = bounds.minY - pad;
  const width = Math.ceil(bounds.maxX - bounds.minX + pad * 2);
  const height = Math.ceil(bounds.maxY - bounds.minY + pad * 2);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.removeAttribute("class");
  clone.removeAttribute("style");
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("x", String(x));
  bg.setAttribute("y", String(y));
  bg.setAttribute("width", String(width));
  bg.setAttribute("height", String(height));
  bg.setAttribute("fill", "#ffffff");
  clone.insertBefore(bg, clone.firstChild);
  return { svg: new XMLSerializer().serializeToString(clone), width, height };
}

export function svgToPngBlob(svgString: string, width: number, height: number, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Trình duyệt giới hạn kích thước canvas — sơ đồ rất lớn thì giảm tỉ lệ.
      const maxSide = 8000;
      const s = Math.min(scale, maxSide / width, maxSide / height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * s));
      canvas.height = Math.max(1, Math.round(height * s));
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Trình duyệt không hỗ trợ canvas"));
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Không tạo được ảnh PNG"))), "image/png");
    };
    img.onerror = () => reject(new Error("Không dựng được ảnh từ sơ đồ"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);
  });
}
