"use client";

import { forwardRef, useMemo, useState } from "react";
import { MAX_TAG_LEN, MAX_TEXT_LEN, type MindNode, foldText, walk } from "@/lib/mindmap";
import MindmapAttachments, { type AttachmentsProps } from "./MindmapAttachments";

// Bảng bên của trình sửa sơ đồ: Dàn ý (tìm/chọn nút) và Thuộc tính (sửa chữ,
// nhãn, di chuyển nhánh). Mọi thay đổi đi qua callback của editor để vào lịch
// sử hoàn tác chung.

export type PanelTab = "outline" | "inspector";

export interface NodeActions {
  canMoveUp: boolean;
  canMoveDown: boolean;
  canIndent: boolean;
  canOutdent: boolean;
  moveUp: () => void;
  moveDown: () => void;
  indent: () => void;
  outdent: () => void;
  addChild: () => void;
  addSibling: () => void;
  remove: () => void;
}

interface Props {
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  root: MindNode;
  selectedId: string | null;
  collapsed: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  /** Nút đang chọn kèm độ sâu và cha, null nếu chưa chọn. */
  selected: { node: MindNode; depth: number; parentText: string | null } | null;
  tags: string[];
  onRename: (id: string, text: string) => void;
  onRetag: (id: string, tag: string) => void;
  actions: NodeActions | null;
  query: string;
  onQuery: (q: string) => void;
  /** Số tệp đính kèm theo id nút (chỉ nút còn trong cây). */
  attachCounts: Map<string, number>;
  /** Đang lưu/tải tệp: khoá mọi thao tác sửa cây trong bảng. */
  locked: boolean;
  /** Mục Tệp đính kèm của nút đang chọn; null nếu chưa chọn nút. */
  attachments: AttachmentsProps | null;
}

function AttachChip({ count, selected }: { count: number; selected: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 text-[10px] font-medium tabular-nums ${
        selected ? "bg-indigo-500 text-white" : "bg-amber-100 text-amber-800"
      }`}
      aria-label={`${count} tệp đính kèm`}
      title={`${count} tệp đính kèm`}
    >
      📎{count}
    </span>
  );
}

function countDesc(n: MindNode): number {
  return (n.children || []).reduce((s, c) => s + 1 + countDesc(c), 0);
}

function OutlineRow({
  node,
  depth,
  selectedId,
  collapsed,
  onSelect,
  onToggle,
  attachCounts,
}: {
  node: MindNode;
  depth: number;
  selectedId: string | null;
  collapsed: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  attachCounts: Map<string, number>;
}) {
  const kids = node.children || [];
  const isCollapsed = collapsed.has(node.id);
  const isSel = node.id === selectedId;
  const files = attachCounts.get(node.id) || 0;
  return (
    <li>
      <div
        className={`group flex items-center gap-1 rounded-lg pr-1 ${
          isSel ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-100"
        }`}
        style={{ paddingLeft: depth * 14 }}
      >
        {kids.length > 0 ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            aria-label={isCollapsed ? "Mở nhánh" : "Thu gọn nhánh"}
            aria-expanded={!isCollapsed}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] ${
              isSel ? "text-indigo-100 hover:bg-indigo-500" : "text-slate-400 hover:bg-slate-200"
            }`}
          >
            {isCollapsed ? "▶" : "▼"}
          </button>
        ) : (
          <span className="h-6 w-6 shrink-0" />
        )}
        <button
          type="button"
          data-outline-id={node.id}
          onClick={() => onSelect(node.id)}
          aria-current={isSel ? "true" : undefined}
          className={`min-w-0 flex-1 py-1 text-left text-[13px] leading-snug ${depth === 0 ? "font-semibold" : ""}`}
        >
          <span className="block truncate">{node.text || <em className="opacity-60">(trống)</em>}</span>
          {node.tag && (
            <span className={`block truncate text-[11px] ${isSel ? "text-indigo-100" : "text-slate-400"}`}>
              #{node.tag}
            </span>
          )}
        </button>
        {files > 0 && <AttachChip count={files} selected={isSel} />}
        {isCollapsed && kids.length > 0 && (
          <span className={`shrink-0 text-[10px] tabular-nums ${isSel ? "text-indigo-100" : "text-slate-400"}`}>
            +{countDesc(node)}
          </span>
        )}
      </div>
      {!isCollapsed && kids.length > 0 && (
        <ul>
          {kids.map((c) => (
            <OutlineRow
              key={c.id}
              node={c}
              depth={depth + 1}
              selectedId={selectedId}
              collapsed={collapsed}
              onSelect={onSelect}
              onToggle={onToggle}
              attachCounts={attachCounts}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function ActButton({
  onClick,
  disabled,
  children,
  title,
  danger,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
        danger
          ? "border-rose-200 text-rose-600 hover:bg-rose-50"
          : "border-slate-200 text-slate-700 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function Inspector({
  selected,
  tags,
  onRename,
  onRetag,
  actions,
  locked,
}: Pick<Props, "selected" | "tags" | "onRename" | "onRetag" | "actions" | "locked">) {
  const node = selected?.node;
  const [text, setText] = useState(node?.text || "");
  const [tag, setTag] = useState(node?.tag || "");

  if (!selected || !node || !actions) {
    return (
      <p className="px-1 py-6 text-center text-sm text-slate-400">
        Chọn một nút trên sơ đồ hoặc trong dàn ý để sửa.
      </p>
    );
  }

  const commitText = () => {
    const v = text.replace(/\s+/g, " ").trim();
    if (!v) return setText(node.text); // không cho nút rỗng
    if (v !== node.text) onRename(node.id, v);
  };
  const commitTag = (value = tag) => {
    const v = value.replace(/\s+/g, " ").trim();
    if (v !== (node.tag || "")) onRetag(node.id, v);
  };
  const isRoot = selected.depth === 0;

  return (
    // fieldset disabled: khoá toàn bộ ô nhập/nút sửa cây khi đang lưu hoặc tải tệp.
    <fieldset disabled={locked} className="min-w-0 space-y-4 disabled:opacity-60">
      <p className="text-[11px] text-slate-500">
        {isRoot ? "Chủ đề trung tâm" : `Tầng ${selected.depth}${selected.parentText ? ` · thuộc “${selected.parentText}”` : ""}`}
        {(node.children || []).length > 0 && ` · ${(node.children || []).length} nhánh con`}
      </p>
      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor="mm-insp-text">
          Nội dung
        </label>
        <textarea
          id="mm-insp-text"
          rows={3}
          maxLength={MAX_TEXT_LEN}
          className="input resize-y !py-2 text-[13px]"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commitText();
            } else if (e.key === "Escape") {
              setText(node.text);
            }
          }}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor="mm-insp-tag">
          Nhãn phụ{" "}
          <span className="font-normal text-slate-400">(vd hình thức tổ chức, tối đa {MAX_TAG_LEN} ký tự)</span>
        </label>
        <div className="flex gap-1.5">
          <input
            id="mm-insp-tag"
            list="mm-tag-options"
            maxLength={MAX_TAG_LEN}
            className="input !py-2 text-[13px]"
            placeholder="Không có nhãn"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            onBlur={() => commitTag()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitTag();
              } else if (e.key === "Escape") {
                setTag(node.tag || "");
              }
            }}
          />
          {node.tag && (
            <button
              type="button"
              className="btn-secondary !px-2.5 !py-1.5 text-xs"
              title="Bỏ nhãn"
              onClick={() => {
                setTag("");
                commitTag("");
              }}
            >
              ✕
            </button>
          )}
        </div>
        <datalist id="mm-tag-options">
          {tags.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-slate-600">Sắp xếp nhánh</p>
        <div className="grid grid-cols-2 gap-1.5">
          <ActButton title="Alt + ↑" onClick={actions.moveUp} disabled={!actions.canMoveUp}>
            ↑ Lên trên
          </ActButton>
          <ActButton title="Alt + ↓" onClick={actions.moveDown} disabled={!actions.canMoveDown}>
            ↓ Xuống dưới
          </ActButton>
          <ActButton title="Alt + ← — ra ngang hàng với nút cha" onClick={actions.outdent} disabled={!actions.canOutdent}>
            ⇤ Nâng cấp
          </ActButton>
          <ActButton
            title="Alt + → — vào làm nhánh con của nút phía trên"
            onClick={actions.indent}
            disabled={!actions.canIndent}
          >
            ⇥ Hạ cấp
          </ActButton>
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-semibold text-slate-600">Thêm / xoá</p>
        <div className="grid grid-cols-2 gap-1.5">
          <ActButton title="Tab" onClick={actions.addChild}>
            ＋ Nhánh con
          </ActButton>
          <ActButton title="Enter" onClick={actions.addSibling} disabled={isRoot}>
            ＋ Cùng cấp
          </ActButton>
          <ActButton title="Delete" onClick={actions.remove} disabled={isRoot} danger>
            🗑 Xoá nhánh
          </ActButton>
        </div>
      </div>
    </fieldset>
  );
}

const MindmapSidePanel = forwardRef<HTMLInputElement, Props>(function MindmapSidePanel(props, searchRef) {
  const { tab, onTab, root, selectedId, collapsed, onSelect, onToggle, query, onQuery, attachCounts } = props;

  const matches = useMemo(() => {
    const q = foldText(query.trim());
    if (!q) return [];
    const out: { node: MindNode; path: string }[] = [];
    const rec = (n: MindNode, trail: string[]) => {
      if (foldText(n.text).includes(q) || (n.tag && foldText(n.tag).includes(q))) {
        out.push({ node: n, path: trail.join(" › ") });
      }
      (n.children || []).forEach((c) => rec(c, [...trail, n.text || "(trống)"]));
    };
    rec(root, []);
    return out;
  }, [query, root]);

  const nodeCount = useMemo(() => {
    let k = 0;
    walk(root, () => {
      k += 1;
    });
    return k;
  }, [root]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex border-b border-slate-200" role="tablist">
        {(
          [
            ["outline", "Dàn ý"],
            ["inspector", "Thuộc tính"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => onTab(key)}
            className={`flex-1 px-3 py-2 text-xs font-semibold transition ${
              tab === key ? "border-b-2 border-indigo-600 text-indigo-700" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {label}
            {key === "inspector" && selectedId && (attachCounts.get(selectedId) || 0) > 0 && (
              <span className="ml-1 font-normal text-amber-700">📎{attachCounts.get(selectedId)}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "outline" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="p-2">
            <input
              ref={searchRef}
              type="search"
              className="input !py-2 text-[13px]"
              placeholder="Tìm nút (Ctrl/⌘ + F)…"
              aria-label="Tìm nút trong sơ đồ"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches[0]) {
                  e.preventDefault();
                  onSelect(matches[0].node.id);
                } else if (e.key === "Escape") {
                  onQuery("");
                }
              }}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {query.trim() ? (
              matches.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">Không có nút nào khớp.</p>
              ) : (
                <>
                  <p className="px-1 pb-1 text-[11px] text-slate-500">{matches.length} kết quả</p>
                  <ul className="space-y-0.5">
                    {matches.map(({ node, path }) => (
                      <li key={node.id}>
                        <button
                          type="button"
                          onClick={() => onSelect(node.id)}
                          className={`w-full rounded-lg px-2 py-1.5 text-left ${
                            node.id === selectedId ? "bg-indigo-600 text-white" : "hover:bg-slate-100"
                          }`}
                        >
                          <span className="flex items-center gap-1">
                            <span className="block min-w-0 flex-1 truncate text-[13px]">{node.text || "(trống)"}</span>
                            {(attachCounts.get(node.id) || 0) > 0 && (
                              <AttachChip count={attachCounts.get(node.id)!} selected={node.id === selectedId} />
                            )}
                          </span>
                          {path && (
                            <span
                              className={`block truncate text-[11px] ${
                                node.id === selectedId ? "text-indigo-100" : "text-slate-400"
                              }`}
                            >
                              {path}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )
            ) : (
              <ul aria-label={`Dàn ý sơ đồ, ${nodeCount} nút`}>
                <OutlineRow
                  node={root}
                  depth={0}
                  selectedId={selectedId}
                  collapsed={collapsed}
                  onSelect={onSelect}
                  onToggle={onToggle}
                  attachCounts={attachCounts}
                />
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <Inspector
            // Dựng lại form khi đổi nút hoặc khi nội dung đổi từ nơi khác (hoàn tác, sửa trên sơ đồ).
            key={`${props.selected?.node.id}|${props.selected?.node.text}|${props.selected?.node.tag || ""}`}
            selected={props.selected}
            tags={props.tags}
            onRename={props.onRename}
            onRetag={props.onRetag}
            actions={props.actions}
            locked={props.locked}
          />
          {props.attachments && (
            <div className="mt-4">
              <MindmapAttachments key={props.attachments.nodeId} {...props.attachments} />
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default MindmapSidePanel;
