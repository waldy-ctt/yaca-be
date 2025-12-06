// src/modules/user/user.routes.ts
import { Hono } from "hono";
import { UserRepository } from "./user.repo";

const userApp = new Hono();

userApp.get("/", (c) => {
  const users = UserRepository.findAll();
  return c.json(users);
});

userApp.get("/:email", (c) => {
  const email = c.req.param("email");
  const user = UserRepository.findByEmail(email);
  
  if (!user) return c.json({ error: "User not found" }, 404);
  return c.json(user);
});

export default userApp;
