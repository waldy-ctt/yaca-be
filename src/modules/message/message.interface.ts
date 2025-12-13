// src/modules/message/message.interface.ts

export class MessageInterface {
  id: string;
  conversationId: string;
  content: MessageContentInterface;
  reaction: MessageReactionInterface[];
  senderId: string;
  createdAt?: string;
  updatedAt?: string;

  constructor(
    id: string,
    conversationId: string,
    content: MessageContentInterface,
    reaction: MessageReactionInterface[],
    senderId: string,
    createdAt?: string,
    updatedAt?: string,
  ) {
    this.id = id;
    this.conversationId = conversationId;
    this.content = content;
    this.reaction = reaction;
    this.senderId = senderId;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}

export class MessageContentInterface {
  content: string;
  type: "text" | "image";

  constructor(content: string, type: "text" | "image") {
    this.content = content;
    this.type = type;
  }

  toJsonString(): string {
    return JSON.stringify({
      content: this.content,
      type: this.type,
    });
  }

  static fromJsonString(json: string): MessageContentInterface {
    const parsed = JSON.parse(json);
    return new MessageContentInterface(parsed.content, parsed.type);
  }
}

// ✅ FIXED: Added "laugh" type to match frontend
export class MessageReactionInterface {
  type: "like" | "heart" | "laugh";
  sender: string;

  constructor(type: "like" | "heart" | "laugh", sender: string) {
    this.type = type;
    this.sender = sender;
  }

  toJsonString(): string {
    return JSON.stringify({
      sender: this.sender,
      type: this.type,
    });
  }

  static fromJsonString(json: string): MessageReactionInterface {
    const parsed = JSON.parse(json);
    return new MessageReactionInterface(parsed.type, parsed.sender);
  }

  static arrayToJsonString(reactions: MessageReactionInterface[]): string {
    return JSON.stringify(reactions);
  }

  static arrayFromJsonString(json: string): MessageReactionInterface[] {
    if (!json) return [];

    try {
      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed)) return [];

      return parsed.map(
        (item: any) => new MessageReactionInterface(item.type, item.sender),
      );
    } catch (e) {
      console.error("Failed to parse reactions:", e);
      return [];
    }
  }
}
