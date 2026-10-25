import { useState, useEffect, useRef } from "react";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/api";
import { JoinEvent } from "./components/JoinEvent";
import { CreateEvent } from "./components/CreateEvent";
import { EventRoom } from "./components/EventRoom";
import { GET_EVENT_BY_CODE } from "./graphql/queries";
import type { Event } from "./types";

// CDK デプロイ後に cdk deploy の出力値を設定してください
Amplify.configure({
  API: {
    GraphQL: {
      endpoint: import.meta.env.VITE_APPSYNC_URL as string,
      region: import.meta.env.VITE_AWS_REGION as string ?? "ap-northeast-1",
      defaultAuthMode: "apiKey",
      apiKey: import.meta.env.VITE_APPSYNC_API_KEY as string,
    },
  },
});

type Screen = "join" | "create" | "room";

const client = generateClient();

const roomPath = (code: string) => `/e/${encodeURIComponent(code)}`;

// /e/<参加コード> から参加コードを取り出す
const codeFromPath = (): string | null => {
  const m = window.location.pathname.match(/^\/e\/([^/]+)\/?$/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]).toUpperCase();
  } catch {
    return null; // 不正なエンコードは参加画面へ
  }
};

export default function App() {
  const [screen, setScreen] = useState<Screen>("join");
  const [currentEvent, setCurrentEvent] = useState<Event | null>(null);
  const [restoring, setRestoring] = useState(() => codeFromPath() !== null);
  // restore 呼び出しごとの世代。古い応答が新しい画面を上書きしないようにする
  const restoreGen = useRef(0);

  // URL の参加コードからイベントを復元（リロード・URL 共有・戻る/進む）
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      const gen = ++restoreGen.current;
      const isStale = () => cancelled || gen !== restoreGen.current;
      const code = codeFromPath();
      if (!code) {
        setCurrentEvent(null);
        setScreen("join");
        setRestoring(false);
        return;
      }
      setRestoring(true);
      try {
        const result = await client.graphql({
          query: GET_EVENT_BY_CODE,
          variables: { participantCode: code },
        });
        if (isStale()) return;
        const event = (result as { data: { getEventByCode: Event | null } })
          .data.getEventByCode;
        if (event) {
          setCurrentEvent(event);
          setScreen("room");
        } else {
          window.history.replaceState(null, "", "/");
          setScreen("join");
        }
      } catch (err) {
        console.error(err);
        if (!isStale()) setScreen("join");
      } finally {
        if (!isStale()) setRestoring(false);
      }
    };
    restore();
    const onPopState = () => { restore(); };
    window.addEventListener("popstate", onPopState);
    return () => {
      cancelled = true;
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  const enterRoom = (event: Event) => {
    window.history.pushState(null, "", roomPath(event.participantCode));
    setCurrentEvent(event);
    setScreen("room");
  };

  const handleJoined = enterRoom;
  const handleCreated = enterRoom;

  const handleLeave = () => {
    window.history.pushState(null, "", "/");
    setCurrentEvent(null);
    setScreen("join");
  };

  if (restoring) {
    return <div style={styles.page} />;
  }

  if (screen === "room" && currentEvent) {
    return <EventRoom event={currentEvent} onLeave={handleLeave} />;
  }

  if (screen === "create") {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <button style={styles.backBtn} onClick={() => setScreen("join")}>
            ← 戻る
          </button>
          <CreateEvent onCreated={handleCreated} />
        </div>
      </div>
    );
  }

  return (
    <JoinEvent
      onJoined={handleJoined}
      onCreateNew={() => setScreen("create")}
    />
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh", display: "flex", alignItems: "center",
    justifyContent: "center", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    padding: 20,
  },
  card: {
    background: "#fff", borderRadius: 16, padding: "32px 36px",
    width: "100%", maxWidth: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
  },
  backBtn: {
    background: "transparent", border: "none", cursor: "pointer",
    color: "#4f46e5", fontSize: 14, fontWeight: 600, marginBottom: 16, padding: 0,
  },
};
