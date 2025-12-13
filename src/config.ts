// src/config.ts 

export const JWT_SECRET = Bun.env.JWT_SECRET || "dev-fallback-change-me";
export const PORT = Number(Bun.env.PORT) || 3000;
