package worker

import (
	"errors"
	"sync"
	"testing"

	"github.com/ai-for-edu/edutech-ai/backend/internal/ollama"
)

type usageReply struct {
	content string
	usage   ollama.Usage
	err     error
}

type fakeUsageChatter struct {
	mu      sync.Mutex
	replies []usageReply
}

func (f *fakeUsageChatter) ChatStructuredWithUsage(model, system, user string, schema map[string]any) (ollama.ChatResult, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	reply := f.replies[0]
	f.replies = f.replies[1:]
	return ollama.ChatResult{Content: reply.content, Usage: reply.usage}, reply.err
}

func TestJobUsageChatterSumsMultipleCallsIncludingBeforeFailure(t *testing.T) {
	base := &fakeUsageChatter{replies: []usageReply{
		{content: `{}`, usage: ollama.Usage{PromptTokens: 10, CompletionTokens: 4, TotalTokens: 14, Recorded: true}},
		{usage: ollama.Usage{PromptTokens: 7, CompletionTokens: 2, TotalTokens: 9, Recorded: true}, err: errors.New("call failed")},
	}}
	tracker := newJobUsageChatter(base)

	if _, err := tracker.ChatStructured("m", "s", "u", nil); err != nil {
		t.Fatalf("call đầu lỗi: %v", err)
	}
	if _, err := tracker.ChatStructured("m", "s", "u", nil); err == nil {
		t.Fatalf("call thứ hai phải trả lỗi giả lập")
	}
	got := tracker.Usage()
	if got.PromptTokens != 17 || got.CompletionTokens != 6 || got.TotalTokens != 23 {
		t.Fatalf("usage cộng sai: %+v", got)
	}
	if !got.Recorded {
		t.Fatalf("failed job vẫn phải ghi nhận khi mọi call đã trả count")
	}
}

func TestJobUsageChatterKeepsConcurrentJobsIsolated(t *testing.T) {
	first := newJobUsageChatter(&fakeUsageChatter{replies: []usageReply{{usage: ollama.Usage{PromptTokens: 3, CompletionTokens: 5, TotalTokens: 8, Recorded: true}}}})
	second := newJobUsageChatter(&fakeUsageChatter{replies: []usageReply{{usage: ollama.Usage{PromptTokens: 101, CompletionTokens: 7, TotalTokens: 108, Recorded: true}}}})

	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); _, _ = first.ChatStructured("m", "s", "u", nil) }()
	go func() { defer wg.Done(); _, _ = second.ChatStructured("m", "s", "u", nil) }()
	wg.Wait()

	if got := first.Usage(); got.TotalTokens != 8 {
		t.Fatalf("job 1 bị trộn usage: %+v", got)
	}
	if got := second.Usage(); got.TotalTokens != 108 {
		t.Fatalf("job 2 bị trộn usage: %+v", got)
	}
}

func TestJobUsageChatterKeepsRecordedCallsWhenLaterCallMissesCounts(t *testing.T) {
	tracker := newJobUsageChatter(&fakeUsageChatter{replies: []usageReply{
		{usage: ollama.Usage{PromptTokens: 3, CompletionTokens: 5, TotalTokens: 8, Recorded: true}},
		{content: `{}`, usage: ollama.Usage{PromptTokens: 99}},
	}})
	_, _ = tracker.ChatStructured("m", "s", "u", nil)
	_, _ = tracker.ChatStructured("m", "s", "u", nil)
	got := tracker.Usage()
	if !got.Recorded || got.TotalTokens != 8 || got.PromptTokens != 3 || got.CompletionTokens != 5 {
		t.Fatalf("phải giữ đúng phần đã đo, bỏ call thiếu count: %+v", got)
	}
}

func TestJobUsageChatterLeavesJobUnrecordedWhenEveryCallMissesCounts(t *testing.T) {
	tracker := newJobUsageChatter(&fakeUsageChatter{replies: []usageReply{{content: `{}`, usage: ollama.Usage{}}}})
	_, _ = tracker.ChatStructured("m", "s", "u", nil)
	if got := tracker.Usage(); got.Recorded || got.TotalTokens != 0 {
		t.Fatalf("không có call đủ count phải để job chưa ghi nhận: %+v", got)
	}
}
