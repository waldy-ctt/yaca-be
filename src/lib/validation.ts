// src/lib/validation.ts
export function validateSignup(body: any) {
  const errors: string[] = [];

  if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    errors.push("Invalid email");
  }
  if (!body.username || body.username.length < 3) {
    errors.push("Username too short");
  }
  if (!body.name || body.name.length < 2) {
    errors.push("Name too short");
  }
  if (!body.tel || !/^(\+84|0)\d{9}$/.test(body.tel)) {
    errors.push("Invalid phone");
  }
  if (!body.password || body.password.length < 6) {
    errors.push("Password too short");
  }

  return errors.length === 0
    ? { success: true, data: body }
    : { success: false, errors };
}

export function validateCreateConversation(body: any) {
  const errors: string[] = [];

  if (!Array.isArray(body.participantIds) || body.participantIds.length === 0) {
    errors.push("participantIds must be non-empty array");
  }

  return errors.length === 0
    ? { success: true, data: body }
    : { success: false, errors };
}

export function validateSendMessage(body: any) {
  const errors: string[] = [];

  if (!body.conversationId || typeof body.conversationId !== "string") {
    errors.push("conversationId required");
  }
  if (
    !body.content ||
    typeof body.content !== "string" ||
    body.content.trim() === ""
  ) {
    errors.push("content required and non-empty");
  }
  if (body.tempId && typeof body.tempId !== "string") {
    errors.push("tempId must be string if provided");
  }

  return errors.length === 0
    ? { success: true, data: body }
    : { success: false, errors };
}
