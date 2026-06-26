import http from "k6/http";
import ws from "k6/ws";
import { sleep, check, group } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const WS_URL   = __ENV.WS_URL   || "ws://localhost:4000";
const AUTH_TOKEN = __ENV.AUTH_TOKEN || "";

export const options = {
  stages: [
    { duration: "5m",  target: 15000 }, // ramp up — candidates logging in
    { duration: "10m", target: 15000 }, // hold — waiting room + exam in progress
    { duration: "5m",  target: 0 },     // ramp down — completions
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"],  // 95th pct HTTP response under 500ms
    ws_connecting:     ["p(95)<1000"], // WebSocket handshake under 1s
    http_req_failed:   ["rate<0.001"], // HTTP error rate under 0.1%
  },
};

const headers = { Authorization: `Bearer ${AUTH_TOKEN}` };

export default function () {
  // ── HTTP polling leg ────────────────────────────────────────────────────────
  // Mirrors what a real candidate browser does: poll broadcast every 20s,
  // poll session-stats every 10s.
  group("http-polling", () => {
    const broadcastRes = http.get(`${BASE_URL}/api/candidate/broadcast`, { headers });
    check(broadcastRes, { "broadcast 200": (r) => r.status === 200 });

    sleep(10);

    const statsRes = http.get(`${BASE_URL}/api/candidate/session-stats`, { headers });
    check(statsRes, { "session-stats 200": (r) => r.status === 200 });

    sleep(10);
  });

  // ── WebSocket leg ───────────────────────────────────────────────────────────
  // Connects using Socket.IO's WebSocket transport wire protocol.
  // Sends: Engine.IO open → Socket.IO CONNECT with auth → candidate:join event.
  group("websocket", () => {
    const wsUrl = `${WS_URL}/socket.io/?EIO=4&transport=websocket`;
    const res = ws.connect(wsUrl, { headers: { Origin: BASE_URL } }, (socket) => {
      socket.on("message", (msg) => {
        if (msg.startsWith("0")) {
          // Engine.IO OPEN — send Socket.IO CONNECT packet with auth token
          socket.send(`40{"token":"${AUTH_TOKEN}"}`);
        }
        if (msg.startsWith("40")) {
          // Socket.IO CONNECT ack — emit candidate:join
          socket.send('42["candidate:join"]');
        }
      });

      // Hold the connection for 20s (simulates sitting in waiting room / exam)
      socket.setTimeout(() => socket.close(), 20000);
    });

    check(res, { "websocket upgraded": (r) => r !== null && r.status === 101 });
  });
}
