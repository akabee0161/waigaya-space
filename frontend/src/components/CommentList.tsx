import { useEffect, useRef } from "react";
import type { Comment } from "../types";

interface Props {
  comments: Comment[];
  loading: boolean;
}

export function CommentList({ comments, loading }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // 新しいコメントが追加されたら自動スクロール
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments.length]);

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
      {comments.map((comment) => (
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
        </div>
      ))}
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
  content: { fontSize: 15, color: "#222", lineHeight: 1.5, wordBreak: "break-word" },
  center: { textAlign: "center", color: "#888", padding: 32 },
  empty: { textAlign: "center", color: "#aaa", padding: 48, fontSize: 14 },
};
