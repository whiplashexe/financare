import type { Request, Response } from "express";
import TemplateService from "../services/template/index.js";
import { ApiResponse } from "../utils/api.response.util.js";
import { readIdempotencyKey } from "../utils/idempotency.util.js";
import {
  TEMPLATE_MESSAGE,
  TRANSACTION_MESSAGE,
} from "../constants/response.message.js";
import { toTemplateResponse } from "../utils/template.util.js";
import {
  CreateTemplateInput,
  RecordTemplateInput,
  UpdateTemplateInput,
} from "../validations/template.validation.js";

export class TemplateController {
  static list = async (req: Request, res: Response) => {
    const rows = await TemplateService.list({ userId: req.user!.id });
    ApiResponse.ok(res, TEMPLATE_MESSAGE.LISTED, rows.map(toTemplateResponse));
  };

  static get = async (req: Request<{ id: string }>, res: Response) => {
    const template = await TemplateService.get({
      userId: req.user!.id,
      templateId: req.params.id,
    });
    ApiResponse.ok(res, TEMPLATE_MESSAGE.FETCHED, toTemplateResponse(template));
  };

  static create = async (
    req: Request<unknown, unknown, CreateTemplateInput>,
    res: Response,
  ) => {
    const template = await TemplateService.create({
      userId: req.user!.id,
      input: req.body,
    });
    ApiResponse.created(res, TEMPLATE_MESSAGE.CREATED, toTemplateResponse(template));
  };

  static update = async (
    req: Request<{ id: string }, unknown, UpdateTemplateInput>,
    res: Response,
  ) => {
    const template = await TemplateService.update({
      userId: req.user!.id,
      templateId: req.params.id,
      input: req.body,
    });
    ApiResponse.ok(res, TEMPLATE_MESSAGE.UPDATED, toTemplateResponse(template));
  };

  static delete = async (req: Request<{ id: string }>, res: Response) => {
    await TemplateService.delete({
      userId: req.user!.id,
      templateId: req.params.id,
    });
    ApiResponse.noContent(res);
  };

  static record = async (
    req: Request<{ id: string }, unknown, RecordTemplateInput>,
    res: Response,
  ) => {
    const result = await TemplateService.record({
      userId: req.user!.id,
      templateId: req.params.id,
      overrides: req.body,
      idempotencyKey: readIdempotencyKey(req),
    });

    if (result.replayed) res.setHeader("Idempotent-Replayed", "true");
    ApiResponse.created(res, TRANSACTION_MESSAGE.CREATED, result.data);
  };
}
