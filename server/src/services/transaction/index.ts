import { createTransaction } from "./transaction.create.service.js";
import { deleteTransaction } from "./transaction.delete.service.js";
import { getTransaction } from "./transaction.get.service.js";
import { listTransactions } from "./transaction.list.service.js";
import { restoreTransaction } from "./transaction.restore.service.js";
import { listTrash } from "./transaction.trash.service.js";
import { updateTransaction } from "./transaction.update.service.js";

export default class TransactionService {
  static create = createTransaction;
  static get = getTransaction;
  static list = listTransactions;
  static update = updateTransaction;
  static delete = deleteTransaction;
  static trash = listTrash;
  static restore = restoreTransaction;
}
