# Load Tests

k6 scripts for validating the platform under 15k concurrent candidate load.

## Prerequisites

Install k6 (not a Node.js package — separate binary):

- **macOS:** `brew install k6`
- **Windows:** `winget install k6 --source winget`
- **Linux / Docker:** https://k6.io/docs/getting-started/installation/

## Environment variables

| Variable     | Description                              | Example                              |
|--------------|------------------------------------------|--------------------------------------|
| `BASE_URL`   | Next.js app URL (http or https)          | `https://staging.yourdomain.com`     |
| `WS_URL`     | Socket server URL (ws or wss)            | `wss://socket.railway.app`           |
| `AUTH_TOKEN` | Valid candidate JWT for a test campaign  | (see below)                          |

### Generating a test JWT

1. Register a test candidate on a test campaign via `/apply/[slug]`
2. Log in as that candidate at `/candidate/login`
3. Open browser DevTools → Application → Local Storage
4. Copy the value of `candidateToken`

## Smoke test (verify the script runs — use before the full load test)

```bash
BASE_URL=http://localhost:3000 \
WS_URL=ws://localhost:4000 \
AUTH_TOKEN=<your-jwt> \
k6 run --vus 50 --duration 30s load-tests/exam-session.js
```

## Full load test (15k candidates — run against staging only)

```bash
BASE_URL=https://staging.yourdomain.com \
WS_URL=wss://your-socket-server.railway.app \
AUTH_TOKEN=<your-jwt> \
k6 run load-tests/exam-session.js
```

## Pass criteria

All three thresholds must show `✓` at the end of the run:

| Threshold                         | Pass condition       |
|-----------------------------------|----------------------|
| `http_req_duration p(95)`         | < 500ms              |
| `ws_connecting p(95)`             | < 1000ms             |
| `http_req_failed rate`            | < 0.1%               |

k6 exits with code 99 if any threshold fails (useful for CI gating).
