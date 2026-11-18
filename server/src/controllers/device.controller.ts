import type { Request, Response } from "express";
import DeviceService from "../services/device/index.js";
import { ApiResponse } from "../utils/api.response.util.js";
import { ME_MESSAGE } from "../constants/response.message.js";
import { RegisterDeviceInput } from "../validations/device.validation.js";

export class DeviceController {
  static register = async (
    req: Request<unknown, unknown, RegisterDeviceInput>,
    res: Response,
  ) => {
    const device = await DeviceService.register({
      userId: req.user!.id,
      input: req.body,
    });
    ApiResponse.created(res, ME_MESSAGE.DEVICE_REGISTERED, device);
  };

  static remove = async (req: Request<{ id: string }>, res: Response) => {
    await DeviceService.remove({
      userId: req.user!.id,
      deviceId: req.params.id,
    });
    ApiResponse.noContent(res);
  };
}
