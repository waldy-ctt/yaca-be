// src/modules/user/user.routes.ts
import { Context, Hono } from "hono";
import { UserRepository } from "./user.repo";
import { sign, verify } from "hono/jwt";
import { randomUUIDv7 } from "bun";
import { JWT_SECRET } from "../../config";

const userApp = new Hono();

userApp.get("/", async (c: Context) => {
  const limit = Number(c.req.query("limit")) || 20;
  const cursor = c.req.query("cursor");
  const keyword = c.req.query("keyword");
  const withCurrentUser = c.req.query("withCurrentUser") === "true";

  let currentUserId: string | undefined;

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
      return c.json({ error: "Unauthorized" }, 401);
    }
  }

  const users = UserRepository.findAll(
    limit,
    cursor,
    keyword,
    withCurrentUser,
    currentUserId,
  );

  const nextCursor =
    users.length > 0 ? users[users.length - 1].createdAt : null;

  return c.json({
    data: users,
    nextCursor,
  });
});

// ✅ UPDATED: Set user to online when they login
userApp.post("/login", async (c: Context) => {
  const { password, identifier } = await c.req.json();

  if (!identifier || !password) return c.json({ error: "Missing fields" }, 400);

  const user = UserRepository.findByIdentifier(identifier);

  if (!user) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const isValid = await Bun.password.verify(password, user.password);

  if (!isValid) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  // ✅ NEW: Set user status to online when they login
  UserRepository.updateStatus(user.id, "online");

  const token = await sign(
    {
      id: user.id,
      username: user.username,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 days
    },
    JWT_SECRET,
  );

  // ✅ Get updated user data with online status
  const updatedUser = UserRepository.findByIdentifier(identifier);
  const { password: _, ...safeUser } = updatedUser!;

  return c.json({
    token,
    user: safeUser,
  });
});

// ✅ UPDATED: Set user to online when they signup
userApp.post("/signup", async (c: Context) => {
  const { password, email, name, username, tel } = await c.req.json();

  const hashedPassword = await Bun.password.hash(password, {
    algorithm: "bcrypt",
    cost: 10,
  });

  const id = randomUUIDv7();

  try {
    const newUser = UserRepository.create({
      id,
      name,
      password: hashedPassword,
      email,
      status: "online", // ✅ Already set to online in create
      tel,
      username,
    });

    const token = await sign({ id, username }, JWT_SECRET);

    // Return user without password
    const { password: _, ...safeUser } = newUser!;

    return c.json({ token, user: safeUser });
  } catch (error) {
    console.error(error);
    return c.json(
      { error: "User already exists (check email/username)" },
      409,
    );
  }
});

userApp.put("/me", async (c: Context) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : authHeader;
  let userId: string;

  try {
    const payload = await verify(token, JWT_SECRET);
    userId = payload.id as string;
  } catch (e) {
    return c.json({ error: "Invalid Token" }, 401);
  }

  const body = await c.req.json();

  const updatePayload: any = {};
  if (body.status !== undefined) updatePayload.status = body.status;
  if (body.name !== undefined) updatePayload.name = body.name;
  if (body.username !== undefined) updatePayload.username = body.username;
  if (body.tel !== undefined) updatePayload.tel = body.tel;
  if (body.bio !== undefined) updatePayload.bio = body.bio;

  try {
    const updatedUser = UserRepository.update(userId, updatePayload);
    return c.json(updatedUser);
  } catch (e) {
    console.error("Update failed:", e);
    return c.json({ error: "Update failed. Username might be taken." }, 409);
  }
});

userApp.get("/:userId", async (c: Context) => {
  const userId = c.req.param("userId");

  const result = UserRepository.findUserByUserId(userId);
  return c.json(result);
});

export default userApp;
