import { db } from "./db/index.js";

const rows = await db.query.transactions.findMany({
  where: { deletedAt: { isNull: true } },
  with: {
    account: true,
    toAccount: true,
    category: true,
  },
  orderBy: { date: "desc" },
  limit: 5,
});

for (const row of rows) {
  console.log(row.name, row.account.name, row.toAccount?.name);
}
process.exit(0);

const acc = await db.query.accounts.findFirst({
  with: { transactions: true, incomingTransfers: true },
});
