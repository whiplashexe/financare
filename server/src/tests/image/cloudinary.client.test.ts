import { createHash } from "node:crypto";
import { describe, expect, it } from "bun:test";
import { cloudinaryClient } from "../../lib/cloudinary.js";
import { isIssuedTo } from "../../utils/image.util.js";

const secret = process.env.CLOUDINARY_API_SECRET!;
const cloud = process.env.CLOUDINARY_CLOUD_NAME!;

const sha1 = (text: string) => createHash("sha1").update(text).digest("hex");

describe("cloudinary client: upload signatures", () => {
  it("signs exactly the parameters Cloudinary checks, in its documented order", () => {
    const signed = cloudinaryClient.sign("USR001", 2);

    expect(signed.signatures).toHaveLength(2);
    for (const { publicId, signature } of signed.signatures) {
      const expected = sha1(
        `allowed_formats=jpg,png,heic&public_id=${publicId}&timestamp=${signed.timestamp}&type=authenticated${secret}`,
      );
      expect(signature).toBe(expected);
    }
  });

  it("issues unique public ids inside the user's folder and never exposes the secret", () => {
    const signed = cloudinaryClient.sign("USR042", 5);
    const ids = signed.signatures.map((s) => s.publicId);

    expect(new Set(ids).size).toBe(5);
    expect(signed.folder).toBe("financare/USR042");
    for (const id of ids) expect(isIssuedTo("USR042", id)).toBe(true);
    expect(JSON.stringify(signed)).not.toContain(secret);
    expect(signed.cloudName).toBe(cloud);
    expect(signed.type).toBe("authenticated");
    expect(signed.maxBytes).toBe(5_242_880);
    expect(Math.abs(signed.timestamp - Date.now() / 1000)).toBeLessThan(5);
  });

  it("a signature for one public id is not valid for another", () => {
    const signed = cloudinaryClient.sign("USR001", 2);
    const [a, b] = signed.signatures;

    expect(a!.signature).not.toBe(b!.signature);
  });
});

describe("cloudinary client: image URLs", () => {
  it("the image URL expires in about an hour, is signed, and does not contain the secret", () => {
    const url = cloudinaryClient.imageUrl("financare/USR001/abc", "image/png");
    const params = new URL(url).searchParams;
    const expiresAt = Number(params.get("expires_at"));

    expect(url).toStartWith("https://api.cloudinary.com/");
    expect(expiresAt - Date.now() / 1000).toBeGreaterThan(3590);
    expect(expiresAt - Date.now() / 1000).toBeLessThanOrEqual(3601);
    expect(params.get("signature")).toBeString();
    expect(params.get("type")).toBe("authenticated");
    expect(params.get("format")).toBe("png");
    expect(url).not.toContain(secret);
  });

  it("uses the extension that matches the mime type", () => {
    const format = (mime: string) =>
      new URL(cloudinaryClient.imageUrl("financare/USR001/abc", mime)).searchParams.get("format");

    expect(format("image/jpeg")).toBe("jpg");
    expect(format("image/png")).toBe("png");
    expect(format("image/heic")).toBe("heic");
  });

  it("the thumbnail is a signed 200x200 jpg that does not contain the secret", () => {
    const url = cloudinaryClient.thumbnailUrl("financare/USR001/abc");

    expect(url).toMatch(
      new RegExp(`^https://res\\.cloudinary\\.com/${cloud}/image/authenticated/s--[A-Za-z0-9_-]{8}--/c_fill,h_200,w_200/v1/financare/USR001/abc\\.jpg(\\?_a=[A-Za-z0-9]+)?$`),
    );
    expect(url).not.toContain(secret);
  });
});

describe("isIssuedTo", () => {
  const id = "financare/USR001/0f8fad5b-d9cb-469f-a165-70867728950e";

  it("accepts only the ids shaped like the ones the server issues for that user", () => {
    expect(isIssuedTo("USR001", id)).toBe(true);
    expect(isIssuedTo("USR002", id)).toBe(false);
    expect(isIssuedTo("USR001", `${id}.jpg`)).toBe(false);
    expect(isIssuedTo("USR001", `${id}/extra`)).toBe(false);
    expect(isIssuedTo("USR001", "financare/USR001/../USR002/0f8fad5b-d9cb-469f-a165-70867728950e")).toBe(false);
    expect(isIssuedTo("USR001", "financare/USR001/not-a-uuid")).toBe(false);
    expect(isIssuedTo("USR001", "other/USR001/0f8fad5b-d9cb-469f-a165-70867728950e")).toBe(false);
    expect(isIssuedTo("USR001", "")).toBe(false);
  });
});
