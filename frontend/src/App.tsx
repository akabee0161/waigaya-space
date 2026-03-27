import { useState } from "react";
import { Amplify } from "aws-amplify";
import { JoinEvent } from "./components/JoinEvent";
import { CreateEvent } from "./components/CreateEvent";
import { EventRoom } from "./components/EventRoom";
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

export default function App() {
  const [screen, setScreen] = useState<Screen>("join");
  const [currentEvent, setCurrentEvent] = useState<Event | null>(null);

  const handleJoined = (event: Event) => {
    setCurrentEvent(event);
    setScreen("room");
  };

  const handleCreated = (event: Event) => {
    setCurrentEvent(event);
    setScreen("room");
  };

  const handleLeave = () => {
    setCurrentEvent(null);
    setScreen("join");
  };

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
