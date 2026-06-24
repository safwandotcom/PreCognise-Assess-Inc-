import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET ?? "dev-secret-change-in-prod";

export interface JwtPayload {
  candidateId: string;
  campaignId: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: "8h" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, SECRET) as JwtPayload;
}
