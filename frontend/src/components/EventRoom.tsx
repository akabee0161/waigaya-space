import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { useComments } from "../hooks/useComments";
import { CommentList } from "./CommentList";
import { validateImage, ALLOWED_IMAGE_TYPES } from "../utils/image";
import type { Event } from "../types";

interface Props {
  event: Event;
  onLeave: () => void;
}

const AUTHOR_KEY = "ic_author_name";

function CameraIcon() {
  return (
    <svg
      width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ display: "block" }}
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ display: "block" }}
    >
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </svg>
  );
}

// 指で操作する端末（スマホ・タブレット）かどうか
const isTouchDevice = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

// 入力欄が伸びる上限（約 6 行）
const TEXTAREA_MAX_HEIGHT = 6 * 22;

// ヘッダーをスマホ向けの省略表示に切り替える幅
const NARROW_QUERY = "(max-width: 600px)";

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

function MoreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ display: "block" }}>
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

// アドレスバーの出入りで高さが変わるスマホでも画面に収める（未対応ブラウザーは 100vh）
const FULL_HEIGHT =
  typeof CSS !== "undefined" && CSS.supports("height", "100dvh") ? "100dvh" : "100vh";

const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

export function EventRoom({ event, onLeave }: Props) {
  const [authorName, setAuthorName] = useState(
    () => localStorage.getItem(AUTHOR_KEY) ?? ""
  );
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0); // 子要素をまたぐ dragenter/leave の対策
  const isNarrow = useMediaQuery(NARROW_QUERY);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isNarrow) setMenuOpen(false);
  }, [isNarrow]);

  // メニューを閉じたら、操作位置を ⋯ ボタンに戻す（項目が消えて行き場を失わないように）
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      menuBtnRef.current?.focus();
    };
  }, [menuOpen]);

  // 入力に合わせて高さを伸ばす（上限を超えたら入力欄の中でスクロール）
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
  }, [content]);

  useEffect(() => {
    if (!image) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(image);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const selectImage = (file: File | undefined) => {
    if (!file || submitting) return;
    const err = validateImage(file);
    if (err) { setPostError(err); return; }
    setPostError(null);
    setImage(file);
  };

  const { comments, loading, error, postComment, uploadImage, reactToComment } = useComments(event.eventId);

  const handleDownloadCSV = () => {
    const EMOJIS = ["👍", "❤️", "😂", "😮", "👏"];
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;

    const header = ["投稿時刻", "投稿者名", "コメント", ...EMOJIS].map(escape).join(",");
    const rows = comments.map((c) => {
      const time = new Date(c.createdAt).toLocaleString("ja-JP");
      const counts = EMOJIS.map((e) => c.reactions?.[e] ?? 0);
      const text = c.imageKey ? `${c.content} [画像添付]` : c.content;
      return [escape(time), escape(c.authorName), escape(text), ...counts].join(",");
    });

    const bom = "\uFEFF";
    const blob = new Blob([bom + [header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${event.title}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const canSend = !submitting && !!content.trim() && !!authorName.trim();

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;

    setSubmitting(true);
    setPostError(null);
    try {
      localStorage.setItem(AUTHOR_KEY, authorName.trim());
      const imageKey = image ? await uploadImage(image) : undefined;
      await postComment(content.trim(), authorName.trim(), imageKey);
      setContent("");
      setImage(null);
    } catch (err) {
      setPostError("コメントの投稿に失敗しました");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    if (isTouchDevice) return; // スマホのキーボードには Shift がないため Enter は改行、送信はボタンで行う
    if (e.shiftKey) return; // Shift+Enter は改行
    e.preventDefault();
    handlePost(e as unknown as React.FormEvent);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (submitting) return;
    const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
    if (file) {
      e.preventDefault();
      selectImage(file);
    }
  };

  // ドラッグ&ドロップで画像を添付（ルーム内のどこへドロップしても受け付ける）
  const handleDragEnter = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const handleDragOver = (e: React.DragEvent) => {
    if (hasFiles(e)) e.preventDefault(); // drop を受け付ける
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); // ブラウザが画像を開いてしまうのを防ぐ
    dragDepth.current = 0;
    setDragging(false);
    if (!event.isActive) return;
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
    if (file) {
      selectImage(file);
    } else {
      setPostError("画像ファイルをドロップしてください");
    }
  };

  return (
    <div
      style={styles.container}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragging && event.isActive && (
        <div style={styles.dropOverlay}>画像をドロップして添付</div>
      )}
      {/* ヘッダー（スマホ幅ではイベント名とコードだけを出し、残りは ⋯ のメニューにしまう） */}
      {isNarrow ? (
        <div style={styles.headerNarrow}>
          <div style={styles.titleBox}>
            <h1 style={styles.titleNarrow}>{event.title}</h1>
            <span style={styles.codeNarrow}>{event.participantCode}</span>
          </div>
          <button
            ref={menuBtnRef}
            type="button"
            style={{ ...styles.menuBtn, ...(menuOpen ? styles.menuBtnOpen : {}) }}
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="メニュー"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <MoreIcon />
          </button>
          {menuOpen && (
            <div style={styles.menu} role="menu">
              <p style={styles.menuTitle}>{event.title}</p>
              {event.description && <p style={styles.menuDescription}>{event.description}</p>}
              <div style={styles.menuCode}>
                <span>参加コード</span>
                <span style={styles.menuCodeValue}>{event.participantCode}</span>
              </div>
              <div style={styles.menuSeparator} />
              <button
                type="button"
                role="menuitem"
                style={{ ...styles.menuItem, ...(loading || comments.length === 0 ? styles.menuItemDisabled : {}) }}
                onClick={() => { handleDownloadCSV(); setMenuOpen(false); }}
                disabled={loading || comments.length === 0}
              >
                CSV をダウンロード
              </button>
              <button
                type="button"
                role="menuitem"
                style={{ ...styles.menuItem, ...styles.menuItemLeave }}
                onClick={() => { setMenuOpen(false); onLeave(); }}
              >
                退出
              </button>
            </div>
          )}
        </div>
      ) : (
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
            <button style={styles.csvBtn} onClick={handleDownloadCSV} disabled={loading || comments.length === 0}>
              DL
            </button>
            <button style={styles.leaveBtn} onClick={onLeave}>
              退出
            </button>
          </div>
        </div>
      )}
      {isNarrow && menuOpen && <div style={styles.scrim} onClick={() => setMenuOpen(false)} />}

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
            readOnly={submitting}
            required
            maxLength={50}
          />
          <div style={{ ...styles.composer, ...(focused ? styles.composerFocused : {}) }}>
            {previewUrl && (
              <div style={styles.previewRow}>
                <img src={previewUrl} alt="添付プレビュー" style={styles.preview} />
                <button
                  type="button"
                  style={styles.removeImageBtn}
                  onClick={() => setImage(null)}
                  disabled={submitting}
                >
                  ✕ 画像を外す
                </button>
              </div>
            )}
            <textarea
              ref={textareaRef}
              style={styles.textarea}
              placeholder={
                isTouchDevice ? "コメントを入力…" : "コメントを入力… (Enter で送信 / Shift+Enter で改行)"
              }
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              readOnly={submitting}
              required
              maxLength={500}
              rows={1}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_IMAGE_TYPES.join(",")}
              style={{ display: "none" }}
              onChange={(e) => {
                selectImage(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <div style={styles.toolbar}>
              <button
                type="button"
                style={styles.attachBtn}
                onClick={() => fileInputRef.current?.click()}
                disabled={submitting}
                title="画像を添付"
                aria-label="画像を添付"
              >
                <CameraIcon />
              </button>
              <div style={styles.toolbarRight}>
                <span style={styles.hint}>{content.length} / 500</span>
                <button
                  style={{ ...styles.sendBtn, opacity: canSend ? 1 : 0.4 }}
                  type="submit"
                  disabled={!canSend}
                  title={submitting ? "送信中" : "送信"}
                  aria-label={submitting ? "送信中" : "送信"}
                >
                  <SendIcon />
                </button>
              </div>
            </div>
          </div>
          {postError && <p style={styles.error}>{postError}</p>}
        </form>
      ) : (
        <div style={styles.closed}>このイベントは終了しました</div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: "flex", flexDirection: "column", height: FULL_HEIGHT, maxWidth: 720, margin: "0 auto", position: "relative" },
  dropOverlay: {
    position: "absolute", inset: 0, zIndex: 20, display: "flex",
    alignItems: "center", justifyContent: "center", pointerEvents: "none",
    background: "rgba(79,70,229,0.12)", border: "3px dashed #4f46e5",
    color: "#4f46e5", fontSize: 18, fontWeight: 700,
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    padding: "16px 20px", background: "#fff", borderBottom: "1px solid #eee",
    flexShrink: 0,
  },
  headerNarrow: {
    display: "flex", alignItems: "center", gap: 6,
    padding: "8px 6px 8px 14px", background: "#fff", borderBottom: "1px solid #eee",
    flexShrink: 0, position: "relative", zIndex: 31, // メニューを開いても ⋯ は暗くせず押せるようにする
  },
  titleBox: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column" },
  titleNarrow: {
    fontSize: 16, fontWeight: 700, color: "#1a1a2e",
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  },
  codeNarrow: { fontSize: 12, fontWeight: 700, color: "#4f46e5", letterSpacing: 1.5 },
  menuBtn: {
    width: 36, height: 36, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
    background: "transparent", border: "none", borderRadius: "50%", cursor: "pointer", color: "#666",
  },
  menuBtnOpen: { background: "#f5f5f5" },
  menu: {
    position: "absolute", top: "calc(100% + 4px)", right: 8, left: 40,
    display: "flex", flexDirection: "column", padding: 8,
    background: "#fff", border: "1px solid #eee", borderRadius: 12,
    boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
  },
  menuTitle: { padding: "6px 10px 2px", fontSize: 15, fontWeight: 700, color: "#1a1a2e", lineHeight: 1.45, wordBreak: "break-word" },
  menuDescription: { padding: "2px 10px 6px", fontSize: 12, color: "#666", lineHeight: 1.5, wordBreak: "break-word" },
  menuCode: {
    display: "flex", justifyContent: "space-between", alignItems: "baseline",
    padding: "6px 10px", fontSize: 12, color: "#666",
  },
  menuCodeValue: { fontSize: 18, fontWeight: 800, color: "#4f46e5", letterSpacing: 3 },
  menuSeparator: { height: 1, background: "#eee", margin: "4px 2px" },
  menuItem: {
    padding: 10, fontSize: 14, textAlign: "left", color: "#1a1a2e",
    background: "transparent", border: "none", borderRadius: 8, cursor: "pointer",
  },
  menuItemDisabled: { color: "#bbb", cursor: "default" },
  menuItemLeave: { color: "#c92a2a" },
  scrim: { position: "fixed", inset: 0, zIndex: 30, background: "rgba(0,0,0,0.25)" },
  title: { fontSize: 20, fontWeight: 700, color: "#1a1a2e" },
  description: { fontSize: 13, color: "#666", marginTop: 4 },
  headerRight: { display: "flex", alignItems: "center", gap: 12 },
  codeBox: {
    display: "flex", flexDirection: "column", alignItems: "center",
    background: "#f0f0ff", borderRadius: 8, padding: "6px 14px",
  },
  codeLabel: { fontSize: 10, color: "#888", letterSpacing: 1 },
  code: { fontSize: 22, fontWeight: 800, color: "#4f46e5", letterSpacing: 3 },
  csvBtn: {
    padding: "6px 14px", background: "transparent", border: "1.5px solid #ddd",
    borderRadius: 6, cursor: "pointer", fontSize: 13, color: "#4f46e5",
  },
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
  composer: {
    display: "flex", flexDirection: "column", gap: 4,
    padding: "8px 10px 6px", border: "1.5px solid #ddd", borderRadius: 16,
    background: "#fff",
  },
  composerFocused: { borderColor: "#818cf8" },
  textarea: {
    width: "100%", padding: "4px 4px", fontSize: 16, lineHeight: "22px",
    border: "none", outline: "none", resize: "none", background: "transparent",
    fontFamily: "inherit", maxHeight: TEXTAREA_MAX_HEIGHT, overflowY: "auto",
  },
  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  toolbarRight: { display: "flex", alignItems: "center", gap: 10 },
  attachBtn: {
    width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
    background: "transparent", border: "none", borderRadius: "50%",
    cursor: "pointer", color: "#4f46e5",
  },
  previewRow: { display: "flex", alignItems: "center", gap: 10, padding: "2px 4px" },
  preview: { maxHeight: 80, maxWidth: 160, borderRadius: 6, border: "1px solid #eee" },
  removeImageBtn: {
    background: "transparent", border: "none", cursor: "pointer",
    color: "#666", fontSize: 12,
  },
  sendBtn: {
    width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
    background: "#4f46e5", color: "#fff", border: "none", borderRadius: "50%",
    cursor: "pointer",
  },
  error: { color: "#e53e3e", fontSize: 13 },
  hint: { fontSize: 11, color: "#bbb" },
  closed: {
    padding: 20, textAlign: "center", color: "#888",
    background: "#f9f9f9", borderTop: "1px solid #eee",
  },
};
