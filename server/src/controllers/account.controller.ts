import type { Request, Response } from "express";
import AccountService from "../services/account/index.js";
import { ApiResponse } from "../utils/api.response.util.js";
import { ACCOUNT_MESSAGE } from "../constants/response.message.js";
import { toAccountResponse } from "../utils/account.util.js";
import {
  CreateAccountInput,
  ListAccountsQuery,
  UpdateAccountInput,
} from "../validations/account.validation.js";

type WithId = Request<{ id: string }>;

export class AccountController {
  static list = async (req: Request, res: Response) => {
    const result = await AccountService.list({
      userId: req.user!.id,
      query: req.query as unknown as ListAccountsQuery,
    });
    ApiResponse.ok(res, ACCOUNT_MESSAGE.LISTED, {
      total_balance: result.totalBalance,
      accounts: result.accounts.map(toAccountResponse),
    });
  };

  static get = async (req: WithId, res: Response) => {
    const account = await AccountService.get({
      userId: req.user!.id,
      accountId: req.params.id,
    });
    ApiResponse.ok(res, ACCOUNT_MESSAGE.FETCHED, toAccountResponse(account));
  };

  static create = async (
    req: Request<unknown, unknown, CreateAccountInput>,
    res: Response,
  ) => {
    const account = await AccountService.create({
      userId: req.user!.id,
      input: req.body,
    });
    ApiResponse.created(res, ACCOUNT_MESSAGE.CREATED, toAccountResponse(account));
  };

  static update = async (
    req: Request<{ id: string }, unknown, UpdateAccountInput>,
    res: Response,
  ) => {
    const account = await AccountService.update({
      userId: req.user!.id,
      accountId: req.params.id,
      input: req.body,
    });
    ApiResponse.ok(res, ACCOUNT_MESSAGE.UPDATED, toAccountResponse(account));
  };

  static delete = async (req: WithId, res: Response) => {
    await AccountService.delete({
      userId: req.user!.id,
      accountId: req.params.id,
    });
    ApiResponse.noContent(res);
  };

  static archive = async (req: WithId, res: Response) => {
    const account = await AccountService.archive({
      userId: req.user!.id,
      accountId: req.params.id,
    });
    ApiResponse.ok(res, ACCOUNT_MESSAGE.ARCHIVED, toAccountResponse(account));
  };

  static unarchive = async (req: WithId, res: Response) => {
    const account = await AccountService.unarchive({
      userId: req.user!.id,
      accountId: req.params.id,
    });
    ApiResponse.ok(res, ACCOUNT_MESSAGE.UNARCHIVED, toAccountResponse(account));
  };
}
