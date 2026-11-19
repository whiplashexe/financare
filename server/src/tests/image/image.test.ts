import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { transactionImages } from "../../db/schema/transaction.images.js";
import { fakeCloudinary } from "../cloudinary.fake.js";
import {
  createUser,
  deleteRateLimit,
  deleteUsers,
  startServer,
  transactionRows,
} from "../helpers.js";

const server = startServer();
const emails: string[] = [];
const signedUsers: string[] = [];
const secret = process.env.CLOUDINARY_API_SECRET!;

const newUser = async () => {
  const user = await createUser(server);
  emails.push(user.email);
  signedUsers.push(user.userId);
  return user;
};

type User = Awaited<ReturnType<typeof newUser>>;

const call = (
  method: string,
  path: string,
  user: User | undefined,
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  server.request({
    method,
    path,
    body,
    headers: {
      ...(user ? { authorization: `Bearer ${user.accessToken}` } : {}),
      ...headers,
    },
  });

const createAccount = async (user: User) => {
  const res = await call("POST", "/accounts", user, {
    name: `Account ${crypto.randomUUID().slice(0, 8)}`,
    type: "BANK",
    initial_balance: 1_000_000,
  });
  return (await res.json()).data.id as string;
};

const issue = async (user: User, options: { bytes?: number; format?: string; upload?: boolean } = {}) => {
  const res = await call("POST", "/uploads/sign", user, { count: 1 });
  const publicId = (await res.json()).data.signatures[0].public_id as string;
  if (options.upload !== false) fakeCloudinary.upload(publicId, options);
  return publicId;
};

const imageBody = (publicId: string, extra: Record<string, unknown> = {}) => ({
  public_id: publicId,
  mime_type: "image/jpeg",
  size: 1000,
  ...extra,
});

const makeTransaction = async (user: User, accountId: string, images: string[] = []) => {
  const res = await call("POST", "/transactions", user, {
    type: "OUTCOME",
    name: "Groceries",
    amount: 10_000,
    account_id: accountId,
    images: images.map((id) => imageBody(id)),
  });
  return (await res.json()).data.transaction as Record<string, any>;
};

const detail = async (user: User, id: string) =>
  (await (await call("GET", `/transactions/${id}`, user)).json()).data as Record<string, any>;
const imageIds = async (user: User, id: string) =>
  (await detail(user, id)).images.map((i: any) => i.id) as string[];
const addImage = (user: User, id: string, publicId: string, extra: Record<string, unknown> = {}) =>
  call("POST", `/transactions/${id}/images`, user, imageBody(publicId, extra));
const rowsOf = (transactionId: string) =>
  db.select().from(transactionImages).where(eq(transactionImages.transactionId, transactionId));

beforeAll(() => fakeCloudinary.install());
beforeEach(() => fakeCloudinary.reset());

afterAll(async () => {
  fakeCloudinary.restore();
  try {
    await deleteUsers(emails);
    for (const id of signedUsers) await deleteRateLimit(`upload-sign:${id}`);
  } finally {
    server.close();
  }
});

describe("POST /uploads/sign", () => {
  it("200: returns what the client needs for a direct upload to Cloudinary", async () => {
    const user = await newUser();

    const res = await call("POST", "/uploads/sign", user, { count: 2 });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      folder: `financare/${user.userId}`,
      type: "authenticated",
      allowed_formats: "jpg,png,heic",
      max_bytes: 5_242_880,
      upload_url: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`,
    });
    expect(Math.abs(json.data.timestamp - Date.now() / 1000)).toBeLessThan(10);
    expect(json.data.signatures).toHaveLength(2);
  });

  it("each signature is bound to its own public id and is the SHA-1 Cloudinary expects", async () => {
    const user = await newUser();

    const json = await (await call("POST", "/uploads/sign", user, { count: 3 })).json();

    const ids = json.data.signatures.map((s: any) => s.public_id);
    expect(new Set(ids).size).toBe(3);
    for (const { public_id, signature } of json.data.signatures) {
      expect(public_id).toMatch(
        new RegExp(`^financare/${user.userId}/[0-9a-f-]{36}$`),
      );
      const expected = createHash("sha1")
        .update(
          `allowed_formats=jpg,png,heic&public_id=${public_id}&timestamp=${json.data.timestamp}&type=authenticated${secret}`,
        )
        .digest("hex");
      expect(signature).toBe(expected);
    }
  });

  it("never exposes the API secret", async () => {
    const user = await newUser();

    const res = await call("POST", "/uploads/sign", user, { count: 5 });

    expect(await res.text()).not.toContain(secret);
  });

  it("two users get different folders", async () => {
    const first = await newUser();
    const second = await newUser();

    const a = await (await call("POST", "/uploads/sign", first, { count: 1 })).json();
    const b = await (await call("POST", "/uploads/sign", second, { count: 1 })).json();

    expect(a.data.folder).not.toBe(b.data.folder);
  });

  it("400 unless count is an integer from 1 to 5", async () => {
    const user = await newUser();
    const sign = (body: unknown) => call("POST", "/uploads/sign", user, body);

    for (const body of [{ count: 0 }, { count: 6 }, { count: 1.5 }, { count: "2" }, { count: null }, {}, { count: 1, extra: true }]) {
      expect((await sign(body)).status).toBe(400);
    }
    expect((await call("POST", "/uploads/sign", user)).status).toBe(400);
    expect((await sign({ count: 1 })).status).toBe(200);
    expect((await sign({ count: 5 })).status).toBe(200);
  });

  it("401 without a token", async () => {
    expect((await call("POST", "/uploads/sign", undefined, { count: 1 })).status).toBe(401);
  });

  it("429 after 30 requests in an hour, only for that user", async () => {
    const user = await newUser();
    const other = await newUser();

    for (let i = 0; i < 30; i++) {
      expect((await call("POST", "/uploads/sign", user, { count: 1 })).status).toBe(200);
    }
    const blocked = await call("POST", "/uploads/sign", user, { count: 1 });

    expect(blocked.status).toBe(429);
    expect((await blocked.json()).code).toBe("RATE_LIMITED");
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect((await call("POST", "/uploads/sign", other, { count: 1 })).status).toBe(200);
  });
});

describe("POST /transactions with images", () => {
  it("201: attaches the uploaded images and returns them in order", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const first = await issue(user);
    const second = await issue(user);

    const res = await call("POST", "/transactions", user, {
      type: "OUTCOME",
      name: "Groceries",
      amount: 10_000,
      account_id: account,
      images: [imageBody(first), imageBody(second, { mime_type: "image/png" })],
    });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.transaction.images).toEqual([
      { id: expect.stringMatching(/^IMG\d{3,}$/), url: expect.stringContaining(first) },
      { id: expect.stringMatching(/^IMG\d{3,}$/), url: expect.stringContaining(second) },
    ]);
    const rows = await rowsOf(json.data.transaction.id);
    expect(rows.map((r) => r.publicId)).toEqual([first, second]);
    expect(rows.map((r) => r.position)).toEqual([0, 1]);
  });

  it("stores what Cloudinary reports, not what the client claims", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const publicId = await issue(user, { bytes: 123_456, format: "png" });

    const created = await call("POST", "/transactions", user, {
      type: "OUTCOME",
      name: "x",
      amount: 1000,
      account_id: account,
      images: [imageBody(publicId, { mime_type: "image/jpeg", size: 10 })],
    });
    const json = await created.json();

    const [row] = await rowsOf(json.data.transaction.id);
    expect(row).toMatchObject({ mimeType: "image/png", size: 123_456 });
  });

  it("the detail, the list, and the trash show the images", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const first = await issue(user);
    const second = await issue(user);
    const created = await makeTransaction(user, account, [first, second]);

    const full = await detail(user, created.id);
    expect(full.images).toHaveLength(2);
    expect(full.images[0].url).toContain(first);

    const listed = (await (await call("GET", "/transactions", user)).json()).data[0];
    expect(listed).toMatchObject({
      id: created.id,
      images_count: 2,
      thumbnail_url: `https://fake.cloudinary.test/thumb/${first}`,
    });

    await call("DELETE", `/transactions/${created.id}`, user);
    const trashed = (await (await call("GET", "/transactions/trash", user)).json()).data[0];
    expect(trashed).toMatchObject({ images_count: 2, thumbnail_url: expect.stringContaining(first) });
  });

  it("a transaction without images keeps an empty list and no thumbnail", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await makeTransaction(user, account);

    expect(created.images).toEqual([]);
    const listed = (await (await call("GET", "/transactions", user)).json()).data[0];
    expect(listed).toMatchObject({ images_count: 0, thumbnail_url: null });
  });

  it("accepts five images, and a transfer can carry receipts too", async () => {
    const user = await newUser();
    const source = await createAccount(user);
    const target = await createAccount(user);
    const ids = await Promise.all(Array.from({ length: 5 }, () => issue(user)));

    const five = await call("POST", "/transactions", user, {
      type: "OUTCOME",
      name: "x",
      amount: 1000,
      account_id: source,
      images: ids.map((id) => imageBody(id)),
    });
    expect(five.status).toBe(201);

    const transfer = await call("POST", "/transactions", user, {
      type: "TRANSFER",
      name: "Move",
      amount: 1000,
      account_id: source,
      to_account_id: target,
      images: [imageBody(await issue(user))],
    });
    expect(transfer.status).toBe(201);
  });

  it("422 for more than five images, 400 for more than fifty or for the same image twice", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const ids = await Promise.all(Array.from({ length: 6 }, () => issue(user)));
    const send = (images: unknown[]) =>
      call("POST", "/transactions", user, { type: "OUTCOME", name: "x", amount: 1000, account_id: account, images });

    const tooMany = await send(ids.map((id) => imageBody(id)));
    expect(tooMany.status).toBe(422);
    expect((await tooMany.json()).code).toBe("BUSINESS_RULE");

    expect((await send(Array.from({ length: 51 }, () => imageBody(ids[0]!)))).status).toBe(400);
    expect((await send([imageBody(ids[0]!), imageBody(ids[0]!)])).status).toBe(400);
    expect(await transactionRows(user.userId)).toHaveLength(0);
  });

  it("422 for an image that was never uploaded, belongs to someone else, or was not issued by the server", async () => {
    const user = await newUser();
    const other = await newUser();
    const account = await createAccount(user);
    const send = (publicId: string) =>
      call("POST", "/transactions", user, {
        type: "OUTCOME",
        name: "x",
        amount: 1000,
        account_id: account,
        images: [imageBody(publicId)],
      });

    const notUploaded = await issue(user, { upload: false });
    const foreign = await issue(other);

    for (const publicId of [
      notUploaded,
      foreign,
      `financare/${user.userId}/not-a-uuid`,
      `financare/${user.userId}/../${other.userId}/0f8fad5b-d9cb-469f-a165-70867728950e`,
      "someone/else/0f8fad5b-d9cb-469f-a165-70867728950e",
    ]) {
      const res = await send(publicId);
      expect(res.status).toBe(422);
      expect((await res.json()).message).toBe("The image was not uploaded");
    }
    expect(await transactionRows(user.userId)).toHaveLength(0);
  });

  it("422 and the file is removed when it is larger than 5 MB or has a format that is not allowed", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const big = await issue(user, { bytes: 5_242_881 });
    const gif = await issue(user, { format: "gif" });
    const send = (publicId: string) =>
      call("POST", "/transactions", user, {
        type: "OUTCOME",
        name: "x",
        amount: 1000,
        account_id: account,
        images: [imageBody(publicId)],
      });

    const tooLarge = await send(big);
    expect(tooLarge.status).toBe(422);
    expect((await tooLarge.json()).message).toBe("The image is larger than 5 MB");

    const badFormat = await send(gif);
    expect(badFormat.status).toBe(422);
    expect((await badFormat.json()).message).toBe("The image format is not allowed");

    expect(fakeCloudinary.removed).toEqual(expect.arrayContaining([big, gif]));
  });

  it("exactly 5 MB is accepted", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const publicId = await issue(user, { bytes: 5_242_880 });

    const res = await call("POST", "/transactions", user, {
      type: "OUTCOME",
      name: "x",
      amount: 1000,
      account_id: account,
      images: [imageBody(publicId)],
    });

    expect(res.status).toBe(201);
  });

  it("400 for invalid image fields", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const publicId = await issue(user);
    const send = (image: unknown) =>
      call("POST", "/transactions", user, { type: "OUTCOME", name: "x", amount: 1000, account_id: account, images: [image] });

    expect((await send({ mime_type: "image/jpeg", size: 1000 })).status).toBe(400);
    expect((await send(imageBody(publicId, { mime_type: "image/gif" }))).status).toBe(400);
    expect((await send(imageBody(publicId, { size: 0 }))).status).toBe(400);
    expect((await send(imageBody(publicId, { size: 5_242_881 }))).status).toBe(400);
    expect((await send(imageBody(publicId, { size: 1.5 }))).status).toBe(400);
    expect((await send(imageBody(publicId, { public_id: "" }))).status).toBe(400);
    expect((await send(imageBody(publicId, { extra: 1 }))).status).toBe(400);
  });

  it("an image can only belong to one transaction, and nothing is recorded when it is reused", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const publicId = await issue(user);
    await makeTransaction(user, account, [publicId]);

    const res = await call("POST", "/transactions", user, {
      type: "OUTCOME",
      name: "again",
      amount: 1000,
      account_id: account,
      images: [imageBody(publicId)],
    });

    expect(res.status).toBe(409);
    expect(await transactionRows(user.userId)).toHaveLength(1);
  });

  it("a failed transaction attaches no image", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const publicId = await issue(user);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const res = await call("POST", "/transactions", user, {
      type: "OUTCOME",
      name: "x",
      amount: 1000,
      account_id: account,
      date: tomorrow,
      images: [imageBody(publicId)],
    });

    expect(res.status).toBe(422);
    expect(await db.select().from(transactionImages).where(eq(transactionImages.publicId, publicId))).toHaveLength(0);
  });

  it("a replayed Idempotency-Key attaches the images once", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const publicId = await issue(user);
    const key = crypto.randomUUID();
    const body = {
      type: "OUTCOME",
      name: "x",
      amount: 1000,
      account_id: account,
      images: [imageBody(publicId)],
    };

    const first = await call("POST", "/transactions", user, body, { "idempotency-key": key });
    const second = await call("POST", "/transactions", user, body, { "idempotency-key": key });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers.get("idempotent-replayed")).toBe("true");
    expect(await transactionRows(user.userId)).toHaveLength(1);
    expect(await db.select().from(transactionImages).where(eq(transactionImages.publicId, publicId))).toHaveLength(1);
  });
});

describe("POST /transactions/:id/images", () => {
  it("201: adds an image at the end and returns it", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const first = await issue(user);
    const created = await makeTransaction(user, account, [first]);
    const second = await issue(user);

    const res = await addImage(user, created.id, second);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data).toEqual({
      id: expect.stringMatching(/^IMG\d{3,}$/),
      url: expect.stringContaining(second),
    });
    const full = await detail(user, created.id);
    expect(full.images.map((i: any) => i.id)).toEqual([(await rowsOf(created.id))[0]!.id, json.data.id]);
  });

  it("422 when the transaction already has five images", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const ids = await Promise.all(Array.from({ length: 5 }, () => issue(user)));
    const created = await makeTransaction(user, account, ids);
    const extra = await issue(user);

    const res = await addImage(user, created.id, extra);

    expect(res.status).toBe(422);
    expect((await res.json()).message).toBe("A transaction can have at most 5 images");
    expect(await rowsOf(created.id)).toHaveLength(5);
  });

  it("simultaneous additions never exceed five", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await makeTransaction(user, account);
    const ids = await Promise.all(Array.from({ length: 7 }, () => issue(user)));

    const results = await Promise.all(ids.map((id) => addImage(user, created.id, id)));

    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    expect(results.filter((r) => r.status === 422)).toHaveLength(2);
    const rows = await rowsOf(created.id);
    expect(rows.map((r) => r.position).sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it("409 when the image is already attached, 422 when it was not uploaded or is not the user's", async () => {
    const user = await newUser();
    const other = await newUser();
    const account = await createAccount(user);
    const taken = await issue(user);
    await makeTransaction(user, account, [taken]);
    const target = await makeTransaction(user, account);

    expect((await addImage(user, target.id, taken)).status).toBe(409);
    expect((await addImage(user, target.id, await issue(user, { upload: false }))).status).toBe(422);
    expect((await addImage(user, target.id, await issue(other))).status).toBe(422);
    expect(await rowsOf(target.id)).toHaveLength(0);
  });

  it("422 for an oversized or wrong-format file", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await makeTransaction(user, account);

    expect((await addImage(user, created.id, await issue(user, { bytes: 6_000_000 }))).status).toBe(422);
    expect((await addImage(user, created.id, await issue(user, { format: "webp" }))).status).toBe(422);
  });

  it("404 for a trashed, foreign, or unknown transaction; 422 for an admin fee", async () => {
    const user = await newUser();
    const other = await newUser();
    const account = await createAccount(user);
    const target = await createAccount(user);
    const live = await makeTransaction(user, account);
    const trashed = await makeTransaction(user, account);
    await call("DELETE", `/transactions/${trashed.id}`, user);
    const transfer = await call("POST", "/transactions", user, {
      type: "TRANSFER",
      name: "Move",
      amount: 1000,
      admin_fee: 500,
      account_id: account,
      to_account_id: target,
    });
    const fee = (await transactionRows(user.userId)).find((t) => t.parentTransactionId)!;
    expect(transfer.status).toBe(201);

    expect((await addImage(user, trashed.id, await issue(user))).status).toBe(404);
    expect((await addImage(other, live.id, await issue(other))).status).toBe(404);
    expect((await addImage(user, "TRANS999999", await issue(user))).status).toBe(404);
    expect((await addImage(user, fee.id, await issue(user))).status).toBe(422);
  });

  it("400 for invalid fields, 401 without a token", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await makeTransaction(user, account);
    const publicId = await issue(user);

    expect((await call("POST", `/transactions/${created.id}/images`, user, {})).status).toBe(400);
    expect((await addImage(user, created.id, publicId, { mime_type: "image/gif" })).status).toBe(400);
    expect((await addImage(user, created.id, publicId, { size: 0 })).status).toBe(400);
    expect((await call("POST", `/transactions/${created.id}/images`, undefined, imageBody(publicId))).status).toBe(401);
  });
});

describe("DELETE /transactions/:id/images/:imageId", () => {
  it("204: removes the image, deletes the file, and leaves the others", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const ids = await Promise.all([issue(user), issue(user), issue(user)]);
    const created = await makeTransaction(user, account, ids);
    const [first, second, third] = await imageIds(user, created.id);

    const res = await call("DELETE", `/transactions/${created.id}/images/${second}`, user);

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(await imageIds(user, created.id)).toEqual([first!, third!]);
    expect(fakeCloudinary.removed).toEqual([ids[1]!]);
  });

  it("keeps the positions compact, so a new image fits after a removal", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const ids = await Promise.all(Array.from({ length: 5 }, () => issue(user)));
    const created = await makeTransaction(user, account, ids);
    const current = await imageIds(user, created.id);

    await call("DELETE", `/transactions/${created.id}/images/${current[1]}`, user);
    expect((await rowsOf(created.id)).map((r) => r.position).sort()).toEqual([0, 1, 2, 3]);

    const added = await addImage(user, created.id, await issue(user));
    expect(added.status).toBe(201);
    expect((await rowsOf(created.id)).map((r) => r.position).sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it("404 for an unknown image, one of another transaction, or twice", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const a = await makeTransaction(user, account, [await issue(user)]);
    const b = await makeTransaction(user, account, [await issue(user)]);
    const [imageOfA] = await imageIds(user, a.id);

    expect((await call("DELETE", `/transactions/${a.id}/images/IMG999999`, user)).status).toBe(404);
    expect((await call("DELETE", `/transactions/${b.id}/images/${imageOfA}`, user)).status).toBe(404);
    expect((await call("DELETE", `/transactions/${a.id}/images/${imageOfA}`, user)).status).toBe(204);
    expect((await call("DELETE", `/transactions/${a.id}/images/${imageOfA}`, user)).status).toBe(404);
  });

  it("404 for another user's transaction, which keeps its image", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const account = await createAccount(owner);
    const created = await makeTransaction(owner, account, [await issue(owner)]);
    const [imageId] = await imageIds(owner, created.id);

    expect((await call("DELETE", `/transactions/${created.id}/images/${imageId}`, intruder)).status).toBe(404);
    expect(await imageIds(owner, created.id)).toEqual([imageId!]);
    expect(fakeCloudinary.removed).toEqual([]);
  });

  it("401 without a token", async () => {
    expect((await call("DELETE", "/transactions/TRANS001/images/IMG001", undefined)).status).toBe(401);
  });
});

describe("PATCH /transactions/:id/images/order", () => {
  const reorder = (user: User, id: string, ids: unknown) =>
    call("PATCH", `/transactions/${id}/images/order`, user, { ids });

  it("200: applies the new order, and the detail shows it", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await makeTransaction(user, account, await Promise.all([issue(user), issue(user), issue(user)]));
    const [a, b, c] = await imageIds(user, created.id);

    const res = await reorder(user, created.id, [c, a, b]);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.map((i: any) => i.id)).toEqual([c!, a!, b!]);
    expect(await imageIds(user, created.id)).toEqual([c!, a!, b!]);
  });

  it("swaps two images and reverses a full set, which needs the deferred position constraint", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await makeTransaction(user, account, await Promise.all(Array.from({ length: 5 }, () => issue(user))));
    const current = await imageIds(user, created.id);

    expect((await reorder(user, created.id, [current[1], current[0], ...current.slice(2)])).status).toBe(200);
    const reversed = [...current].reverse();
    expect((await reorder(user, created.id, reversed)).status).toBe(200);
    expect(await imageIds(user, created.id)).toEqual(reversed);
    expect((await rowsOf(created.id)).map((r) => r.position).sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it("the same order is a harmless no-op", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await makeTransaction(user, account, await Promise.all([issue(user), issue(user)]));
    const current = await imageIds(user, created.id);

    expect((await reorder(user, created.id, current)).status).toBe(200);
    expect(await imageIds(user, created.id)).toEqual(current);
  });

  it("400 unless the ids are exactly the transaction's images, each once", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await makeTransaction(user, account, await Promise.all([issue(user), issue(user), issue(user)]));
    const other = await makeTransaction(user, account, [await issue(user)]);
    const [a, b, c] = await imageIds(user, created.id);
    const [foreignImage] = await imageIds(user, other.id);

    for (const ids of [
      [a, b],
      [a, b, c, "IMG999999"],
      [a, b, "IMG999999"],
      [a, a, b],
      [a, b, foreignImage],
      [],
    ]) {
      expect((await reorder(user, created.id, ids)).status).toBe(400);
    }
    expect((await reorder(user, created.id, [a, b, c, a, b, c])).status).toBe(400);
    expect((await call("PATCH", `/transactions/${created.id}/images/order`, user, {})).status).toBe(400);
    expect(await imageIds(user, created.id)).toEqual([a!, b!, c!]);
  });

  it("404 for a trashed, foreign, or unknown transaction, and 401 without a token", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const account = await createAccount(owner);
    const created = await makeTransaction(owner, account, [await issue(owner)]);
    const [imageId] = await imageIds(owner, created.id);
    const trashed = await makeTransaction(owner, account, [await issue(owner)]);
    const [trashedImage] = await imageIds(owner, trashed.id);
    await call("DELETE", `/transactions/${trashed.id}`, owner);

    expect((await reorder(intruder, created.id, [imageId])).status).toBe(404);
    expect((await reorder(owner, trashed.id, [trashedImage])).status).toBe(404);
    expect((await reorder(owner, "TRANS999999", [imageId])).status).toBe(404);
    expect((await reorder(undefined as unknown as User, created.id, [imageId])).status).toBe(401);
  });
});

describe("images and the life of a transaction", () => {
  it("moving to the trash keeps the files, and restoring brings the images back", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await makeTransaction(user, account, [await issue(user)]);

    await call("DELETE", `/transactions/${created.id}`, user);
    expect(fakeCloudinary.removed).toEqual([]);

    await call("POST", `/transactions/${created.id}/restore`, user);
    expect((await detail(user, created.id)).images).toHaveLength(1);
  });

  it("deleting for good removes the files from Cloudinary and the rows", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const ids = await Promise.all([issue(user), issue(user)]);
    const created = await makeTransaction(user, account, ids);

    const res = await call("DELETE", `/transactions/${created.id}?permanent=true`, user);

    expect(res.status).toBe(204);
    expect(fakeCloudinary.removed.sort()).toEqual([...ids].sort());
    expect(await rowsOf(created.id)).toHaveLength(0);
  });

  it("deleting for good from the trash also removes the files", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const publicId = await issue(user);
    const created = await makeTransaction(user, account, [publicId]);
    await call("DELETE", `/transactions/${created.id}`, user);

    await call("DELETE", `/transactions/${created.id}?permanent=true`, user);

    expect(fakeCloudinary.removed).toEqual([publicId]);
  });

  it("a transaction without images does not call Cloudinary when deleted for good", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const created = await makeTransaction(user, account);

    await call("DELETE", `/transactions/${created.id}?permanent=true`, user);

    expect(fakeCloudinary.removed).toEqual([]);
  });

  it("an image released by a permanent delete cannot be attached again", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const publicId = await issue(user);
    const created = await makeTransaction(user, account, [publicId]);
    await call("DELETE", `/transactions/${created.id}?permanent=true`, user);
    const next = await makeTransaction(user, account);

    const res = await addImage(user, next.id, publicId);

    expect(res.status).toBe(422);
  });
});

describe("GET /internal/cron/image-cleanup", () => {
  const SECRET = "test-cron-secret-0123456789";
  const previous = process.env.CRON_SECRET;
  const trigger = (headers: Record<string, string> = {}) =>
    server.request({ method: "GET", path: "/internal/cron/image-cleanup", headers });

  beforeAll(() => {
    process.env.CRON_SECRET = SECRET;
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  });

  it("401 without the secret or with a wrong one", async () => {
    expect((await trigger()).status).toBe(401);
    expect((await trigger({ authorization: "Bearer wrong-secret-wrong-secret" })).status).toBe(401);
  });

  it("deletes uploads older than a day that no transaction uses, and nothing else", async () => {
    const user = await newUser();
    const account = await createAccount(user);
    const attached = await issue(user, { upload: false });
    fakeCloudinary.upload(attached, { ageHours: 72 });
    await makeTransaction(user, account, [attached]);
    const oldOrphan = await issue(user, { upload: false });
    fakeCloudinary.upload(oldOrphan, { ageHours: 30 });
    const recentOrphan = await issue(user, { upload: false });
    fakeCloudinary.upload(recentOrphan, { ageHours: 2 });

    const res = await trigger({ authorization: `Bearer ${SECRET}` });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual({ scanned: 3, deleted: 1, publicIds: [oldOrphan] });
    expect(fakeCloudinary.assets.has(attached)).toBe(true);
    expect(fakeCloudinary.assets.has(recentOrphan)).toBe(true);
    expect(fakeCloudinary.assets.has(oldOrphan)).toBe(false);
  });

  it("running it again changes nothing", async () => {
    const user = await newUser();
    const orphan = await issue(user, { upload: false });
    fakeCloudinary.upload(orphan, { ageHours: 48 });

    await trigger({ authorization: `Bearer ${SECRET}` });
    const second = await (await trigger({ authorization: `Bearer ${SECRET}` })).json();

    expect(second.data).toEqual({ scanned: 0, deleted: 0, publicIds: [] });
  });
});
