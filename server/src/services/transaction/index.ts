import { createTransaction } from "./transaction.create.service.js";
import { getTransaction } from "./transaction.get.service.js";
import { listTransactions } from "./transaction.list.service.js";

export default class TransactionService {
  static create = createTransaction;
  static get = getTransaction;
  static list = listTransactions;
}
