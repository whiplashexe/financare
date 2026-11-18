import { login } from "./user.login.service.js";
import { register } from "./user.register.service.js";

export default class UserService {
  static register = register;
  static login = login;
}
