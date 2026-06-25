import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { config } from "./config.js";

export interface AuthedRequest extends Request {
  teacherId?: string;
}

export function signToken(teacherId: string): string {
  return jwt.sign({ sub: teacherId }, config.jwtSecret, { expiresIn: "7d" });
}

export function verifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub: string };
    return payload.sub;
  } catch {
    return null;
  }
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Avtorizatsiya talab qilinadi" });
    return;
  }
  const teacherId = verifyToken(header.slice(7));
  if (!teacherId) {
    res.status(401).json({ error: "Token yaroqsiz yoki muddati o'tgan" });
    return;
  }
  req.teacherId = teacherId;
  next();
}
