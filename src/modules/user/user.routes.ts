// src/modules/user/user.routes.ts
import { Context, Hono } from "hono";
import { UserRepository } from "./user.repo";
import { sign } from "hono/jwt";
import { randomUUIDv7 } from "bun";

const userApp = new Hono();
export const JWT_SECRET = "CHANGE_ME_TO_SOMETHING_SAFE"; // Move to .env later

userApp.get("/", (c: Context) => {
  const users = UserRepository.findAll();
  return c.json(users);
});

// 🔵 LOGIN
userApp.post("/login", async (c: Context) => {
  const { password, identifier } = await c.req.json();

  if (!identifier || !password) return c.json({ error: "Missing fields" }, 400);

  // 1. Find User by Email/Username (NOT Password)
  const user = UserRepository.findByIdentifier(identifier);

  if (!user) {
    // Security Tip: Generic error prevents hackers guessing emails
    return c.json({ error: "Invalid credentials" }, 401);
  }

  // 2. Verify Password (The Magic Step) 🪄
  // Bun checks the 'salt' inside user.password and compares it to input
  const isValid = await Bun.password.verify(password, user.password);

  if (!isValid) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  // 3. Generate Token (Access Pass for WebSocket)
  const token = await sign(
    {
      id: user.id,
      username: user.username,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 days
    },
    JWT_SECRET,
  );

  // 4. Return Token + User Info (BUT remove the password hash!)
  const { password: _, ...safeUser } = user;

  return c.json({
    token,
    user: safeUser,
  });
});

// 🟢 SIGNUP
userApp.post("/signup", async (c: Context) => {
  const { password, email, name, username, tel } = await c.req.json();

  // Hash the password before saving
  const hashedPassword = await Bun.password.hash(password, {
    algorithm: "bcrypt",
    cost: 10,
  });

  const id = randomUUIDv7();

  try {
    UserRepository.create({
      id,
      name,
      password: hashedPassword,
      email,
      tel,
      username,
    });

    // Auto-login after signup: Generate token immediately
    const token = await sign({ id, username }, JWT_SECRET);

    return c.json({ token, user: { id, username, email } });
  } catch (error) {
    console.error(error); // Log error for debugging
    return c.json(
      { error: "User already exists (check email/username)" },
      409, // 409 Conflict is better than 401 here
    );
  }
});

export default userApp;
