import { WebSocketServer } from "ws";
import { createServer } from "http";

const PORT = process.env.PORT || 8080;
const server = createServer((_, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end("Tag Game 2 relay server");
});
const wss = new WebSocketServer({ server });

// rooms: Map<roomCode, Set<WebSocket>>
const rooms = new Map();

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://localhost");
  const room = (url.searchParams.get("room") ?? "default").slice(0, 16);

  if (!rooms.has(room)) rooms.set(room, new Set());
  const members = rooms.get(room);
  members.add(ws);

  ws.on("message", (data) => {
    for (const peer of members) {
      if (peer !== ws && peer.readyState === 1) peer.send(data);
    }
  });

  ws.on("close", () => {
    members.delete(ws);
    if (members.size === 0) rooms.delete(room);
  });

  ws.on("error", () => ws.terminate());
});

server.listen(PORT, () => console.log(`Tag Game 2 relay on :${PORT}`));
