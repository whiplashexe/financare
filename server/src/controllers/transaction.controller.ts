import type { Request, Response } from "express";
import TransactionService from "../services/transaction/index.js";
import { ApiResponse } from "../utils/api.response.util.js";
import { ApiError } from "../utils/api.error.util.js";
import { TRANSACTION_MESSAGE } from "../constants/response.message.js";
import {
  toTransactionSummary,
  toTrashSummary,
} from "../utils/transaction.util.js";
import {
  CreateTransactionInput,
  DeleteTransactionQuery,
  ListTransactionsQuery,
  TrashQuery,
  UpdateTransactionInput,
} from "../validations/transaction.validation.js";

export class TransactionController {
  static create = async (
    req: Request<unknown, unknown, CreateTransactionInput>,
    res: Response,
  ) => {
    const key = req.get("idempotency-key");
    if (key !== undefined && (key.length < 1 || key.length > 64)) {
      throw ApiError.badRequest("Invalid Idempotency-Key header", {
        "idempotency-key": ["must be 1 to 64 characters"],
      });
    }

    const result = await TransactionService.create({
      userId: req.user!.id,
      input: req.body,
      idempotencyKey: key,
    });

    if (result.replayed) res.setHeader("Idempotent-Replayed", "true");
    ApiResponse.created(res, TRANSACTION_MESSAGE.CREATED, result.data);
  };

  static get = async (req: Request<{ id: string }>, res: Response) => {
    const transaction = await TransactionService.get({
      userId: req.user!.id,
      transactionId: req.params.id,
    });
    ApiResponse.ok(res, TRANSACTION_MESSAGE.FETCHED, transaction);
  };

  static list = async (req: Request, res: Response) => {
    const query = req.query as unknown as ListTransactionsQuery;
    const result = await TransactionService.list({
      userId: req.user!.id,
      query,
    });
    ApiResponse.list(
      res,
      TRANSACTION_MESSAGE.LISTED,
      result.rows.map(toTransactionSummary),
      { next_cursor: result.nextCursor, limit: query.limit },
    );
  };

  static update = async (
    req: Request<{ id: string }, unknown, UpdateTransactionInput>,
    res: Response,
  ) => {
    const result = await TransactionService.update({
      userId: req.user!.id,
      transactionId: req.params.id,
      input: req.body,
    });
    ApiResponse.ok(res, TRANSACTION_MESSAGE.UPDATED, result);
  };

  static delete = async (req: Request<{ id: string }>, res: Response) => {
    const { permanent } = req.query as unknown as DeleteTransactionQuery;
    await TransactionService.delete({
      userId: req.user!.id,
      transactionId: req.params.id,
      permanent,
    });
    ApiResponse.noContent(res);
  };

  static trash = async (req: Request, res: Response) => {
    const query = req.query as unknown as TrashQuery;
    const result = await TransactionService.trash({
      userId: req.user!.id,
      query,
    });
    ApiResponse.list(
      res,
      TRANSACTION_MESSAGE.TRASH_LISTED,
      result.rows.map(toTrashSummary),
      { next_cursor: result.nextCursor, limit: query.limit },
    );
  };

  static restore = async (req: Request<{ id: string }>, res: Response) => {
    const transaction = await TransactionService.restore({
      userId: req.user!.id,
      transactionId: req.params.id,
    });
    ApiResponse.ok(res, TRANSACTION_MESSAGE.RESTORED, transaction);
  };
}
