import { createAccount } from "./account.create.service.js";
import { deleteAccount } from "./account.delete.service.js";
import { getAccount } from "./account.get.service.js";
import { listAccounts } from "./account.list.service.js";
import { archiveAccount, unarchiveAccount } from "./account.status.service.js";
import { updateAccount } from "./account.update.service.js";

export default class AccountService {
  static list = listAccounts;
  static get = getAccount;
  static create = createAccount;
  static update = updateAccount;
  static delete = deleteAccount;
  static archive = archiveAccount;
  static unarchive = unarchiveAccount;
}
