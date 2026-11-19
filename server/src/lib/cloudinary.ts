import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

export const IMAGE_ROOT = "financare";
export const ALLOWED_FORMATS = "jpg,png,heic";
export const MAX_IMAGE_BYTES = 5_242_880;
export const MAX_IMAGES_PER_TRANSACTION = 5;
export const URL_TTL_SECONDS = 60 * 60;

const MIME_BY_FORMAT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
};

const FORMAT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
};

export const mimeFromFormat = (format: string) => MIME_BY_FORMAT[format.toLowerCase()];

export const imageFolder = (userId: string) => `${IMAGE_ROOT}/${userId}`;

export type UploadSignature = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  type: "authenticated";
  allowedFormats: string;
  maxBytes: number;
  signatures: { publicId: string; signature: string }[];
};

export type UploadedAsset = { bytes: number; format: string };
export type ListedAsset = { publicId: string; createdAt: Date };

export type CloudinaryClient = {
  sign(userId: string, count: number): UploadSignature;
  verify(publicIds: string[]): Promise<Map<string, UploadedAsset>>;
  remove(publicIds: string[]): Promise<void>;
  imageUrl(publicId: string, mimeType: string): string;
  thumbnailUrl(publicId: string): string;
  listAll(prefix: string): Promise<ListedAsset[]>;
};

const configure = () => {
  if (!env) throw new Error("cloudinary is not configured");
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  return env;
};

const BATCH = 100;
const MAX_LIST_PAGES = 20;

export const cloudinaryClient: CloudinaryClient = {
  sign(userId, count) {
    const config = configure();
    const timestamp = Math.round(Date.now() / 1000);
    const folder = imageFolder(userId);

    return {
      cloudName: config.CLOUDINARY_CLOUD_NAME,
      apiKey: config.CLOUDINARY_API_KEY,
      timestamp,
      folder,
      type: "authenticated",
      allowedFormats: ALLOWED_FORMATS,
      maxBytes: MAX_IMAGE_BYTES,
      signatures: Array.from({ length: count }, () => {
        const publicId = `${folder}/${crypto.randomUUID()}`;
        const signature = cloudinary.utils.api_sign_request(
          {
            allowed_formats: ALLOWED_FORMATS,
            public_id: publicId,
            timestamp,
            type: "authenticated",
          },
          config.CLOUDINARY_API_SECRET,
        );
        return { publicId, signature };
      }),
    };
  },

  async verify(publicIds) {
    configure();
    const found = new Map<string, UploadedAsset>();

    for (let start = 0; start < publicIds.length; start += BATCH) {
      const result = await cloudinary.api.resources_by_ids(
        publicIds.slice(start, start + BATCH),
        { type: "authenticated", resource_type: "image" },
      );
      for (const resource of result.resources) {
        found.set(resource.public_id, {
          bytes: resource.bytes,
          format: resource.format,
        });
      }
    }

    return found;
  },

  async remove(publicIds) {
    if (publicIds.length === 0) return;
    configure();

    for (let start = 0; start < publicIds.length; start += BATCH) {
      try {
        await cloudinary.api.delete_resources(publicIds.slice(start, start + BATCH), {
          type: "authenticated",
          resource_type: "image",
        });
      } catch (error) {
        logger.warn("cloudinary delete failed", { error: String(error) });
      }
    }
  },

  imageUrl(publicId, mimeType) {
    configure();
    return cloudinary.utils.private_download_url(
      publicId,
      FORMAT_BY_MIME[mimeType] ?? "jpg",
      {
        type: "authenticated",
        resource_type: "image",
        expires_at: Math.round(Date.now() / 1000) + URL_TTL_SECONDS,
      },
    );
  },

  thumbnailUrl(publicId) {
    configure();
    return cloudinary.url(publicId, {
      type: "authenticated",
      sign_url: true,
      secure: true,
      format: "jpg",
      transformation: [{ width: 200, height: 200, crop: "fill" }],
    });
  },

  async listAll(prefix) {
    configure();
    const assets: ListedAsset[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < MAX_LIST_PAGES; page++) {
      const result = await cloudinary.api.resources({
        type: "authenticated",
        resource_type: "image",
        prefix,
        max_results: 500,
        ...(cursor && { next_cursor: cursor }),
      });
      for (const resource of result.resources) {
        assets.push({
          publicId: resource.public_id,
          createdAt: new Date(resource.created_at),
        });
      }
      cursor = result.next_cursor;
      if (!cursor) break;
    }

    return assets;
  },
};
