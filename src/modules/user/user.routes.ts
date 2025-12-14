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

  UserRepository.updateStatus(user.id, "online");

  const token = await sign(
    {
      id: user.id,
      username: user.username,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    },
    JWT_SECRET,
  );

  const updatedUser = UserRepository.findByIdentifier(identifier);
  const { password: _, ...safeUser } = updatedUser!;

  return c.json({
    token,
    user: safeUser,
  });
});

// ✅ UPDATED: Username & tel are now optional, auto-generated if not provided
userApp.post("/signup", async (c: Context) => {
  const { password, email, name, username, tel } = await c.req.json();

  if (!email || !password || !name) {
    return c.json({ error: "Email, password, and name are required" }, 400);
  }

  const hashedPassword = await Bun.password.hash(password, {
    algorithm: "bcrypt",
    cost: 10,
  });

  const id = randomUUIDv7();

  // ✅ Generate random username if not provided
  const finalUsername = username || `user_${id.slice(0, 8)}`;
  console.log("ASDASDA: ", finalUsername);

  // ✅ Generate placeholder tel if not provided
  const finalTel = tel || `000${id.slice(0, 8)}`;

  try {
    const newUser = UserRepository.create({
      id,
      name,
      password: hashedPassword,
      email,
      status: "online",
      tel: finalTel,
      username: finalUsername,
    });

    const token = await sign({ id, username: finalUsername }, JWT_SECRET);

    const { password: _, ...safeUser } = newUser!;

    return c.json({ token, user: safeUser });
  } catch (error) {
    console.error(error);
    return c.json(
      { error: "User already exists (check email/username/phone)" },
      409,
    );
  }
});

// ✅ UPDATED: Enhanced profile update with validation
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
    return c.json(
      { error: "Update failed. Username/phone might be taken." },
      409,
    );
  }
});

// ✅ NEW: Change password endpoint
userApp.put("/me/password", async (c: Context) => {
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

  const { currentPassword, newPassword } = await c.req.json();

  if (!currentPassword || !newPassword) {
    return c.json(
      { error: "Both currentPassword and newPassword are required" },
      400,
    );
  }

  if (newPassword.length < 6) {
    return c.json({ error: "New password must be at least 6 characters" }, 400);
  }

  try {
    const user = UserRepository.findUserByUserId(userId);
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    // Verify current password
    const isValid = await Bun.password.verify(currentPassword, user.password);
    if (!isValid) {
      return c.json({ error: "Current password is incorrect" }, 401);
    }

    // Hash new password
    const hashedPassword = await Bun.password.hash(newPassword, {
      algorithm: "bcrypt",
      cost: 10,
    });

    // Update password
    const updated = UserRepository.updatePassword(userId, hashedPassword);
    if (!updated) {
      return c.json({ error: "Failed to update password" }, 500);
    }

    return c.json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    console.error("Password change failed:", error);
    return c.json({ error: "Failed to change password" }, 500);
  }
});

userApp.get("/:userId", async (c: Context) => {
  const userId = c.req.param("userId");
  const result = UserRepository.findUserByUserId(userId);

  if (!result) {
    return c.json({ error: "User not found" }, 404);
  }

  // Don't send password to frontend
  const { password: _, ...safeUser } = result;
  return c.json(safeUser);
});

export default userApp;
