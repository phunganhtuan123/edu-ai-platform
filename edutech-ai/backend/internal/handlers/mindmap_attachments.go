package handlers

import (
	"archive/zip"
	"bytes"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"path"
	"strconv"
	"strings"
	"unicode/utf16"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/ai-for-edu/edutech-ai/backend/internal/auth"
	"github.com/ai-for-edu/edutech-ai/backend/internal/models"
	"github.com/ai-for-edu/edutech-ai/backend/internal/pipelines"
)

const (
	maxMindmapAttachmentSize  = int64(10 << 20)
	maxMindmapAttachmentsSize = int64(50 << 20)
	maxMindmapUploadBody      = maxMindmapAttachmentSize + (1 << 20)
	maxOfficeZipEntries       = 10_000
	maxOfficeUncompressedSize = uint64(50 << 20)
)

var (
	errMindmapArtifactNotFound = errors.New("mindmap artifact not found")
	errNotMindmapArtifact      = errors.New("artifact is not a mindmap")
	errMindmapNodeNotFound     = errors.New("mindmap node not found")
	errMindmapAttachmentQuota  = errors.New("mindmap attachment quota exceeded")
)

type officeFileType struct {
	contentType string
	legacyNames []string
	zipEntries  []string
}

var officeFileTypes = map[string]officeFileType{
	".doc": {
		contentType: "application/msword",
		legacyNames: []string{"WordDocument"},
	},
	".docx": {
		contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		zipEntries:  []string{"[Content_Types].xml", "_rels/.rels", "word/document.xml"},
	},
	".xls": {
		contentType: "application/vnd.ms-excel",
		legacyNames: []string{"Workbook", "Book"},
	},
	".xlsx": {
		contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		zipEntries:  []string{"[Content_Types].xml", "_rels/.rels", "xl/workbook.xml"},
	},
}

func parsePositivePathID(c *gin.Context, name, message string) (uint, bool) {
	raw, err := strconv.ParseUint(c.Param(name), 10, 64)
	if err != nil || raw == 0 || uint64(uint(raw)) != raw {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return 0, false
	}
	return uint(raw), true
}

func ownedMindmapArtifact(db *gorm.DB, id uint, user *models.User, lock bool) (*models.Artifact, error) {
	if user == nil {
		return nil, errMindmapArtifactNotFound
	}
	q := db
	if lock && db.Dialector.Name() == "postgres" {
		q = q.Clauses(clause.Locking{Strength: "UPDATE"})
	}
	var artifact models.Artifact
	if err := q.First(&artifact, id).Error; err != nil {
		return nil, errMindmapArtifactNotFound
	}
	var project models.Project
	if err := db.First(&project, artifact.ProjectID).Error; err != nil ||
		(project.UserID != user.ID && user.Role != models.RoleAdmin) {
		return nil, errMindmapArtifactNotFound
	}
	if artifact.Type != models.JobTypeMindmap {
		return nil, errNotMindmapArtifact
	}
	return &artifact, nil
}

func writeMindmapArtifactError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, errMindmapArtifactNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy kết quả"})
	case errors.Is(err, errNotMindmapArtifact):
		c.JSON(http.StatusBadRequest, gin.H{"error": "Kết quả này không phải sơ đồ tư duy"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không xử lý được tệp đính kèm"})
	}
}

func mindmapNodeIDs(content []byte) (map[string]bool, error) {
	var envelope struct {
		Root *pipelines.MindNode `json:"root"`
	}
	if err := json.Unmarshal(content, &envelope); err != nil || envelope.Root == nil {
		return nil, errors.New("mindmap content has no root")
	}
	ids := make(map[string]bool)
	stack := []*pipelines.MindNode{envelope.Root}
	count := 0
	for len(stack) > 0 {
		n := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		if n == nil {
			continue
		}
		count++
		if count > 10_000 {
			return nil, errors.New("mindmap content is too large")
		}
		if n.ID != "" {
			ids[n.ID] = true
		}
		stack = append(stack, n.Children...)
	}
	return ids, nil
}

func cleanUploadFilename(raw string) (string, officeFileType, error) {
	if !utf8.ValidString(raw) {
		return "", officeFileType{}, errors.New("filename is not UTF-8")
	}
	name := path.Base(strings.ReplaceAll(strings.TrimSpace(raw), `\`, "/"))
	if name == "" || name == "." || utf8.RuneCountInString(name) > 255 {
		return "", officeFileType{}, errors.New("filename is invalid")
	}
	for _, r := range name {
		if r < 0x20 || r == 0x7f {
			return "", officeFileType{}, errors.New("filename contains control characters")
		}
	}
	ext := strings.ToLower(path.Ext(name))
	fileType, ok := officeFileTypes[ext]
	if !ok {
		return "", officeFileType{}, errors.New("unsupported extension")
	}
	return name, fileType, nil
}

func validateOfficeFile(data []byte, fileType officeFileType) error {
	if len(fileType.zipEntries) > 0 {
		return validateOpenXML(data, fileType.zipEntries)
	}
	return validateCompoundOffice(data, fileType.legacyNames)
}

func validateOpenXML(data []byte, requiredEntries []string) error {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return errors.New("invalid Office ZIP container")
	}
	if len(zr.File) == 0 || len(zr.File) > maxOfficeZipEntries {
		return errors.New("invalid Office ZIP entry count")
	}
	var total uint64
	entries := make(map[string]*zip.File, len(zr.File))
	for _, f := range zr.File {
		if f.UncompressedSize64 > maxOfficeUncompressedSize-total {
			return errors.New("Office ZIP expands beyond limit")
		}
		total += f.UncompressedSize64
		if _, duplicate := entries[f.Name]; duplicate {
			return errors.New("Office ZIP has duplicate entries")
		}
		entries[f.Name] = f
	}
	for _, name := range requiredEntries {
		f := entries[name]
		if f == nil || f.FileInfo().IsDir() || f.UncompressedSize64 == 0 || f.UncompressedSize64 > 5<<20 {
			return fmt.Errorf("Office ZIP is missing %s", name)
		}
		r, err := f.Open()
		if err != nil {
			return errors.New("cannot read Office ZIP entry")
		}
		contents, readErr := io.ReadAll(io.LimitReader(r, (5<<20)+1))
		closeErr := r.Close()
		if readErr != nil || closeErr != nil || len(contents) == 0 || len(contents) > 5<<20 {
			return errors.New("invalid Office ZIP entry")
		}
	}
	return nil
}

func validateCompoundOffice(data []byte, expectedStreams []string) error {
	const (
		freeSector      = uint32(0xffffffff)
		endOfChain      = uint32(0xfffffffe)
		fatSector       = uint32(0xfffffffd)
		difatSector     = uint32(0xfffffffc)
		maxRegularSID   = uint32(0xfffffffa)
		compoundSigSize = 8
	)
	signature := []byte{0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1}
	if len(data) < 512 || !bytes.Equal(data[:compoundSigSize], signature) {
		return errors.New("invalid compound Office signature")
	}
	major := binary.LittleEndian.Uint16(data[0x1a:])
	sectorShift := binary.LittleEndian.Uint16(data[0x1e:])
	if binary.LittleEndian.Uint16(data[0x1c:]) != 0xfffe || binary.LittleEndian.Uint16(data[0x20:]) != 6 ||
		!((major == 3 && sectorShift == 9) || (major == 4 && sectorShift == 12)) {
		return errors.New("invalid compound Office header")
	}
	sectorSize := 1 << sectorShift
	if len(data) < sectorSize*2 || len(data)%sectorSize != 0 {
		return errors.New("invalid compound Office sector layout")
	}
	totalSectors := uint32(len(data)/sectorSize - 1)
	sector := func(sid uint32) ([]byte, error) {
		if sid >= totalSectors || sid >= maxRegularSID {
			return nil, errors.New("compound Office sector is out of range")
		}
		start := (int(sid) + 1) * sectorSize
		return data[start : start+sectorSize], nil
	}

	numFAT := binary.LittleEndian.Uint32(data[0x2c:])
	if numFAT == 0 || numFAT > totalSectors {
		return errors.New("invalid compound Office FAT count")
	}
	fatIDs := make([]uint32, 0, numFAT)
	for offset := 0x4c; offset < 512 && uint32(len(fatIDs)) < numFAT; offset += 4 {
		sid := binary.LittleEndian.Uint32(data[offset:])
		if sid != freeSector {
			fatIDs = append(fatIDs, sid)
		}
	}
	nextDIFAT := binary.LittleEndian.Uint32(data[0x44:])
	numDIFAT := binary.LittleEndian.Uint32(data[0x48:])
	seenDIFAT := make(map[uint32]bool)
	for i := uint32(0); i < numDIFAT && uint32(len(fatIDs)) < numFAT; i++ {
		if nextDIFAT == endOfChain || seenDIFAT[nextDIFAT] {
			return errors.New("invalid compound Office DIFAT chain")
		}
		seenDIFAT[nextDIFAT] = true
		block, err := sector(nextDIFAT)
		if err != nil {
			return err
		}
		for offset := 0; offset < sectorSize-4 && uint32(len(fatIDs)) < numFAT; offset += 4 {
			sid := binary.LittleEndian.Uint32(block[offset:])
			if sid != freeSector {
				fatIDs = append(fatIDs, sid)
			}
		}
		nextDIFAT = binary.LittleEndian.Uint32(block[sectorSize-4:])
	}
	if uint32(len(fatIDs)) != numFAT {
		return errors.New("compound Office FAT is incomplete")
	}
	fat := make([]uint32, 0, int(numFAT)*sectorSize/4)
	seenFAT := make(map[uint32]bool)
	for _, sid := range fatIDs {
		if seenFAT[sid] {
			return errors.New("compound Office FAT sector is duplicated")
		}
		seenFAT[sid] = true
		block, err := sector(sid)
		if err != nil {
			return err
		}
		for offset := 0; offset < sectorSize; offset += 4 {
			fat = append(fat, binary.LittleEndian.Uint32(block[offset:]))
		}
	}

	directorySID := binary.LittleEndian.Uint32(data[0x30:])
	seenDirectory := make(map[uint32]bool)
	foundRoot := false
	foundExpected := false
	for directorySID != endOfChain {
		if directorySID == freeSector || directorySID == fatSector || directorySID == difatSector ||
			directorySID >= uint32(len(fat)) || seenDirectory[directorySID] {
			return errors.New("invalid compound Office directory chain")
		}
		seenDirectory[directorySID] = true
		block, err := sector(directorySID)
		if err != nil {
			return err
		}
		for offset := 0; offset+128 <= len(block); offset += 128 {
			entry := block[offset : offset+128]
			objectType := entry[66]
			if objectType == 0 {
				continue
			}
			nameLength := int(binary.LittleEndian.Uint16(entry[64:]))
			if nameLength < 2 || nameLength > 64 || nameLength%2 != 0 {
				return errors.New("invalid compound Office directory name")
			}
			units := make([]uint16, 0, nameLength/2-1)
			for p := 0; p < nameLength-2; p += 2 {
				units = append(units, binary.LittleEndian.Uint16(entry[p:]))
			}
			name := string(utf16.Decode(units))
			if objectType == 5 && name == "Root Entry" {
				foundRoot = true
			}
			if objectType == 2 {
				for _, expected := range expectedStreams {
					if name == expected {
						foundExpected = true
					}
				}
			}
		}
		directorySID = fat[directorySID]
		if len(seenDirectory) > int(totalSectors) {
			return errors.New("compound Office directory is too large")
		}
	}
	if !foundRoot || !foundExpected {
		return errors.New("compound Office stream does not match extension")
	}
	return nil
}

// ListMindmapAttachments handles GET /api/artifacts/:id/mindmap/attachments.
func (h *Handler) ListMindmapAttachments(c *gin.Context) {
	artifactID, ok := parsePositivePathID(c, "id", "ID không hợp lệ")
	if !ok {
		return
	}
	artifact, err := ownedMindmapArtifact(h.DB, artifactID, auth.CurrentUser(c), false)
	if err != nil {
		writeMindmapArtifactError(c, err)
		return
	}
	var attachments []models.MindmapAttachment
	if err := h.DB.Select("id", "artifact_id", "node_id", "name", "size", "content_type", "created_at").
		Where("artifact_id = ?", artifact.ID).Order("created_at ASC, id ASC").Find(&attachments).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không đọc được tệp đính kèm"})
		return
	}
	if attachments == nil {
		attachments = []models.MindmapAttachment{}
	}
	c.JSON(http.StatusOK, gin.H{"attachments": attachments})
}

// UploadMindmapAttachment handles POST /api/artifacts/:id/mindmap/attachments.
func (h *Handler) UploadMindmapAttachment(c *gin.Context) {
	artifactID, ok := parsePositivePathID(c, "id", "ID không hợp lệ")
	if !ok {
		return
	}
	me := auth.CurrentUser(c)
	artifact, err := ownedMindmapArtifact(h.DB, artifactID, me, false)
	if err != nil {
		writeMindmapArtifactError(c, err)
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxMindmapUploadBody)
	if err := c.Request.ParseMultipartForm(32 << 20); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "Tệp vượt quá 10 MiB"})
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu multipart không hợp lệ"})
		}
		return
	}
	if c.Request.MultipartForm != nil {
		defer c.Request.MultipartForm.RemoveAll()
	}
	nodeID := strings.TrimSpace(c.PostForm("node_id"))
	if !mindmapAttachmentNodeIDValid(nodeID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "node_id không hợp lệ"})
		return
	}
	nodes, err := mindmapNodeIDs(artifact.Content)
	if err != nil || !nodes[nodeID] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Nút sơ đồ không tồn tại"})
		return
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cần tệp Word hoặc Excel"})
		return
	}
	name, fileType, err := cleanUploadFilename(fileHeader.Filename)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Chỉ nhận tệp .doc, .docx, .xls hoặc .xlsx"})
		return
	}
	file, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Không đọc được tệp"})
		return
	}
	data, readErr := io.ReadAll(io.LimitReader(file, maxMindmapAttachmentSize+1))
	closeErr := file.Close()
	if readErr != nil || closeErr != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Không đọc được tệp"})
		return
	}
	if int64(len(data)) > maxMindmapAttachmentSize {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "Tệp vượt quá 10 MiB"})
		return
	}
	if len(data) == 0 || validateOfficeFile(data, fileType) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Tệp Office không đúng định dạng hoặc bị hỏng"})
		return
	}

	attachment := models.MindmapAttachment{
		ArtifactID:  artifact.ID,
		NodeID:      nodeID,
		Name:        name,
		Size:        int64(len(data)),
		ContentType: fileType.contentType,
		Data:        data,
	}
	err = h.DB.Transaction(func(tx *gorm.DB) error {
		locked, err := ownedMindmapArtifact(tx, artifactID, me, true)
		if err != nil {
			return err
		}
		currentNodes, err := mindmapNodeIDs(locked.Content)
		if err != nil || !currentNodes[nodeID] {
			return errMindmapNodeNotFound
		}
		var used int64
		if err := tx.Model(&models.MindmapAttachment{}).Where("artifact_id = ?", artifactID).
			Select("COALESCE(SUM(size), 0)").Scan(&used).Error; err != nil {
			return err
		}
		if attachment.Size > maxMindmapAttachmentsSize-used {
			return errMindmapAttachmentQuota
		}
		return tx.Create(&attachment).Error
	})
	if err != nil {
		switch {
		case errors.Is(err, errMindmapAttachmentQuota):
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "Tổng tệp đính kèm của sơ đồ vượt quá 50 MiB"})
		case errors.Is(err, errMindmapNodeNotFound):
			c.JSON(http.StatusBadRequest, gin.H{"error": "Nút sơ đồ không tồn tại"})
		case errors.Is(err, errMindmapArtifactNotFound), errors.Is(err, errNotMindmapArtifact):
			writeMindmapArtifactError(c, err)
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Không lưu được tệp đính kèm"})
		}
		return
	}
	c.JSON(http.StatusCreated, gin.H{"attachment": attachment})
}

func mindmapAttachmentNodeIDValid(id string) bool {
	if id == "" || len(id) > 128 || !utf8.ValidString(id) {
		return false
	}
	for i, r := range id {
		if i == 0 {
			if !((r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z')) {
				return false
			}
			continue
		}
		if !((r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') ||
			(r >= '0' && r <= '9') || r == '_' || r == '-') {
			return false
		}
	}
	return true
}

// DownloadMindmapAttachment handles GET /api/artifacts/:id/mindmap/attachments/:attachmentId.
func (h *Handler) DownloadMindmapAttachment(c *gin.Context) {
	artifactID, ok := parsePositivePathID(c, "id", "ID không hợp lệ")
	if !ok {
		return
	}
	attachmentID, ok := parsePositivePathID(c, "attachmentId", "ID tệp không hợp lệ")
	if !ok {
		return
	}
	artifact, err := ownedMindmapArtifact(h.DB, artifactID, auth.CurrentUser(c), false)
	if err != nil {
		writeMindmapArtifactError(c, err)
		return
	}
	var attachment models.MindmapAttachment
	if err := h.DB.Where("id = ? AND artifact_id = ?", attachmentID, artifact.ID).First(&attachment).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy tệp đính kèm"})
		return
	}
	disposition := mime.FormatMediaType("attachment", map[string]string{"filename": attachment.Name})
	c.Header("Content-Disposition", disposition)
	c.Header("Content-Length", strconv.FormatInt(int64(len(attachment.Data)), 10))
	c.Header("Cache-Control", "private, no-store")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Data(http.StatusOK, attachment.ContentType, attachment.Data)
}

// DeleteMindmapAttachment handles DELETE /api/artifacts/:id/mindmap/attachments/:attachmentId.
func (h *Handler) DeleteMindmapAttachment(c *gin.Context) {
	artifactID, ok := parsePositivePathID(c, "id", "ID không hợp lệ")
	if !ok {
		return
	}
	attachmentID, ok := parsePositivePathID(c, "attachmentId", "ID tệp không hợp lệ")
	if !ok {
		return
	}
	artifact, err := ownedMindmapArtifact(h.DB, artifactID, auth.CurrentUser(c), false)
	if err != nil {
		writeMindmapArtifactError(c, err)
		return
	}
	result := h.DB.Where("id = ? AND artifact_id = ?", attachmentID, artifact.ID).Delete(&models.MindmapAttachment{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không xóa được tệp đính kèm"})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy tệp đính kèm"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
