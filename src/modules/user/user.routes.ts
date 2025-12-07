// src/modules/user/user.routes.ts
import { Context, Hono } from "hono";
import { UserRepository } from "./user.repo";

const userApp = new Hono();

userApp.get("/", (c: Context) => {
  const users = UserRepository.findAll();
  return c.json(users);
});

userApp.post("/login", async (c: Context) => {
  const { password, identifier } = await c.req.json();
  const hashedPassword = await Bun.password.hash(password, {
    algorithm: "bcrypt",
    cost: 10,
  });

  const user = UserRepository.findUserByEmailAndPassword(identifier, hashedPassword);
  if (!user) return c.json({ error: "User not found or incorrect credentials" }, 401);
  return c.json(user);
});

userApp.get("/:email", (c: Context) => {
  const email = c.req.param("email");
  const user = UserRepository.findByEmail(email);

  if (!user) return c.json({ error: "User not found" }, 404);
  return c.json(user);
});

export default userApp;
