// Tệp Word/Excel đính kèm vào nút sơ đồ tư duy: kiểu dữ liệu, giới hạn và luồng
// "lưu cây rồi mới tải tệp". Không import gì để chạy được test bằng node trần
// (lib/mindmapAttachments.test.mjs). Gọi API nằm ở components/mindmap/useMindmapAttachments.

export interface MindAttachment {
  id: number;
  node_id: string;
  name: string;
  size: number;
  content_type: string;
  created_at: string;
}

const MIB = 1024 * 1024;
export const MAX_ATTACHMENT_BYTES = 10 * MIB;
export const MAX_MAP_ATTACHMENT_BYTES = 50 * MIB;
export const ATTACHMENT_EXTS = [".doc", ".docx", ".xls", ".xlsx"];
export const ATTACHMENT_ACCEPT = ATTACHMENT_EXTS.join(",");

/** 1536 -> "1,5 KB"; dùng đơn vị nhị phân khớp giới hạn máy chủ (10 MB = 10 MiB). */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 1024) return `${Math.max(0, Math.round(n || 0))} B`;
  const [v, unit] = n < MIB ? [n / 1024, "KB"] : [n / MIB, "MB"];
  const s = v >= 100 ? Math.round(v).toString() : v.toFixed(1).replace(/\.0$/, "");
  return `${s.replace(".", ",")} ${unit}`;
}

export function totalBytes(list: MindAttachment[]): number {
  return list.reduce((s, a) => s + (a.size || 0), 0);
}

/** Lý do không nhận tệp (tiếng Việt), hoặc null nếu hợp lệ. */
export function validateAttachmentFile(file: { name: string; size: number }, usedBytes: number): string | null {
  const lower = file.name.toLowerCase();
  if (!ATTACHMENT_EXTS.some((ext) => lower.endsWith(ext))) {
    return "Chỉ nhận tệp Word (.doc, .docx) hoặc Excel (.xls, .xlsx).";
  }
  if (file.size <= 0) return "Tệp rỗng, không có nội dung để tải lên.";
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `Tệp nặng ${formatBytes(file.size)}, vượt giới hạn ${formatBytes(MAX_ATTACHMENT_BYTES)} mỗi tệp.`;
  }
  if (usedBytes + file.size > MAX_MAP_ATTACHMENT_BYTES) {
    return `Sơ đồ đã dùng ${formatBytes(usedBytes)}/${formatBytes(MAX_MAP_ATTACHMENT_BYTES)} — thêm tệp này sẽ vượt giới hạn. Hãy gỡ bớt tệp cũ.`;
  }
  return null;
}

/** Tách danh sách: số tệp theo nút còn trong cây, và tệp của nút không còn trong cây. */
export function groupByLiveNodes(list: MindAttachment[], liveIds: Set<string>) {
  const counts = new Map<string, number>();
  const orphans: MindAttachment[] = [];
  for (const a of list) {
    if (liveIds.has(a.node_id)) counts.set(a.node_id, (counts.get(a.node_id) || 0) + 1);
    else orphans.push(a);
  }
  return { counts, orphans };
}

/** Cây (dạng thô từ máy chủ) có nút mang id này không. */
export function treeHasId(root: any, id: string): boolean {
  if (!root || typeof root !== "object") return false;
  if (root.id === id) return true;
  return Array.isArray(root.children) && root.children.some((c: any) => treeHasId(c, id));
}

export type UploadPhase = "saving" | "uploading";

/**
 * Luồng tải tệp cho một nút đã chốt id từ trước:
 * kiểm tệp → (nếu cây có thay đổi chưa lưu) lưu cây → xác nhận máy chủ còn giữ
 * id nút → tải lên. Lưu thất bại hoặc máy chủ đổi id thì KHÔNG tải lên.
 * `save` trả cây máy chủ đã lưu (nếu có) để đối chiếu.
 */
export async function runAttachmentUpload<T>(o: {
  nodeId: string;
  file: { name: string; size: number };
  usedBytes: number;
  needsSave: boolean;
  save: () => Promise<unknown>;
  upload: () => Promise<T>;
  onPhase: (p: UploadPhase) => void;
}): Promise<T> {
  const problem = validateAttachmentFile(o.file, o.usedBytes);
  if (problem) throw new Error(problem);
  if (o.needsSave) {
    o.onPhase("saving");
    let savedRoot: unknown;
    try {
      savedRoot = await o.save();
    } catch (err: any) {
      throw new Error(`Chưa lưu được sơ đồ nên chưa tải tệp lên: ${err?.message || "lỗi không rõ"}`);
    }
    if (savedRoot != null && !treeHasId(savedRoot, o.nodeId)) {
      throw new Error("Sơ đồ đã lưu nhưng máy chủ không còn nhận ra nút này, nên chưa tải tệp lên. Hãy tải lại trang rồi thử lại.");
    }
  }
  o.onPhase("uploading");
  return o.upload();
}
