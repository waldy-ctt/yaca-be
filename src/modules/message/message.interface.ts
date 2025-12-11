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

export class MessageReactionInterface {
  type: "like" | "heart";
  sender: string;

  constructor(type: "like" | "heart", sender: string) {
    this.type = type;
    this.sender = sender;
  }

  // 1. Single Object -> JSON String (You already had this)
  toJsonString(): string {
    return JSON.stringify({
      sender: this.sender,
      type: this.type,
    });
  }

  // 2. JSON String -> Single Object (You already had this)
  static fromJsonString(json: string): MessageReactionInterface {
    const parsed = JSON.parse(json);
    return new MessageReactionInterface(parsed.type, parsed.sender);
  }

  // ✅ NEW: Array of Objects -> JSON String (For Saving to SQLite)
  static arrayToJsonString(reactions: MessageReactionInterface[]): string {
    // JSON.stringify works automatically on arrays of objects!
    return JSON.stringify(reactions);
  }

  // ✅ NEW: JSON String -> Array of Objects (For Reading from SQLite)
  static arrayFromJsonString(json: string): MessageReactionInterface[] {
    if (!json) return []; // Safety: Handle empty DB columns
    
    try {
      const parsed = JSON.parse(json);
      
      // Safety: Make sure it's actually an array
      if (!Array.isArray(parsed)) return [];

      // Rehydrate: Turn plain JSON objects back into Class Instances
      return parsed.map((item: any) => 
        new MessageReactionInterface(item.type, item.sender)
      );
    } catch (e) {
      console.error("Failed to parse reactions:", e);
      return []; // Return empty array on error instead of crashing
    }
  }
}
