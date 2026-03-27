import { useState } from "react";
import { generateClient } from "aws-amplify/api";
import { CREATE_EVENT } from "../graphql/mutations";
import type { Event } from "../types";

const client = generateClient();

interface Props {
  onCreated: (event: Event) => void;
}

export function CreateEvent({ onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const result = await client.graphql({
        query: CREATE_EVENT,
        variables: { input: { title: title.trim(), description: description.trim() || undefined } },
      });
      const event = (result as { data: { createEvent: Event } }).data.createEvent;
      onCreated(event);
    } catch (err) {
      setError("イベントの作成に失敗しました");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>新しいイベントを作成</h2>
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.field}>
          <label style={styles.label}>イベント名 *</label>
          <input
            style={styles.input}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: 社内勉強会 2026年3月"
            required
          />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>説明（任意）</label>
          <textarea
            style={{ ...styles.input, height: 80, resize: "vertical" }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="イベントの概要を入力してください"
          />
        </div>
        {error && <p style={styles.error}>{error}</p>}
        <button style={styles.button} type="submit" disabled={loading || !title.trim()}>
          {loading ? "作成中..." : "イベントを作成"}
        </button>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: 480, margin: "0 auto", padding: 24 },
  heading: { fontSize: 22, fontWeight: 700, marginBottom: 20, color: "#1a1a2e" },
  form: { display: "flex", flexDirection: "column", gap: 16 },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 14, fontWeight: 600, color: "#444" },
  input: {
    padding: "10px 12px", fontSize: 15, border: "1.5px solid #ddd",
    borderRadius: 8, outline: "none", width: "100%",
  },
  error: { color: "#e53e3e", fontSize: 14 },
  button: {
    padding: "12px 0", fontSize: 16, fontWeight: 600, color: "#fff",
    background: "#4f46e5", border: "none", borderRadius: 8, cursor: "pointer",
  },
};
