import type { Request, Response } from "express";
import CategoryService from "../services/category/index.js";
import { ApiResponse } from "../utils/api.response.util.js";
import { CATEGORY_MESSAGE } from "../constants/response.message.js";
import { toCategoryResponse } from "../utils/category.util.js";
import {
  CreateCategoryInput,
  DeleteCategoryQuery,
  ListCategoriesQuery,
  UpdateCategoryInput,
} from "../validations/category.validation.js";

export class CategoryController {
  static list = async (req: Request, res: Response) => {
    const rows = await CategoryService.list({
      userId: req.user!.id,
      query: req.query as unknown as ListCategoriesQuery,
    });
    ApiResponse.ok(res, CATEGORY_MESSAGE.LISTED, rows.map(toCategoryResponse));
  };

  static create = async (
    req: Request<unknown, unknown, CreateCategoryInput>,
    res: Response,
  ) => {
    const category = await CategoryService.create({
      userId: req.user!.id,
      input: req.body,
    });
    ApiResponse.created(
      res,
      CATEGORY_MESSAGE.CREATED,
      toCategoryResponse(category),
    );
  };

  static update = async (
    req: Request<{ id: string }, unknown, UpdateCategoryInput>,
    res: Response,
  ) => {
    const category = await CategoryService.update({
      userId: req.user!.id,
      categoryId: req.params.id,
      input: req.body,
    });
    ApiResponse.ok(
      res,
      CATEGORY_MESSAGE.UPDATED,
      toCategoryResponse(category),
    );
  };

  static delete = async (req: Request<{ id: string }>, res: Response) => {
    const { confirm } = req.query as unknown as DeleteCategoryQuery;
    const result = await CategoryService.delete({
      userId: req.user!.id,
      categoryId: req.params.id,
      confirm,
    });
    ApiResponse.ok(res, CATEGORY_MESSAGE.DELETED, {
      moved_transactions: result.movedTransactions,
    });
  };
}
