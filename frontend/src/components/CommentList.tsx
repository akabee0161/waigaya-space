import { useEffect, useRef, useState } from "react";
import type { Comment } from "../types";

const EMOJIS = ["👍", "❤️", "😂", "😮", "👏"];

const STORAGE_KEY = (commentId: string) => `waigaya_reacted_${commentId}`;

function getReacted(commentId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY(commentId)) ?? "[]");
  } catch {
    return [];
  }
}

function saveReacted(commentId: string, emojis: string[]) {
  localStorage.setItem(STORAGE_KEY(commentId), JSON.stringify(emojis));
}

interface Props {
  comments: Comment[];
  loading: boolean;
  onReact: (commentCreatedAt: string, emoji: string, action: "add" | "remove") => void;
}

export function CommentList({ comments, loading, onReact }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments.length]);

  const handleReact = (comment: Comment, emoji: string) => {
    const reacted = getReacted(comment.commentId);
    const already = reacted.includes(emoji);
    const action: "add" | "remove" = already ? "remove" : "add";

    if (already) {
      saveReacted(comment.commentId, reacted.filter((e) => e !== emoji));
    } else {
      saveReacted(comment.commentId, [...reacted, emoji]);
    }

    onReact(comment.createdAt, emoji, action);
    setOpenPickerId(null);
    forceUpdate((n) => n + 1);
  };

  if (loading) {
    return <div style={styles.center}>コメントを読み込み中...</div>;
  }

  if (comments.length === 0) {
    return (
      <div style={styles.empty}>
        <p>まだコメントはありません。最初のコメントを投稿しましょう！</p>
      </div>
    );
  }

  return (
    <div style={styles.list}>
      {comments.map((comment) => {
        const reacted = getReacted(comment.commentId);
        return (
          <div key={comment.commentId} style={styles.card}>
            <div style={styles.header}>
              <span style={styles.author}>{comment.authorName}</span>
              <span style={styles.time}>
                {new Date(comment.createdAt).toLocaleTimeString("ja-JP", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <p style={styles.content}>{comment.content}</p>
            <div style={styles.reactions}>
              {/* 既存リアクションの表示 */}
              {EMOJIS.filter((e) => (comment.reactions?.[e] ?? 0) > 0).map((emoji) => {
                const isMyReaction = reacted.includes(emoji);
                return (
                  <button
                    key={emoji}
                    style={{
                      ...styles.emojiBtn,
                      ...styles.emojiBtnActive,
                      ...(isMyReaction ? styles.emojiBtnMine : {}),
                    }}
                    onClick={() => handleReact(comment, emoji)}
                  >
                    {emoji}
                    <span style={styles.count}>{comment.reactions![emoji]}</span>
                  </button>
                );
              })}

              {/* リアクション追加ボタン */}
              <div style={styles.pickerWrapper}>
                <button
                  style={styles.addBtn}
                  onClick={() =>
                    setOpenPickerId(
                      openPickerId === comment.commentId ? null : comment.commentId
                    )
                  }
                >
                  ☺+
                </button>
                {openPickerId === comment.commentId && (
                  <div style={styles.picker}>
                    {EMOJIS.map((emoji) => {
                      const isMyReaction = reacted.includes(emoji);
                      return (
                        <button
                          key={emoji}
                          style={{
                            ...styles.pickerEmoji,
                            ...(isMyReaction ? styles.pickerEmojiMine : {}),
                          }}
                          onClick={() => handleReact(comment, emoji)}
                        >
                          {emoji}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  list: { display: "flex", flexDirection: "column", gap: 10, padding: "8px 0" },
  card: {
    background: "#fff", borderRadius: 10, padding: "12px 16px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)", border: "1px solid #f0f0f0",
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  author: { fontWeight: 700, fontSize: 14, color: "#4f46e5" },
  time: { fontSize: 12, color: "#999" },
  content: { fontSize: 15, color: "#222", lineHeight: 1.5, wordBreak: "break-word", marginBottom: 10 },
  reactions: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" },
  emojiBtn: {
    display: "flex", alignItems: "center", gap: 3,
    padding: "3px 8px", fontSize: 16,
    background: "#f5f5f5", border: "1.5px solid #e8e8e8",
    borderRadius: 20, cursor: "pointer",
    transition: "all 0.1s",
  },
  emojiBtnActive: {
    background: "#f5f5f5", borderColor: "#e8e8e8",
  },
  emojiBtnMine: {
    background: "#eff0ff", borderColor: "#818cf8", fontWeight: 700,
  },
  count: { fontSize: 12, color: "#555", fontWeight: 600 },
  addBtn: {
    display: "flex", alignItems: "center",
    padding: "3px 8px", fontSize: 16,
    background: "#f5f5f5", border: "1.5px solid #e8e8e8",
    borderRadius: 20, cursor: "pointer", color: "#888",
  },
  pickerWrapper: { position: "relative" },
  picker: {
    position: "absolute", bottom: "calc(100% + 6px)", left: 0,
    display: "flex", gap: 4, padding: "6px 8px",
    background: "#fff", border: "1.5px solid #e8e8e8",
    borderRadius: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
    zIndex: 10,
  },
  pickerEmoji: {
    fontSize: 20, padding: "4px 6px", background: "transparent",
    border: "none", cursor: "pointer", borderRadius: 8,
  },
  pickerEmojiMine: {
    background: "#eff0ff",
  },
  center: { textAlign: "center", color: "#888", padding: 32 },
  empty: { textAlign: "center", color: "#aaa", padding: 48, fontSize: 14 },
};
