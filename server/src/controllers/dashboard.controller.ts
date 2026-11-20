import type { Request, Response } from "express";
import { getDashboard } from "../services/dashboard/dashboard.service.js";
import {
  accountFlow,
  monthlyTrend,
  outcomeByCategory,
} from "../services/report/report.service.js";
import { ApiResponse } from "../utils/api.response.util.js";
import {
  FlowQuery,
  RangeQuery,
  TrendQuery,
} from "../validations/report.validation.js";

export class DashboardController {
  static dashboard = async (req: Request, res: Response) => {
    const data = await getDashboard({ userId: req.user!.id });
    ApiResponse.ok(res, "Dashboard fetched successfully", data);
  };

  static outcomeByCategory = async (req: Request, res: Response) => {
    const data = await outcomeByCategory({
      userId: req.user!.id,
      query: req.query as unknown as RangeQuery,
    });
    ApiResponse.ok(res, "Report fetched successfully", data);
  };

  static monthlyTrend = async (req: Request, res: Response) => {
    const data = await monthlyTrend({
      userId: req.user!.id,
      query: req.query as unknown as TrendQuery,
    });
    ApiResponse.ok(res, "Report fetched successfully", data);
  };

  static accountFlow = async (req: Request, res: Response) => {
    const data = await accountFlow({
      userId: req.user!.id,
      query: req.query as unknown as FlowQuery,
    });
    ApiResponse.ok(res, "Report fetched successfully", data);
  };
}
