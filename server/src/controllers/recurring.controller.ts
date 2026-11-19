import type { Request, Response } from "express";
import RecurringService from "../services/recurring/index.js";
import { ApiResponse } from "../utils/api.response.util.js";
import { readIdempotencyKey } from "../utils/idempotency.util.js";
import { PLAN_MESSAGE } from "../constants/response.message.js";
import { toPlanResponse } from "../utils/recurring.util.js";
import { toTransactionSummary } from "../utils/transaction.util.js";
import {
  ConfirmOccurrenceInput,
  CreatePlanInput,
  ListPlansQuery,
  UpdatePlanInput,
} from "../validations/recurring.validation.js";

type WithId = Request<{ id: string }>;
type WithOccurrence = Request<{ id: string; dueDate: string }>;

export class RecurringController {
  static list = async (req: Request, res: Response) => {
    const rows = await RecurringService.list({
      userId: req.user!.id,
      query: req.query as unknown as ListPlansQuery,
    });
    ApiResponse.ok(res, PLAN_MESSAGE.LISTED, rows.map(toPlanResponse));
  };

  static get = async (req: WithId, res: Response) => {
    const result = await RecurringService.get({
      userId: req.user!.id,
      planId: req.params.id,
    });
    ApiResponse.ok(res, PLAN_MESSAGE.FETCHED, {
      ...toPlanResponse(result.plan),
      transactions: result.history.map(toTransactionSummary),
      occurrences: result.occurrences.map((occurrence) => ({
        due_date: occurrence.dueDate,
        outcome: occurrence.outcome,
        transaction_id: occurrence.transactionId,
        resolved_at: occurrence.resolvedAt.toISOString(),
      })),
    });
  };

  static create = async (
    req: Request<unknown, unknown, CreatePlanInput>,
    res: Response,
  ) => {
    const plan = await RecurringService.create({
      userId: req.user!.id,
      input: req.body,
    });
    ApiResponse.created(res, PLAN_MESSAGE.CREATED, toPlanResponse(plan));
  };

  static update = async (
    req: Request<{ id: string }, unknown, UpdatePlanInput>,
    res: Response,
  ) => {
    const plan = await RecurringService.update({
      userId: req.user!.id,
      planId: req.params.id,
      input: req.body,
    });
    ApiResponse.ok(res, PLAN_MESSAGE.UPDATED, toPlanResponse(plan));
  };

  static delete = async (req: WithId, res: Response) => {
    await RecurringService.delete({
      userId: req.user!.id,
      planId: req.params.id,
    });
    ApiResponse.noContent(res);
  };

  static pause = async (req: WithId, res: Response) => {
    const plan = await RecurringService.pause({
      userId: req.user!.id,
      planId: req.params.id,
    });
    ApiResponse.ok(res, PLAN_MESSAGE.PAUSED, toPlanResponse(plan));
  };

  static resume = async (req: WithId, res: Response) => {
    const plan = await RecurringService.resume({
      userId: req.user!.id,
      planId: req.params.id,
    });
    ApiResponse.ok(res, PLAN_MESSAGE.RESUMED, toPlanResponse(plan));
  };

  static confirm = async (
    req: Request<{ id: string; dueDate: string }, unknown, ConfirmOccurrenceInput>,
    res: Response,
  ) => {
    const result = await RecurringService.confirm({
      userId: req.user!.id,
      planId: req.params.id,
      dueDate: req.params.dueDate,
      input: req.body,
      idempotencyKey: readIdempotencyKey(req),
    });

    if (result.replayed) res.setHeader("Idempotent-Replayed", "true");
    ApiResponse.created(res, PLAN_MESSAGE.CONFIRMED, result.data);
  };

  static skip = async (req: WithOccurrence, res: Response) => {
    const result = await RecurringService.skip({
      userId: req.user!.id,
      planId: req.params.id,
      dueDate: req.params.dueDate,
    });
    ApiResponse.ok(res, PLAN_MESSAGE.SKIPPED, result);
  };
}
