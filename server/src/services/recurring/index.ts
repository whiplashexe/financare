import { autoRecordDuePlans } from "./recurring.auto.service.js";
import { createPlan } from "./recurring.create.service.js";
import { deletePlan } from "./recurring.delete.service.js";
import { getPlan } from "./recurring.get.service.js";
import { listPlans } from "./recurring.list.service.js";
import {
  confirmOccurrence,
  skipOccurrence,
} from "./recurring.resolve.service.js";
import { pausePlan, resumePlan } from "./recurring.status.service.js";
import { updatePlan } from "./recurring.update.service.js";

export default class RecurringService {
  static list = listPlans;
  static get = getPlan;
  static create = createPlan;
  static update = updatePlan;
  static delete = deletePlan;
  static pause = pausePlan;
  static resume = resumePlan;
  static confirm = confirmOccurrence;
  static skip = skipOccurrence;
  static autoRecord = autoRecordDuePlans;
}
