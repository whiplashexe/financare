import { listReminders } from "./reminder.list.service.js";
import { snoozeReminder } from "./reminder.snooze.service.js";

export default class ReminderService {
  static list = listReminders;
  static snooze = snoozeReminder;
}
