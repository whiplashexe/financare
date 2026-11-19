import { createOneTime } from "./onetime.create.service.js";
import { deleteOneTime } from "./onetime.delete.service.js";
import { getOneTime } from "./onetime.get.service.js";
import { listOneTime } from "./onetime.list.service.js";
import { markMissedPlans } from "./onetime.missed.service.js";
import { cancelOneTime, completeOneTime } from "./onetime.status.service.js";
import { updateOneTime } from "./onetime.update.service.js";

export default class OneTimeService {
  static list = listOneTime;
  static get = getOneTime;
  static create = createOneTime;
  static update = updateOneTime;
  static delete = deleteOneTime;
  static complete = completeOneTime;
  static cancel = cancelOneTime;
  static markMissed = markMissedPlans;
}
