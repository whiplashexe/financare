import type { Request, Response } from "express";
import { signUpload } from "../services/upload.service.js";
import { ApiResponse } from "../utils/api.response.util.js";
import { IMAGE_MESSAGE } from "../constants/response.message.js";

export class UploadController {
  static sign = async (
    req: Request<unknown, unknown, { count: number }>,
    res: Response,
  ) => {
    const signed = await signUpload({
      userId: req.user!.id,
      count: req.body.count,
    });

    ApiResponse.ok(res, IMAGE_MESSAGE.SIGNED, {
      cloud_name: signed.cloudName,
      api_key: signed.apiKey,
      timestamp: signed.timestamp,
      folder: signed.folder,
      type: signed.type,
      allowed_formats: signed.allowedFormats,
      max_bytes: signed.maxBytes,
      upload_url: `https://api.cloudinary.com/v1_1/${signed.cloudName}/image/upload`,
      signatures: signed.signatures.map((item) => ({
        public_id: item.publicId,
        signature: item.signature,
      })),
    });
  };
}
