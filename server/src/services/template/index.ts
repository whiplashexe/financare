import { createTemplate } from "./template.create.service.js";
import { deleteTemplate } from "./template.delete.service.js";
import { getTemplate } from "./template.get.service.js";
import { listTemplates } from "./template.list.service.js";
import { recordTemplate } from "./template.record.service.js";
import { updateTemplate } from "./template.update.service.js";

export default class TemplateService {
  static list = listTemplates;
  static get = getTemplate;
  static create = createTemplate;
  static update = updateTemplate;
  static delete = deleteTemplate;
  static record = recordTemplate;
}
