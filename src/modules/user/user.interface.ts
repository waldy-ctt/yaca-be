export class UserInterface {
  id: string;
  email: string;
  username: string;
  name: string;
  tel: string;
  password: string;
  createdAt?: string;
  updatedAt?: string;

  constructor(
    id: string,
    email: string,
    username: string,
    name: string,
    password: string,
    createdAt: string,
    updatedAt: string,
    tel: string,
  ) {
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.name = name;
    this.id = id;
    this.username = username;
    this.password = password;
    this.email = email;
    this.tel = tel;
  }
}
