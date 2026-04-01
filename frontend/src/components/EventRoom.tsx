import { useState } from "react";
import { useComments } from "../hooks/useComments";
import { CommentList } from "./CommentList";
import type { Event } from "../types";

interface Props {
  event: Event;
  onLeave: () => void;
}

const AUTHOR_KEY = "ic_author_name";

export function EventRoom({ event, onLeave }: Props) {
  const [authorName, setAuthorName] = useState(
    () => localStorage.getItem(AUTHOR_KEY) ?? ""
  );
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const { comments, loading, error, postComment, reactToComment } = useComments(event.eventId);

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !authorName.trim()) return;

    setSubmitting(true);
    setPostError(null);
    try {
      localStorage.setItem(AUTHOR_KEY, authorName.trim());
      await postComment(content.trim(), authorName.trim());
      setContent("");
    } catch (err) {
      setPostError("コメントの投稿に失敗しました");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handlePost(e as unknown as React.FormEvent);
    }
  };

  return (
    <div style={styles.container}>
      {/* ヘッダー */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>{event.title}</h1>
          {event.description && (
            <p style={styles.description}>{event.description}</p>
          )}
        </div>
        <div style={styles.headerRight}>
          <div style={styles.codeBox}>
            <span style={styles.codeLabel}>参加コード</span>
            <span style={styles.code}>{event.participantCode}</span>
          </div>
          <button style={styles.leaveBtn} onClick={onLeave}>
            退出
          </button>
        </div>
      </div>

      {/* コメント一覧 */}
      <div style={styles.commentsArea}>
        {error && <p style={styles.error}>{error}</p>}
        <CommentList comments={comments} loading={loading} onReact={(createdAt, emoji, action) => reactToComment(createdAt, emoji, action)} />
      </div>

      {/* コメント投稿フォーム */}
      {event.isActive ? (
        <form style={styles.form} onSubmit={handlePost}>
          <input
            style={styles.nameInput}
            type="text"
            placeholder="お名前"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            required
            maxLength={50}
          />
          <div style={styles.textareaRow}>
            <textarea
              style={styles.textarea}
              placeholder="コメントを入力… (Ctrl+Enter で送信)"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              required
              maxLength={500}
              rows={3}
            />
            <button
              style={{
                ...styles.sendBtn,
                opacity: submitting || !content.trim() || !authorName.trim() ? 0.5 : 1,
              }}
              type="submit"
              disabled={submitting || !content.trim() || !authorName.trim()}
            >
              {submitting ? "送信中" : "送信"}
            </button>
          </div>
          {postError && <p style={styles.error}>{postError}</p>}
          <p style={styles.hint}>{content.length} / 500</p>
        </form>
      ) : (
        <div style={styles.closed}>このイベントは終了しました</div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: "flex", flexDirection: "column", height: "100vh", maxWidth: 720, margin: "0 auto" },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    padding: "16px 20px", background: "#fff", borderBottom: "1px solid #eee",
    flexShrink: 0,
  },
  title: { fontSize: 20, fontWeight: 700, color: "#1a1a2e" },
  description: { fontSize: 13, color: "#666", marginTop: 4 },
  headerRight: { display: "flex", alignItems: "center", gap: 12 },
  codeBox: {
    display: "flex", flexDirection: "column", alignItems: "center",
    background: "#f0f0ff", borderRadius: 8, padding: "6px 14px",
  },
  codeLabel: { fontSize: 10, color: "#888", letterSpacing: 1 },
  code: { fontSize: 22, fontWeight: 800, color: "#4f46e5", letterSpacing: 3 },
  leaveBtn: {
    padding: "6px 14px", background: "transparent", border: "1.5px solid #ddd",
    borderRadius: 6, cursor: "pointer", fontSize: 13, color: "#666",
  },
  commentsArea: { flex: 1, overflowY: "auto", padding: "8px 20px" },
  form: {
    padding: "12px 20px 20px", background: "#fff", borderTop: "1px solid #eee",
    display: "flex", flexDirection: "column", gap: 8, flexShrink: 0,
  },
  nameInput: {
    padding: "8px 12px", fontSize: 14, border: "1.5px solid #ddd",
    borderRadius: 8, outline: "none", width: 200,
  },
  textareaRow: { display: "flex", gap: 8, alignItems: "flex-end" },
  textarea: {
    flex: 1, padding: "10px 12px", fontSize: 14, border: "1.5px solid #ddd",
    borderRadius: 8, outline: "none", resize: "none",
  },
  sendBtn: {
    padding: "10px 20px", background: "#4f46e5", color: "#fff",
    border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600,
    fontSize: 14, whiteSpace: "nowrap",
  },
  error: { color: "#e53e3e", fontSize: 13 },
  hint: { fontSize: 11, color: "#bbb", textAlign: "right" },
  closed: {
    padding: 20, textAlign: "center", color: "#888",
    background: "#f9f9f9", borderTop: "1px solid #eee",
  },
};
