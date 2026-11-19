import type { Request, Response } from "express";
import OneTimeService from "../services/onetime/index.js";
import { ApiResponse } from "../utils/api.response.util.js";
import { ONE_TIME_MESSAGE } from "../constants/response.message.js";
import { toTransactionSummary } from "../utils/transaction.util.js";
import {
  CompleteOneTimeInput,
  CreateOneTimeInput,
  ListOneTimeQuery,
  UpdateOneTimeInput,
} from "../validations/onetime.validation.js";

type WithId = Request<{ id: string }>;

export class OneTimeController {
  static list = async (req: Request, res: Response) => {
    const plans = await OneTimeService.list({
      userId: req.user!.id,
      query: req.query as unknown as ListOneTimeQuery,
    });
    ApiResponse.ok(res, ONE_TIME_MESSAGE.LISTED, plans);
  };

  static get = async (req: WithId, res: Response) => {
    const result = await OneTimeService.get({
      userId: req.user!.id,
      planId: req.params.id,
    });
    ApiResponse.ok(res, ONE_TIME_MESSAGE.FETCHED, {
      ...result.plan,
      transactions: result.history.map(toTransactionSummary),
    });
  };

  static create = async (
    req: Request<unknown, unknown, CreateOneTimeInput>,
    res: Response,
  ) => {
    const plan = await OneTimeService.create({
      userId: req.user!.id,
      input: req.body,
    });
    ApiResponse.created(res, ONE_TIME_MESSAGE.CREATED, plan);
  };

  static update = async (
    req: Request<{ id: string }, unknown, UpdateOneTimeInput>,
    res: Response,
  ) => {
    const plan = await OneTimeService.update({
      userId: req.user!.id,
      planId: req.params.id,
      input: req.body,
    });
    ApiResponse.ok(res, ONE_TIME_MESSAGE.UPDATED, plan);
  };

  static delete = async (req: WithId, res: Response) => {
    await OneTimeService.delete({
      userId: req.user!.id,
      planId: req.params.id,
    });
    ApiResponse.noContent(res);
  };

  static complete = async (
    req: Request<{ id: string }, unknown, CompleteOneTimeInput>,
    res: Response,
  ) => {
    const result = await OneTimeService.complete({
      userId: req.user!.id,
      planId: req.params.id,
      input: req.body,
    });
    ApiResponse.ok(res, ONE_TIME_MESSAGE.COMPLETED, result);
  };

  static cancel = async (req: WithId, res: Response) => {
    const plan = await OneTimeService.cancel({
      userId: req.user!.id,
      planId: req.params.id,
    });
    ApiResponse.ok(res, ONE_TIME_MESSAGE.CANCELLED, plan);
  };
}
