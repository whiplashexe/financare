import { changePassword } from "./me.change.password.service.js";
import { deleteAccount } from "./me.delete.service.js";
import { getProfile } from "./me.get.service.js";
import { updateNotificationPreferences } from "./me.notification.preferences.service.js";
import { updatePreferences } from "./me.preferences.service.js";
import { updateProfile } from "./me.update.service.js";

export default class MeService {
  static getProfile = getProfile;
  static updateProfile = updateProfile;
  static changePassword = changePassword;
  static updateNotificationPreferences = updateNotificationPreferences;
  static updatePreferences = updatePreferences;
  static deleteAccount = deleteAccount;
}
