// Chạy: node --experimental-strip-types --test lib/mindmapAttachments.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_MAP_ATTACHMENT_BYTES,
  formatBytes,
  groupByLiveNodes,
  runAttachmentUpload,
  totalBytes,
  treeHasId,
  validateAttachmentFile,
} from "./mindmapAttachments.ts";

const MIB = 1024 * 1024;
const att = (id, node_id, size) => ({ id, node_id, name: `f${id}.docx`, size, content_type: "", created_at: "" });

test("formatBytes hiển thị kiểu Việt", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1536), "1,5 KB");
  assert.equal(formatBytes(10 * MIB), "10 MB");
  assert.equal(formatBytes(2.25 * MIB), "2,3 MB");
});

test("validateAttachmentFile: đuôi, rỗng, 10 MiB/tệp, 50 MiB/sơ đồ", () => {
  assert.equal(validateAttachmentFile({ name: "a.DOCX", size: 10 }, 0), null);
  assert.equal(validateAttachmentFile({ name: "a.xls", size: MAX_ATTACHMENT_BYTES }, 0), null);
  assert.match(validateAttachmentFile({ name: "a.pdf", size: 10 }, 0), /Chỉ nhận/);
  assert.match(validateAttachmentFile({ name: "a.docx.exe", size: 10 }, 0), /Chỉ nhận/);
  assert.match(validateAttachmentFile({ name: "a.doc", size: 0 }, 0), /rỗng/);
  assert.match(validateAttachmentFile({ name: "a.doc", size: MAX_ATTACHMENT_BYTES + 1 }, 0), /mỗi tệp/);
  assert.equal(validateAttachmentFile({ name: "a.doc", size: MIB }, MAX_MAP_ATTACHMENT_BYTES - MIB), null);
  assert.match(validateAttachmentFile({ name: "a.doc", size: MIB + 1 }, MAX_MAP_ATTACHMENT_BYTES - MIB), /vượt giới hạn/);
});

test("groupByLiveNodes: badge chỉ cho nút còn trong cây, phần còn lại là tệp mồ côi", () => {
  const list = [att(1, "a", 1), att(2, "a", 1), att(3, "b", 1), att(4, "gone", 5)];
  const { counts, orphans } = groupByLiveNodes(list, new Set(["a", "b", "c"]));
  assert.equal(counts.get("a"), 2);
  assert.equal(counts.get("b"), 1);
  assert.equal(counts.has("c"), false);
  assert.deepEqual(orphans.map((o) => o.id), [4]);
  assert.equal(totalBytes(list), 8);
});

test("treeHasId duyệt cây thô", () => {
  const root = { id: "r", children: [{ id: "x", children: [{ id: "y" }] }] };
  assert.equal(treeHasId(root, "y"), true);
  assert.equal(treeHasId(root, "z"), false);
  assert.equal(treeHasId(null, "r"), false);
});

function recorder() {
  const calls = [];
  return {
    calls,
    onPhase: (p) => calls.push(`phase:${p}`),
  };
}

test("cây có thay đổi: lưu trước rồi mới tải, đúng id đã chốt", async () => {
  const r = recorder();
  const out = await runAttachmentUpload({
    nodeId: "new1",
    file: { name: "ke-hoach.docx", size: 100 },
    usedBytes: 0,
    needsSave: true,
    save: async () => {
      r.calls.push("save");
      return { id: "root", children: [{ id: "new1" }] };
    },
    upload: async () => {
      r.calls.push("upload:new1");
      return "ok";
    },
    onPhase: r.onPhase,
  });
  assert.equal(out, "ok");
  assert.deepEqual(r.calls, ["phase:saving", "save", "phase:uploading", "upload:new1"]);
});

test("lưu thất bại thì không tải lên", async () => {
  const r = recorder();
  await assert.rejects(
    runAttachmentUpload({
      nodeId: "n",
      file: { name: "a.xlsx", size: 1 },
      usedBytes: 0,
      needsSave: true,
      save: async () => {
        throw new Error("Lỗi máy chủ (500)");
      },
      upload: async () => r.calls.push("upload"),
      onPhase: r.onPhase,
    }),
    /Chưa lưu được sơ đồ.*500/
  );
  assert.deepEqual(r.calls, ["phase:saving"]);
});

test("máy chủ đổi id nút khi lưu thì không tải lên", async () => {
  const r = recorder();
  await assert.rejects(
    runAttachmentUpload({
      nodeId: "c123",
      file: { name: "a.xlsx", size: 1 },
      usedBytes: 0,
      needsSave: true,
      save: async () => ({ id: "n0", children: [{ id: "n1" }] }),
      upload: async () => r.calls.push("upload"),
      onPhase: r.onPhase,
    }),
    /không còn nhận ra nút/
  );
  assert.equal(r.calls.includes("upload"), false);
});

test("tệp sai thì không lưu, không tải", async () => {
  const r = recorder();
  await assert.rejects(
    runAttachmentUpload({
      nodeId: "n",
      file: { name: "a.pdf", size: 1 },
      usedBytes: 0,
      needsSave: true,
      save: async () => r.calls.push("save"),
      upload: async () => r.calls.push("upload"),
      onPhase: r.onPhase,
    }),
    /Chỉ nhận/
  );
  assert.deepEqual(r.calls, []);
});

test("cây đã lưu: tải thẳng, không gọi lưu", async () => {
  const r = recorder();
  await runAttachmentUpload({
    nodeId: "n",
    file: { name: "a.doc", size: 1 },
    usedBytes: 0,
    needsSave: false,
    save: async () => r.calls.push("save"),
    upload: async () => r.calls.push("upload"),
    onPhase: r.onPhase,
  });
  assert.deepEqual(r.calls, ["phase:uploading", "upload"]);
});
