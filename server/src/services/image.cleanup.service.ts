import { inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { transactionImages } from "../db/schema/transaction.images.js";
import { cloudinaryClient, IMAGE_ROOT } from "../lib/cloudinary.js";

const MIN_AGE_MS = 24 * 60 * 60 * 1000;
const CHUNK = 500;

export const cleanupOrphanImages = async () => {
  const assets = await cloudinaryClient.listAll(`${IMAGE_ROOT}/`);
  const old = assets.filter(
    (asset) => Date.now() - asset.createdAt.getTime() > MIN_AGE_MS,
  );

  const referenced = new Set<string>();
  for (let start = 0; start < old.length; start += CHUNK) {
    const rows = await db
      .select({ publicId: transactionImages.publicId })
      .from(transactionImages)
      .where(
        inArray(
          transactionImages.publicId,
          old.slice(start, start + CHUNK).map((asset) => asset.publicId),
        ),
      );
    for (const row of rows) referenced.add(row.publicId);
  }

  const orphans = old
    .map((asset) => asset.publicId)
    .filter((publicId) => !referenced.has(publicId));

  await cloudinaryClient.remove(orphans);

  return { scanned: assets.length, deleted: orphans.length, publicIds: orphans };
};
