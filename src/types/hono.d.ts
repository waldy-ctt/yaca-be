// src/types/hono.d.ts

import { Context } from "hono";

declare module "hono" {
  interface ContextVariableMap {
    userId: string;
  }
}
