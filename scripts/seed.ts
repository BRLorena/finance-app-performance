/**
 * Seeds the local Docker database with the test users and a realistic
 * amount of data per user, so /api/summary aggregates real rows.
 *
 * Writes straight to Postgres: registering through /api/register would hit
 * its per-IP rate limit (10 a minute) long before 150 users.
 *
 * Usage: npm run seed   (DATABASE_URL defaults to the compose database)
 */
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  LOAD_USER_COUNT,
  LOCAL_PASSWORD,
  RATE_LIMIT_USER_EMAIL,
  UX_USER_EMAIL,
  loadUserEmail,
} from "../config/users.ts";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://finance:finance@localhost:5433/finance";

const EXPENSES_PER_USER = 40;
const INCOMES_PER_USER = 12;
const INVOICES_PER_USER = 8;

const EXPENSE_CATEGORIES = [
  "foodDining",
  "transportation",
  "shopping",
  "billsUtilities",
  "entertainment",
  "healthcare",
  "travel",
];
const INCOME_CATEGORIES = ["salary", "freelance", "investment"];
const INVOICE_STATUSES = ["PENDING", "PAID", "OVERDUE"];

function daysAgo(days: number): Date {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date;
}

/** Builds one multi-row INSERT; values are passed as parameters */
function insert(table: string, columns: string[], rows: unknown[][]) {
  const params: unknown[] = [];
  const tuples = rows.map((row) => {
    const placeholders = row.map((value) => {
      params.push(value);
      return `$${params.length}`;
    });
    return `(${placeholders.join(", ")})`;
  });
  const cols = columns.map((c) => `"${c}"`).join(", ");
  return {
    text: `INSERT INTO "${table}" (${cols}) VALUES ${tuples.join(", ")}`,
    values: params,
  };
}

async function main() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  // Same cost as /api/register, so logins cost what they do in production
  const hash = await bcrypt.hash(LOCAL_PASSWORD, 12);
  const emails = [
    ...Array.from({ length: LOAD_USER_COUNT }, (_, i) => loadUserEmail(i + 1)),
    UX_USER_EMAIL,
    RATE_LIMIT_USER_EMAIL,
  ];

  await client.query("BEGIN");
  // Re-running resets these users only (their data cascades)
  await client.query(`DELETE FROM "users" WHERE "email" = ANY($1)`, [emails]);

  const now = new Date();
  for (const email of emails) {
    const userId = randomUUID();
    await client.query(
      insert(
        "users",
        ["id", "email", "name", "password", "createdAt", "updatedAt"],
        [[userId, email, "Perf User", hash, now, now]],
      ),
    );

    const expenses = Array.from({ length: EXPENSES_PER_USER }, (_, i) => [
      randomUUID(),
      Math.round((5 + ((i * 37) % 200)) * 100) / 100,
      `Seeded expense ${i + 1}`,
      EXPENSE_CATEGORIES[i % EXPENSE_CATEGORIES.length],
      daysAgo(i * 3),
      userId,
      now,
      now,
    ]);
    await client.query(
      insert(
        "expenses",
        [
          "id",
          "amount",
          "description",
          "category",
          "date",
          "userId",
          "createdAt",
          "updatedAt",
        ],
        expenses,
      ),
    );

    const incomes = Array.from({ length: INCOMES_PER_USER }, (_, i) => [
      randomUUID(),
      1500 + i * 50,
      `Seeded income ${i + 1}`,
      INCOME_CATEGORIES[i % INCOME_CATEGORIES.length],
      daysAgo(i * 30),
      i % 3 === 0,
      i % 3 === 0 ? "monthly" : null,
      userId,
      now,
      now,
    ]);
    await client.query(
      insert(
        "incomes",
        [
          "id",
          "amount",
          "description",
          "category",
          "date",
          "recurring",
          "frequency",
          "userId",
          "createdAt",
          "updatedAt",
        ],
        incomes,
      ),
    );

    const invoices = Array.from({ length: INVOICES_PER_USER }, (_, i) => [
      randomUUID(),
      `Client ${i + 1}`,
      300 + i * 120,
      `Seeded invoice ${i + 1}`,
      daysAgo(i * 10 - 30),
      daysAgo(i * 10),
      INVOICE_STATUSES[i % INVOICE_STATUSES.length],
      userId,
      now,
      now,
    ]);
    await client.query(
      insert(
        "invoices",
        [
          "id",
          "clientName",
          "amount",
          "description",
          "dueDate",
          "issueDate",
          "status",
          "userId",
          "createdAt",
          "updatedAt",
        ],
        invoices,
      ),
    );
  }

  await client.query("COMMIT");
  await client.end();
  console.log(
    `Seeded ${emails.length} users with ${EXPENSES_PER_USER} expenses, ` +
      `${INCOMES_PER_USER} incomes and ${INVOICES_PER_USER} invoices each`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
