// In-memory JWT store for the candidate client.
// Deliberately NOT localStorage/sessionStorage — a hard refresh should wipe
// the token (and trigger disqualification via the socket's reconnection:false).

let token: string | null = null;

export function getToken(): string | null {
  return token;
}

export function setToken(value: string | null): void {
  token = value;
}