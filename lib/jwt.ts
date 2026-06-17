import jwt, { JwtPayload } from "jsonwebtoken";

export interface TokenPayload extends JwtPayload {
  candidateId: string;
  rollNumber: string;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is missing from environment variables");
  }
  return secret;
}

export function signToken(candidateId: string, rollNumber: string): string {
  return jwt.sign({ candidateId, rollNumber }, getSecret(), {
    expiresIn: "4h",
  });
}

export function verifyToken(token: string): TokenPayload {
  // Throws JsonWebTokenError / TokenExpiredError on bad or expired tokens —
  // callers (API routes) must wrap this in try/catch and return 401.
  return jwt.verify(token, getSecret()) as TokenPayload;
}