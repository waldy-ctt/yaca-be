// src/middleware/auth.ts

import { Context, Next } from "hono";
import { verify } from "hono/jwt";
import { JWT_SECRET } from "../config";

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = await verify(token, JWT_SECRET);
    c.set("userId", payload.id as string);
    await next();
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
}
