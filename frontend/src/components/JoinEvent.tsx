import { useState } from "react";
import { generateClient } from "aws-amplify/api";
import { GET_EVENT_BY_CODE } from "../graphql/queries";
import type { Event } from "../types";

const client = generateClient();

interface Props {
  onJoined: (event: Event) => void;
  onCreateNew: () => void;
}

export function JoinEvent({ onJoined, onCreateNew }: Props) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    try {
      const result = await client.graphql({
        query: GET_EVENT_BY_CODE,
        variables: { participantCode: trimmed },
      });
      const event = (result as { data: { getEventByCode: Event | null } })
        .data.getEventByCode;
      if (!event) {
        setError("指定された参加コードのイベントが見つかりません");
        return;
      }
      onJoined(event);
    } catch (err) {
      setError("イベントの検索に失敗しました");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.appTitle}>waigaya.space</h1>
        <p style={styles.subtitle}>リアルタイムQ&Aプラットフォーム</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <h2 style={styles.sectionTitle}>参加コードで入室</h2>
          <input
            style={styles.codeInput}
            type="text"
            placeholder="例: AB1234"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            autoFocus
          />
          {error && <p style={styles.error}>{error}</p>}
          <button
            style={{ ...styles.btn, ...styles.primaryBtn }}
            type="submit"
            disabled={loading || !code.trim()}
          >
            {loading ? "検索中..." : "入室する"}
          </button>
        </form>

        <div style={styles.divider}>
          <span style={styles.dividerText}>または</span>
        </div>

        <button
          style={{ ...styles.btn, ...styles.secondaryBtn }}
          onClick={onCreateNew}
        >
          新しいイベントを作成
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh", display: "flex", alignItems: "center",
    justifyContent: "center", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    padding: 20,
  },
  card: {
    background: "#fff", borderRadius: 16, padding: "40px 36px",
    width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
  },
  appTitle: { fontSize: 26, fontWeight: 800, color: "#1a1a2e", textAlign: "center" },
  subtitle: { fontSize: 14, color: "#888", textAlign: "center", marginTop: 4, marginBottom: 32 },
  sectionTitle: { fontSize: 16, fontWeight: 600, color: "#333", marginBottom: 12 },
  form: { display: "flex", flexDirection: "column", gap: 12 },
  codeInput: {
    padding: "14px 16px", fontSize: 22, fontWeight: 700, letterSpacing: 4,
    textAlign: "center", border: "2px solid #e2e8f0", borderRadius: 10,
    outline: "none", textTransform: "uppercase",
  },
  error: { color: "#e53e3e", fontSize: 13 },
  btn: {
    padding: "13px 0", fontSize: 15, fontWeight: 600, borderRadius: 10,
    border: "none", cursor: "pointer", width: "100%",
  },
  primaryBtn: { background: "#4f46e5", color: "#fff" },
  secondaryBtn: {
    background: "transparent", color: "#4f46e5",
    border: "2px solid #4f46e5",
  },
  divider: {
    display: "flex", alignItems: "center", margin: "20px 0",
  },
  dividerText: {
    padding: "0 12px", color: "#aaa", fontSize: 13,
    background: "#fff", margin: "0 auto",
  },
};
