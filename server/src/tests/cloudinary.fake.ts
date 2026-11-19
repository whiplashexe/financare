import { cloudinaryClient } from "../lib/cloudinary.js";

type Asset = { bytes: number; format: string; createdAt: Date };

const original = { ...cloudinaryClient };

export const fakeCloudinary = {
  assets: new Map<string, Asset>(),
  removed: [] as string[],

  install() {
    Object.assign(cloudinaryClient, {
      verify: async (ids: string[]) =>
        new Map(
          ids
            .filter((id) => this.assets.has(id))
            .map((id) => [id, { bytes: this.assets.get(id)!.bytes, format: this.assets.get(id)!.format }]),
        ),
      remove: async (ids: string[]) => {
        for (const id of ids) {
          this.removed.push(id);
          this.assets.delete(id);
        }
      },
      imageUrl: (publicId: string, mimeType: string) =>
        `https://fake.cloudinary.test/image/${publicId}?mime=${encodeURIComponent(mimeType)}`,
      thumbnailUrl: (publicId: string) => `https://fake.cloudinary.test/thumb/${publicId}`,
      listAll: async (prefix: string) =>
        [...this.assets.entries()]
          .filter(([id]) => id.startsWith(prefix))
          .map(([publicId, asset]) => ({ publicId, createdAt: asset.createdAt })),
    });
  },

  restore() {
    Object.assign(cloudinaryClient, original);
  },

  reset() {
    this.assets.clear();
    this.removed.length = 0;
  },

  upload(publicId: string, options: { bytes?: number; format?: string; ageHours?: number } = {}) {
    this.assets.set(publicId, {
      bytes: options.bytes ?? 50_000,
      format: options.format ?? "jpg",
      createdAt: new Date(Date.now() - (options.ageHours ?? 0) * 60 * 60 * 1000),
    });
  },
};
