export class ConversationInterface {
  id: string;
  participants: string[];
  avatar: string | null;
  name: string;
  lastMessage: string;
  lastMessageTimestamp: string;
  pinnedBy: string[];
  createdAt?: string;
  updatedAt?: string;

  constructor(
    id: string,
    participants: string[],
    avatar: string | null,
    name: string,
    lastMessage: string,
    lastMessageTimestamp: string,
    pinnedBy: string[],
    updatedAt?: string,
    createdAt?: string,
  ) {
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.name = name;
    this.id = id;
    this.participants = participants;
    this.avatar = avatar;
    this.lastMessageTimestamp = lastMessageTimestamp;
    this.lastMessage = lastMessage;
    this.pinnedBy = pinnedBy;
  }
}
