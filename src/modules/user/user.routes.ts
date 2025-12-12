// src/modules/user/user.routes.ts
import { Context, Hono } from "hono";
import { UserRepository } from "./user.repo";
import { sign, verify } from "hono/jwt";
import { randomUUIDv7 } from "bun";

const userApp = new Hono();
export const JWT_SECRET = "CHANGE_ME_TO_SOMETHING_SAFE"; // Move to .env later

userApp.get("/", async (c: Context) => {
  // 1. Parse Query Params
  const limit = Number(c.req.query("limit")) || 20;
  const cursor = c.req.query("cursor");
  const keyword = c.req.query("keyword");

  // Fix boolean parsing: Check if string is explicitly "true"
  const withCurrentUser = c.req.query("withCurrentUser") === "true";

  let currentUserId: string | undefined;

  // 2. Extract Token (Handle "Bearer <token>")
  const authHeader = c.req.header("Authorization");

  if (authHeader) {
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : authHeader;

    try {
      const payload = await verify(token, JWT_SECRET);
      currentUserId = payload.id as string;
    } catch (e) {
      console.log("Token verification failed:", e);
      // Optional: Return 401 here if auth is strictly required
    }
  }

  // 3. Call Repo
  // Logic: If we want to hide the current user (!withCurrentUser), we MUST pass the ID to exclude
  const users = UserRepository.findAll(
    limit,
    cursor,
    keyword,
    withCurrentUser,
    currentUserId, // Pass it regardless; repo handles the logic
  );

  const nextCursor =
    users.length > 0 ? users[users.length - 1].createdAt : null;

  return c.json({
    data: users,
    nextCursor,
  });
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
      status: "online",
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
