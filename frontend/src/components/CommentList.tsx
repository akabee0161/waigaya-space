import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Comment } from "../types";
import { imageUrl } from "../utils/image";

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

// 入室直後、画像の読み込みで高さが変わっても一番下に合わせ続ける時間の上限
const INITIAL_PIN_MS = 10_000;

// 利用者が自分でスクロールしたとみなすキー
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

export function CommentList({ comments, loading, onReact }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const initialScrolled = useRef(false);
  const [pinned, setPinned] = useState(false);
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [, forceUpdate] = useState(0);

  // 初回の読み込みは描画前に一番下へ移動し、スクロールの動きを見せない。以降の新着は滑らかに追う
  useLayoutEffect(() => {
    if (loading || comments.length === 0) return;
    if (initialScrolled.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    initialScrolled.current = true;
    bottomRef.current?.scrollIntoView({ block: "end" });
    setPinned(true);
  }, [comments.length, loading]);

  // 入室直後は、利用者が自分でスクロールするまで（上限 INITIAL_PIN_MS）高さの変化に追従する
  useEffect(() => {
    if (!pinned) return;
    const list = listRef.current;
    if (!list) return;
    const observer = new ResizeObserver(() => bottomRef.current?.scrollIntoView({ block: "end" }));
    observer.observe(list);
    const unpin = () => setPinned(false);
    // 文字の入力では止めず、入力欄の外でスクロールに使うキーが押されたときだけ止める
    const onKey = (e: KeyboardEvent) => {
      if (!SCROLL_KEYS.has(e.key)) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      unpin();
    };
    // スクロールバーをつかんだときだけ止める（押した先が一覧の中身ではなく、スクロールする枠そのもの）
    const scrollContainer = list.parentElement;
    const onPointerDown = (e: PointerEvent) => {
      if (e.target === scrollContainer) unpin();
    };
    const timer = setTimeout(unpin, INITIAL_PIN_MS);
    const opts = { passive: true, once: true } as const;
    scrollContainer?.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("wheel", unpin, opts);
    window.addEventListener("touchstart", unpin, opts);
    window.addEventListener("keydown", onKey);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
      scrollContainer?.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("wheel", unpin);
      window.removeEventListener("touchstart", unpin);
      window.removeEventListener("keydown", onKey);
    };
  }, [pinned]);

  // 拡大表示中は操作位置を ✕ ボタンに閉じ込め、閉じたら開いた元の画像に戻す
  useEffect(() => {
    if (!zoomUrl) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setZoomUrl(null);
      } else if (e.key === "Tab") {
        e.preventDefault(); // ダイアログ内で操作できるのは ✕ ボタンだけ
        closeBtnRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [zoomUrl]);

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
    <div ref={listRef} style={styles.list}>
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
            {comment.imageKey && (
              <a
                href={imageUrl(comment.imageKey)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.preventDefault();
                  setZoomUrl(imageUrl(comment.imageKey!));
                }}
              >
                <img
                  src={imageUrl(comment.imageKey)}
                  alt="添付画像"
                  loading="lazy"
                  style={styles.image}
                />
              </a>
            )}
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
      {zoomUrl && (
        <div
          style={styles.lightbox}
          role="dialog"
          aria-modal="true"
          aria-label="画像の拡大表示"
          onClick={() => setZoomUrl(null)}
        >
          <img
            src={zoomUrl}
            alt="添付画像（拡大）"
            style={styles.lightboxImage}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            ref={closeBtnRef}
            type="button"
            style={styles.lightboxClose}
            onClick={() => setZoomUrl(null)}
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  list: { display: "flex", flexDirection: "column", gap: 10, padding: "8px 0" },
  lightbox: {
    position: "fixed", inset: 0, zIndex: 100, display: "flex",
    alignItems: "center", justifyContent: "center",
    background: "rgba(0,0,0,0.85)", padding: 16,
  },
  lightboxImage: {
    maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 4,
  },
  lightboxClose: {
    position: "absolute", top: 12, right: 12, width: 40, height: 40,
    background: "rgba(255,255,255,0.15)", color: "#fff", border: "none",
    borderRadius: "50%", fontSize: 18, cursor: "pointer",
  },
  card: {
    background: "#fff", borderRadius: 10, padding: "12px 16px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)", border: "1px solid #f0f0f0",
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  author: { fontWeight: 700, fontSize: 14, color: "#4f46e5" },
  time: { fontSize: 12, color: "#999" },
  content: { fontSize: 15, color: "#222", lineHeight: 1.5, wordBreak: "break-word", whiteSpace: "pre-wrap", marginBottom: 10 },
  image: {
    display: "block", maxWidth: "100%", maxHeight: 300, borderRadius: 8,
    marginBottom: 10, border: "1px solid #eee",
  },
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
