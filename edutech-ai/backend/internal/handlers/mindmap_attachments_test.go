package handlers

import (
	"archive/zip"
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/gin-gonic/gin"
	"gorm.io/datatypes"
	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/ai-for-edu/edutech-ai/backend/internal/auth"
	"github.com/ai-for-edu/edutech-ai/backend/internal/models"
)

const attachmentMiB = 1 << 20

type attachmentFixture struct {
	db       *gorm.DB
	handler  *Handler
	owner    models.User
	foreign  models.User
	admin    models.User
	project  models.Project
	artifact models.Artifact
}

func newAttachmentFixture(t *testing.T) *attachmentFixture {
	t.Helper()
	gin.SetMode(gin.TestMode)
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared&_busy_timeout=5000", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("mở sqlite test: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("lấy sql db: %v", err)
	}
	// A single SQLite connection makes concurrent quota transactions serialize,
	// matching SQLite's database-writer semantics without flaky lock errors.
	sqlDB.SetMaxOpenConns(1)
	if err := db.AutoMigrate(&models.User{}, &models.Project{}, &models.Job{}, &models.Artifact{}, &models.MindmapAttachment{}); err != nil {
		t.Fatalf("migrate sqlite test: %v", err)
	}
	f := &attachmentFixture{db: db, handler: &Handler{DB: db}}
	f.owner = models.User{Email: "owner@example.test", Name: "Owner", Role: models.RoleTeacher, Status: models.StatusActive}
	f.foreign = models.User{Email: "foreign@example.test", Name: "Foreign", Role: models.RoleTeacher, Status: models.StatusActive}
	f.admin = models.User{Email: "admin@example.test", Name: "Admin", Role: models.RoleAdmin, Status: models.StatusActive}
	if err := db.Create([]*models.User{&f.owner, &f.foreign, &f.admin}).Error; err != nil {
		t.Fatalf("seed users: %v", err)
	}
	f.project = models.Project{UserID: f.owner.ID, Name: "P", Subject: "mam_non", GradeLevel: "mam_non"}
	if err := db.Create(&f.project).Error; err != nil {
		t.Fatalf("seed project: %v", err)
	}
	content, _ := json.Marshal(map[string]any{
		"topic": "Gia đình",
		"root": map[string]any{
			"id": "n0", "text": "Gia đình",
			"children": []any{
				map[string]any{"id": "n1", "text": "Người thân"},
				map[string]any{"id": "c17897150000001", "text": "Ngôi nhà"},
			},
		},
	})
	f.artifact = models.Artifact{ProjectID: f.project.ID, JobID: 1, Type: models.JobTypeMindmap, Title: "M", Content: datatypes.JSON(content)}
	if err := db.Create(&f.artifact).Error; err != nil {
		t.Fatalf("seed artifact: %v", err)
	}
	return f
}

func (f *attachmentFixture) router(user *models.User) *gin.Engine {
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set(auth.ContextUserKey, user)
		c.Next()
	})
	r.PUT("/api/artifacts/:id/mindmap", f.handler.SaveMindmap)
	r.GET("/api/artifacts/:id/mindmap/attachments", f.handler.ListMindmapAttachments)
	r.POST("/api/artifacts/:id/mindmap/attachments", f.handler.UploadMindmapAttachment)
	r.GET("/api/artifacts/:id/mindmap/attachments/:attachmentId", f.handler.DownloadMindmapAttachment)
	r.DELETE("/api/artifacts/:id/mindmap/attachments/:attachmentId", f.handler.DeleteMindmapAttachment)
	r.DELETE("/api/projects/:id", f.handler.DeleteProject)
	r.DELETE("/api/admin/users/:id", f.handler.AdminDeleteUser)
	return r
}

func multipartUploadRequest(t *testing.T, url, nodeID, filename string, data []byte) *http.Request {
	t.Helper()
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	if err := w.WriteField("node_id", nodeID); err != nil {
		t.Fatalf("ghi node_id: %v", err)
	}
	part, err := w.CreateFormFile("file", filename)
	if err != nil {
		t.Fatalf("tạo file multipart: %v", err)
	}
	if _, err := part.Write(data); err != nil {
		t.Fatalf("ghi file multipart: %v", err)
	}
	if err := w.Close(); err != nil {
		t.Fatalf("đóng multipart: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, url, &body)
	req.Header.Set("Content-Type", w.FormDataContentType())
	return req
}

func makeOpenXML(t *testing.T, kind string, fillerBytes int) []byte {
	t.Helper()
	var out bytes.Buffer
	zw := zip.NewWriter(&out)
	names := []string{"[Content_Types].xml", "_rels/.rels"}
	switch kind {
	case "docx":
		names = append(names, "word/document.xml")
	case "xlsx":
		names = append(names, "xl/workbook.xml")
	default:
		t.Fatalf("loại OpenXML test không hợp lệ: %s", kind)
	}
	for _, name := range names {
		entry, err := zw.Create(name)
		if err != nil {
			t.Fatalf("tạo zip entry: %v", err)
		}
		if _, err := io.WriteString(entry, "<xml/>"); err != nil {
			t.Fatalf("ghi zip entry: %v", err)
		}
	}
	if fillerBytes > 0 {
		header := &zip.FileHeader{Name: "word/media/filler.bin", Method: zip.Store}
		if kind == "xlsx" {
			header.Name = "xl/media/filler.bin"
		}
		entry, err := zw.CreateHeader(header)
		if err != nil {
			t.Fatalf("tạo filler: %v", err)
		}
		chunk := bytes.Repeat([]byte{0x5a}, 32*1024)
		remaining := fillerBytes
		for remaining > 0 {
			n := len(chunk)
			if remaining < n {
				n = remaining
			}
			if _, err := entry.Write(chunk[:n]); err != nil {
				t.Fatalf("ghi filler: %v", err)
			}
			remaining -= n
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("đóng zip: %v", err)
	}
	return out.Bytes()
}

func makeOpenXMLBomb(t *testing.T) []byte {
	t.Helper()
	var out bytes.Buffer
	zw := zip.NewWriter(&out)
	for _, name := range []string{"[Content_Types].xml", "_rels/.rels", "word/document.xml"} {
		entry, err := zw.Create(name)
		if err != nil {
			t.Fatalf("tạo zip entry: %v", err)
		}
		if _, err := io.WriteString(entry, "<xml/>"); err != nil {
			t.Fatalf("ghi zip entry: %v", err)
		}
	}
	bomb, err := zw.Create("word/media/bomb.bin")
	if err != nil {
		t.Fatalf("tạo bomb entry: %v", err)
	}
	chunk := bytes.Repeat([]byte{0}, 32*1024)
	for written := 0; written < 51*attachmentMiB; written += len(chunk) {
		if _, err := bomb.Write(chunk); err != nil {
			t.Fatalf("ghi bomb entry: %v", err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("đóng bomb zip: %v", err)
	}
	return out.Bytes()
}

func makeLegacyOffice(t *testing.T, streamName string) []byte {
	t.Helper()
	const freeSector = uint32(0xffffffff)
	const endOfChain = uint32(0xfffffffe)
	const fatSector = uint32(0xfffffffd)
	b := make([]byte, 3*512)
	copy(b[:8], []byte{0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1})
	binary.LittleEndian.PutUint16(b[0x18:], 0x003e)
	binary.LittleEndian.PutUint16(b[0x1a:], 3)
	binary.LittleEndian.PutUint16(b[0x1c:], 0xfffe)
	binary.LittleEndian.PutUint16(b[0x1e:], 9)
	binary.LittleEndian.PutUint16(b[0x20:], 6)
	binary.LittleEndian.PutUint32(b[0x2c:], 1)
	binary.LittleEndian.PutUint32(b[0x30:], 0)
	binary.LittleEndian.PutUint32(b[0x38:], 4096)
	binary.LittleEndian.PutUint32(b[0x3c:], endOfChain)
	binary.LittleEndian.PutUint32(b[0x44:], endOfChain)
	for offset := 0x4c; offset < 512; offset += 4 {
		binary.LittleEndian.PutUint32(b[offset:], freeSector)
	}
	binary.LittleEndian.PutUint32(b[0x4c:], 1)
	writeDirectoryName := func(entry []byte, name string, objectType byte) {
		encoded := make([]uint16, 0, len(name)+1)
		for _, r := range name {
			encoded = append(encoded, uint16(r))
		}
		encoded = append(encoded, 0)
		for i, value := range encoded {
			binary.LittleEndian.PutUint16(entry[i*2:], value)
		}
		binary.LittleEndian.PutUint16(entry[64:], uint16(len(encoded)*2))
		entry[66] = objectType
	}
	directory := b[512:1024]
	writeDirectoryName(directory[:128], "Root Entry", 5)
	writeDirectoryName(directory[128:256], streamName, 2)
	fat := b[1024:1536]
	for offset := 0; offset < len(fat); offset += 4 {
		binary.LittleEndian.PutUint32(fat[offset:], freeSector)
	}
	binary.LittleEndian.PutUint32(fat[0:], endOfChain)
	binary.LittleEndian.PutUint32(fat[4:], fatSector)
	return b
}

func perform(r http.Handler, req *http.Request) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

func decodeAttachmentID(t *testing.T, rec *httptest.ResponseRecorder) uint {
	t.Helper()
	var body struct {
		Attachment struct {
			ID          uint   `json:"id"`
			NodeID      string `json:"node_id"`
			ContentType string `json:"content_type"`
			Size        int64  `json:"size"`
		} `json:"attachment"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode upload: %v; body=%s", err, rec.Body.String())
	}
	if body.Attachment.ID == 0 {
		t.Fatalf("upload thiếu metadata: %s", rec.Body.String())
	}
	return body.Attachment.ID
}

func TestMindmapAttachmentUploadListDownloadDelete(t *testing.T) {
	f := newAttachmentFixture(t)
	r := f.router(&f.owner)
	data := makeOpenXML(t, "docx", 0)
	upload := perform(r, multipartUploadRequest(t,
		fmt.Sprintf("/api/artifacts/%d/mindmap/attachments", f.artifact.ID),
		"n1", "ke-hoach.docx", data))
	if upload.Code != http.StatusCreated {
		t.Fatalf("upload status=%d body=%s", upload.Code, upload.Body.String())
	}
	attachmentID := decodeAttachmentID(t, upload)
	if strings.Contains(upload.Body.String(), "data") {
		t.Fatalf("response metadata không được lộ bytes: %s", upload.Body.String())
	}

	list := perform(r, httptest.NewRequest(http.MethodGet,
		fmt.Sprintf("/api/artifacts/%d/mindmap/attachments", f.artifact.ID), nil))
	if list.Code != http.StatusOK || !strings.Contains(list.Body.String(), "ke-hoach.docx") || strings.Contains(list.Body.String(), "data") {
		t.Fatalf("list sai: status=%d body=%s", list.Code, list.Body.String())
	}

	downloadURL := fmt.Sprintf("/api/artifacts/%d/mindmap/attachments/%d", f.artifact.ID, attachmentID)
	download := perform(r, httptest.NewRequest(http.MethodGet, downloadURL, nil))
	if download.Code != http.StatusOK || !bytes.Equal(download.Body.Bytes(), data) {
		t.Fatalf("download sai: status=%d size=%d", download.Code, download.Body.Len())
	}
	if got := download.Header().Get("Content-Disposition"); !strings.Contains(got, "attachment") || !strings.Contains(got, "ke-hoach.docx") {
		t.Fatalf("Content-Disposition sai: %q", got)
	}
	if got := download.Header().Get("Cache-Control"); got != "private, no-store" {
		t.Fatalf("download không được cache dùng chung: %q", got)
	}
	if got := download.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Fatalf("download phải chặn MIME sniffing: %q", got)
	}

	deleted := perform(r, httptest.NewRequest(http.MethodDelete, downloadURL, nil))
	if deleted.Code != http.StatusOK || !strings.Contains(deleted.Body.String(), `"ok":true`) {
		t.Fatalf("delete sai: status=%d body=%s", deleted.Code, deleted.Body.String())
	}
	missing := perform(r, httptest.NewRequest(http.MethodGet, downloadURL, nil))
	if missing.Code != http.StatusNotFound {
		t.Fatalf("attachment đã xóa phải 404, có %d", missing.Code)
	}
}

func TestMindmapAttachmentSupportsAllOfficeTypesAndIgnoresClientMIME(t *testing.T) {
	tests := []struct {
		name        string
		contentType string
		data        func(*testing.T) []byte
	}{
		{name: "a.doc", contentType: "application/msword", data: func(t *testing.T) []byte { return makeLegacyOffice(t, "WordDocument") }},
		{name: "a.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", data: func(t *testing.T) []byte { return makeOpenXML(t, "docx", 0) }},
		{name: "a.xls", contentType: "application/vnd.ms-excel", data: func(t *testing.T) []byte { return makeLegacyOffice(t, "Workbook") }},
		{name: "a.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", data: func(t *testing.T) []byte { return makeOpenXML(t, "xlsx", 0) }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newAttachmentFixture(t)
			rec := perform(f.router(&f.owner), multipartUploadRequest(t,
				fmt.Sprintf("/api/artifacts/%d/mindmap/attachments", f.artifact.ID), "n1", tt.name, tt.data(t)))
			if rec.Code != http.StatusCreated {
				t.Fatalf("upload %s status=%d body=%s", tt.name, rec.Code, rec.Body.String())
			}
			var body struct {
				Attachment struct {
					ContentType string `json:"content_type"`
				} `json:"attachment"`
			}
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || body.Attachment.ContentType != tt.contentType {
				t.Fatalf("content_type phải do server xác định: got=%q err=%v", body.Attachment.ContentType, err)
			}
		})
	}
}

func TestMindmapAttachmentAuthorization(t *testing.T) {
	f := newAttachmentFixture(t)
	base := fmt.Sprintf("/api/artifacts/%d/mindmap/attachments", f.artifact.ID)
	ownerUpload := perform(f.router(&f.owner), multipartUploadRequest(t, base, "n1", "a.docx", makeOpenXML(t, "docx", 0)))
	if ownerUpload.Code != http.StatusCreated {
		t.Fatalf("owner upload: %d %s", ownerUpload.Code, ownerUpload.Body.String())
	}
	id := decodeAttachmentID(t, ownerUpload)

	foreignRouter := f.router(&f.foreign)
	foreignRequests := []*http.Request{
		httptest.NewRequest(http.MethodGet, base, nil),
		multipartUploadRequest(t, base, "n1", "b.docx", makeOpenXML(t, "docx", 0)),
		httptest.NewRequest(http.MethodGet, fmt.Sprintf("%s/%d", base, id), nil),
		httptest.NewRequest(http.MethodDelete, fmt.Sprintf("%s/%d", base, id), nil),
	}
	for _, req := range foreignRequests {
		if rec := perform(foreignRouter, req); rec.Code != http.StatusNotFound {
			t.Fatalf("foreign %s phải 404, có %d body=%s", req.Method, rec.Code, rec.Body.String())
		}
	}

	adminRouter := f.router(&f.admin)
	if rec := perform(adminRouter, httptest.NewRequest(http.MethodGet, base, nil)); rec.Code != http.StatusOK {
		t.Fatalf("admin list phải được phép: %d %s", rec.Code, rec.Body.String())
	}
	if rec := perform(adminRouter, httptest.NewRequest(http.MethodGet, fmt.Sprintf("%s/%d", base, id), nil)); rec.Code != http.StatusOK {
		t.Fatalf("admin download phải được phép: %d %s", rec.Code, rec.Body.String())
	}
}

func TestMindmapAttachmentRejectsInvalidInput(t *testing.T) {
	f := newAttachmentFixture(t)
	r := f.router(&f.owner)
	base := fmt.Sprintf("/api/artifacts/%d/mindmap/attachments", f.artifact.ID)
	tests := []struct {
		name     string
		nodeID   string
		filename string
		data     []byte
		status   int
	}{
		{name: "missing node", nodeID: "n404", filename: "a.docx", data: makeOpenXML(t, "docx", 0), status: http.StatusBadRequest},
		{name: "invalid node id", nodeID: strings.Repeat("c", 129), filename: "a.docx", data: makeOpenXML(t, "docx", 0), status: http.StatusBadRequest},
		{name: "unsupported extension", nodeID: "n1", filename: "a.pdf", data: []byte("pdf"), status: http.StatusBadRequest},
		{name: "malformed docx", nodeID: "n1", filename: "a.docx", data: []byte("not a zip"), status: http.StatusBadRequest},
		{name: "mismatched openxml", nodeID: "n1", filename: "a.xlsx", data: makeOpenXML(t, "docx", 0), status: http.StatusBadRequest},
		{name: "zip bomb", nodeID: "n1", filename: "a.docx", data: makeOpenXMLBomb(t), status: http.StatusBadRequest},
		{name: "malformed doc", nodeID: "n1", filename: "a.doc", data: []byte{0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1}, status: http.StatusBadRequest},
		{name: "mismatched legacy", nodeID: "n1", filename: "a.xls", data: makeLegacyOffice(t, "WordDocument"), status: http.StatusBadRequest},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := perform(r, multipartUploadRequest(t, base, tt.nodeID, tt.filename, tt.data))
			if rec.Code != tt.status {
				t.Fatalf("status=%d cần=%d body=%s", rec.Code, tt.status, rec.Body.String())
			}
		})
	}
	if rec := perform(r, httptest.NewRequest(http.MethodGet, "/api/artifacts/not-an-id/mindmap/attachments", nil)); rec.Code != http.StatusBadRequest {
		t.Fatalf("artifact ID hỏng phải 400, có %d", rec.Code)
	}
	if rec := perform(r, httptest.NewRequest(http.MethodGet, base+"/not-an-id", nil)); rec.Code != http.StatusBadRequest {
		t.Fatalf("attachment ID hỏng phải 400, có %d", rec.Code)
	}
	other := models.Artifact{ProjectID: f.project.ID, JobID: 2, Type: models.JobTypeQuiz, Title: "Q", Content: datatypes.JSON(`{}`)}
	if err := f.db.Create(&other).Error; err != nil {
		t.Fatalf("seed non-mindmap artifact: %v", err)
	}
	wrongType := perform(r, multipartUploadRequest(t,
		fmt.Sprintf("/api/artifacts/%d/mindmap/attachments", other.ID), "n1", "a.docx", makeOpenXML(t, "docx", 0)))
	if wrongType.Code != http.StatusBadRequest {
		t.Fatalf("artifact không phải mindmap phải 400, có %d body=%s", wrongType.Code, wrongType.Body.String())
	}
}

func TestMindmapAttachmentRejectsPerFileAndArtifactQuota(t *testing.T) {
	t.Run("per-file", func(t *testing.T) {
		f := newAttachmentFixture(t)
		base := fmt.Sprintf("/api/artifacts/%d/mindmap/attachments", f.artifact.ID)
		data := makeOpenXML(t, "docx", 10*attachmentMiB)
		rec := perform(f.router(&f.owner), multipartUploadRequest(t, base, "n1", "large.docx", data))
		if rec.Code != http.StatusRequestEntityTooLarge {
			t.Fatalf("file >10 MiB phải 413, có %d body=%s size=%d", rec.Code, rec.Body.String(), len(data))
		}
	})

	t.Run("artifact quota", func(t *testing.T) {
		f := newAttachmentFixture(t)
		existing := models.MindmapAttachment{ArtifactID: f.artifact.ID, NodeID: "orphan", Name: "old.docx", Size: 50 * attachmentMiB, ContentType: "application/test", Data: []byte{1}}
		if err := f.db.Create(&existing).Error; err != nil {
			t.Fatalf("seed quota: %v", err)
		}
		base := fmt.Sprintf("/api/artifacts/%d/mindmap/attachments", f.artifact.ID)
		rec := perform(f.router(&f.owner), multipartUploadRequest(t, base, "n1", "a.docx", makeOpenXML(t, "docx", 0)))
		if rec.Code != http.StatusRequestEntityTooLarge {
			t.Fatalf("quota gồm cả tệp orphan phải 413, có %d body=%s", rec.Code, rec.Body.String())
		}
	})
}

func TestMindmapAttachmentQuotaIsRaceSafe(t *testing.T) {
	f := newAttachmentFixture(t)
	existing := models.MindmapAttachment{ArtifactID: f.artifact.ID, NodeID: "orphan", Name: "old.docx", Size: 40 * attachmentMiB, ContentType: "application/test", Data: []byte{1}}
	if err := f.db.Create(&existing).Error; err != nil {
		t.Fatalf("seed quota: %v", err)
	}
	base := fmt.Sprintf("/api/artifacts/%d/mindmap/attachments", f.artifact.ID)
	data := makeOpenXML(t, "docx", 6*attachmentMiB)
	statuses := make(chan int, 2)
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			rec := perform(f.router(&f.owner), multipartUploadRequest(t, base, "n1", fmt.Sprintf("race-%d.docx", i), data))
			statuses <- rec.Code
		}(i)
	}
	wg.Wait()
	close(statuses)
	counts := map[int]int{}
	for status := range statuses {
		counts[status]++
	}
	if counts[http.StatusCreated] != 1 || counts[http.StatusRequestEntityTooLarge] != 1 {
		t.Fatalf("race phải có đúng một upload: statuses=%v", counts)
	}
	var total int64
	if err := f.db.Model(&models.MindmapAttachment{}).Where("artifact_id = ?", f.artifact.ID).Select("COALESCE(SUM(size), 0)").Scan(&total).Error; err != nil {
		t.Fatalf("sum quota: %v", err)
	}
	if total > 50*attachmentMiB {
		t.Fatalf("quota bị vượt do race: %d", total)
	}
}

func TestMindmapAttachmentSurvivesSaveReorderAndOrphanLifecycle(t *testing.T) {
	f := newAttachmentFixture(t)
	r := f.router(&f.owner)
	base := fmt.Sprintf("/api/artifacts/%d/mindmap/attachments", f.artifact.ID)
	upload := perform(r, multipartUploadRequest(t, base, "n1", "a.docx", makeOpenXML(t, "docx", 0)))
	if upload.Code != http.StatusCreated {
		t.Fatalf("upload: %d %s", upload.Code, upload.Body.String())
	}
	id := decodeAttachmentID(t, upload)
	secondUpload := perform(r, multipartUploadRequest(t, base, "n1", "b.xlsx", makeOpenXML(t, "xlsx", 0)))
	if secondUpload.Code != http.StatusCreated {
		t.Fatalf("second upload: %d %s", secondUpload.Code, secondUpload.Body.String())
	}
	secondID := decodeAttachmentID(t, secondUpload)

	save := func(root string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/artifacts/%d/mindmap", f.artifact.ID), strings.NewReader(root))
		req.Header.Set("Content-Type", "application/json")
		return perform(r, req)
	}
	if rec := save(`{"root":{"id":"n0","text":"Gia đình","children":[{"id":"c17897150000001","text":"Ngôi nhà"},{"id":"n1","text":"Người thân"}]}}`); rec.Code != http.StatusOK {
		t.Fatalf("save reorder: %d %s", rec.Code, rec.Body.String())
	}
	if rec := perform(r, httptest.NewRequest(http.MethodGet, fmt.Sprintf("%s/%d", base, id), nil)); rec.Code != http.StatusOK {
		t.Fatalf("attachment phải còn sau reorder: %d %s", rec.Code, rec.Body.String())
	}

	if rec := save(`{"root":{"id":"n0","text":"Gia đình","children":[{"id":"c17897150000001","text":"Ngôi nhà"}]}}`); rec.Code != http.StatusOK {
		t.Fatalf("save remove node: %d %s", rec.Code, rec.Body.String())
	}
	if rec := perform(r, httptest.NewRequest(http.MethodGet, base, nil)); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "a.docx") || !strings.Contains(rec.Body.String(), "b.xlsx") {
		t.Fatalf("list phải giữ metadata orphan: %d %s", rec.Code, rec.Body.String())
	}
	if rec := perform(r, httptest.NewRequest(http.MethodGet, fmt.Sprintf("%s/%d", base, id), nil)); rec.Code != http.StatusOK {
		t.Fatalf("download orphan phải được phép, có %d body=%s", rec.Code, rec.Body.String())
	}
	if rec := perform(r, httptest.NewRequest(http.MethodDelete, fmt.Sprintf("%s/%d", base, secondID), nil)); rec.Code != http.StatusOK {
		t.Fatalf("delete orphan phải được phép, có %d body=%s", rec.Code, rec.Body.String())
	}
	var count int64
	if err := f.db.Model(&models.MindmapAttachment{}).Where("id = ?", id).Count(&count).Error; err != nil || count != 1 {
		t.Fatalf("save bỏ nhánh không được xóa bytes: count=%d err=%v", count, err)
	}
	if rec := save(`{"root":{"id":"n0","text":"Gia đình","children":[{"id":"n1","text":"Người thân"}]}}`); rec.Code != http.StatusOK {
		t.Fatalf("save restore node: %d %s", rec.Code, rec.Body.String())
	}
	if rec := perform(r, httptest.NewRequest(http.MethodGet, fmt.Sprintf("%s/%d", base, id), nil)); rec.Code != http.StatusOK {
		t.Fatalf("attachment phải tải lại được khi node trở lại: %d %s", rec.Code, rec.Body.String())
	}
}

func TestMindmapAttachmentsCleanedWithProjectAndAdminDelete(t *testing.T) {
	t.Run("project", func(t *testing.T) {
		f := newAttachmentFixture(t)
		attachment := models.MindmapAttachment{ArtifactID: f.artifact.ID, NodeID: "n1", Name: "a.docx", Size: 1, ContentType: "application/test", Data: []byte{1}}
		if err := f.db.Create(&attachment).Error; err != nil {
			t.Fatalf("seed attachment: %v", err)
		}
		rec := perform(f.router(&f.owner), httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/projects/%d", f.project.ID), nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("delete project: %d %s", rec.Code, rec.Body.String())
		}
		var count int64
		f.db.Model(&models.MindmapAttachment{}).Where("id = ?", attachment.ID).Count(&count)
		if count != 0 {
			t.Fatalf("attachment chưa được dọn khi xóa project")
		}
	})

	t.Run("admin user", func(t *testing.T) {
		f := newAttachmentFixture(t)
		attachment := models.MindmapAttachment{ArtifactID: f.artifact.ID, NodeID: "n1", Name: "a.docx", Size: 1, ContentType: "application/test", Data: []byte{1}}
		if err := f.db.Create(&attachment).Error; err != nil {
			t.Fatalf("seed attachment: %v", err)
		}
		rec := perform(f.router(&f.admin), httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/admin/users/%d", f.owner.ID), nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("admin delete user: %d %s", rec.Code, rec.Body.String())
		}
		var count int64
		f.db.Model(&models.MindmapAttachment{}).Where("id = ?", attachment.ID).Count(&count)
		if count != 0 {
			t.Fatalf("attachment chưa được dọn khi admin xóa user")
		}
	})
}

func TestArtifactDeleteLockQueryUsesPostgresRowLock(t *testing.T) {
	db, err := gorm.Open(postgres.New(postgres.Config{
		DSN:                  "host=localhost user=test dbname=test sslmode=disable",
		PreferSimpleProtocol: true,
	}), &gorm.Config{DryRun: true, DisableAutomaticPing: true})
	if err != nil {
		t.Fatalf("khởi tạo postgres dry-run: %v", err)
	}
	var artifacts []models.Artifact
	query := artifactDeleteLockQuery(db).Where("project_id = ?", 1).Find(&artifacts)
	if query.Error != nil {
		t.Fatalf("build lock query: %v", query.Error)
	}
	sql := query.Statement.SQL.String()
	if !strings.Contains(sql, "ORDER BY id") || !strings.Contains(sql, "FOR UPDATE") {
		t.Fatalf("delete phải lock artifact theo thứ tự trên PostgreSQL, SQL=%s", sql)
	}
}
