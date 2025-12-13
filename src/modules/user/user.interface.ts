export class UserInterface {
  id: string;
  email: string;
  username: string;
  name: string;
  tel: string;
  password: string;
  bio?: string;
  status: "online" | "offline" | "dnd" | "sleep";
  createdAt?: string;
  updatedAt?: string;

  constructor(
    id: string,
    email: string,
    username: string,
    name: string,
    password: string,
    status: "online" | "offline" | "dnd" | "sleep",
    createdAt: string,
    updatedAt: string,
    tel: string,
    bio?: string,
  ) {
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.name = name;
    this.status = status;
    this.id = id;
    this.username = username;
    this.password = password;
    this.email = email;
    this.tel = tel;
    this.bio = bio;
  }
}
