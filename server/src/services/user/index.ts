import { forgotPassword } from "./user.forgot.password.service.js";
import { login } from "./user.login.service.js";
import { logout } from "./user.logout.service.js";
import { logoutAll } from "./user.logout.all.service.js";
import { refresh } from "./user.refresh.service.js";
import { register } from "./user.register.service.js";
import { resetPassword } from "./user.reset.password.service.js";

export default class UserService {
  static register = register;
  static login = login;
  static refresh = refresh;
  static logout = logout;
  static logoutAll = logoutAll;
  static forgotPassword = forgotPassword;
  static resetPassword = resetPassword;
}
