import { asc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { transactionImages } from "../db/schema/transaction.images.js";
import {
  cloudinaryClient,
  IMAGE_ROOT,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_TRANSACTION,
  mimeFromFormat,
} from "../lib/cloudinary.js";
import { IMAGE_MESSAGE } from "../constants/response.message.js";
import { ApiError } from "./api.error.util.js";
import type { ImageInput } from "../validations/transaction.validation.js";

export type VerifiedImage = {
  publicId: string;
  mimeType: string;
  size: number;
};

export type ImageExecutor = Pick<typeof db, "select">;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export const isIssuedTo = (userId: string, publicId: string) =>
  new RegExp(`^${IMAGE_ROOT}/${userId}/${UUID}$`).test(publicId);

export const verifyImages = async (
  userId: string,
  images: ImageInput[],
): Promise<VerifiedImage[]> => {
  if (images.length > MAX_IMAGES_PER_TRANSACTION) {
    throw ApiError.businessRule(IMAGE_MESSAGE.LIMIT);
  }

  const ids = images.map((image) => image.public_id);
  if (new Set(ids).size !== ids.length) {
    throw ApiError.badRequest(IMAGE_MESSAGE.DUPLICATE, {
      images: [IMAGE_MESSAGE.DUPLICATE],
    });
  }

  if (!ids.every((id) => isIssuedTo(userId, id))) {
    throw ApiError.businessRule(IMAGE_MESSAGE.NOT_UPLOADED);
  }

  if (ids.length === 0) return [];

  const found = await cloudinaryClient.verify(ids);
  const verified: VerifiedImage[] = [];

  for (const id of ids) {
    const asset = found.get(id);
    if (!asset) throw ApiError.businessRule(IMAGE_MESSAGE.NOT_UPLOADED);

    const mimeType = mimeFromFormat(asset.format);
    if (!mimeType) {
      await cloudinaryClient.remove([id]);
      throw ApiError.businessRule(IMAGE_MESSAGE.BAD_FORMAT);
    }
    if (asset.bytes > MAX_IMAGE_BYTES) {
      await cloudinaryClient.remove([id]);
      throw ApiError.businessRule(IMAGE_MESSAGE.TOO_LARGE);
    }

    verified.push({ publicId: id, mimeType, size: asset.bytes });
  }

  return verified;
};

export const toImageResponse = (row: { id: string; publicId: string; mimeType: string }) => ({
  id: row.id,
  url: cloudinaryClient.imageUrl(row.publicId, row.mimeType),
});

export const loadImages = async (executor: ImageExecutor, transactionId: string) => {
  const rows = await executor
    .select({
      id: transactionImages.id,
      publicId: transactionImages.publicId,
      mimeType: transactionImages.mimeType,
    })
    .from(transactionImages)
    .where(eq(transactionImages.transactionId, transactionId))
    .orderBy(asc(transactionImages.position));

  return rows.map(toImageResponse);
};
