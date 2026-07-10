import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config";
import { prisma } from "./db";
import { getAspsps, startAuth, EbApiError } from "./enableBanking";
import {
  linkSessionFromCode,
  computeNetWorth,
  recordDailySnapshot,
  getNetWorthHistory,
  syncTransactions,
} from "./accountService";

const app = Fastify({ logger: true });

// In-memory record of pending auth `state` values (dev-simple; fine for one user).
const pendingStates = new Set<string>();

app.get("/health", async () => ({ ok: true, service: "household-finance", ts: Date.now() }));

// List the banks available for a country (defaults to configured country).
app.get<{ Querystring: { country?: string } }>("/aspsps", async (req) => {
  const aspsps = await getAspsps(req.query.country || config.country);
  return {
    country: req.query.country || config.country,
    count: aspsps.length,
    aspsps: aspsps.map((a) => ({
      name: a.name,
      country: a.country,
      logo: a.logo,
      psu_types: a.psu_types,
    })),
  };
});

// Start a bank authorization. Body: { aspsp: "<bank name>", country?: "GB" }.
app.post<{ Body: { aspsp: string; country?: string } }>(
  "/auth",
  async (req, reply) => {
    if (!req.body?.aspsp) {
      return reply.code(400).send({ error: "Body must include { aspsp: '<bank name>' }" });
    }
    const { url, authorization_id, state } = await startAuth({
      aspspName: req.body.aspsp,
      country: req.body.country,
    });
    pendingStates.add(state);
    return { url, authorization_id, state };
  },
);

// The redirect target the bank sends the user back to after approval.
// Exchanges the code for a session and persists accounts + balances.
app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
  "/callback",
  async (req, reply) => {
    const { code, state, error } = req.query;
    if (error) {
      return reply.type("text/html").send(errorPage(`Bank returned an error: ${error}`));
    }
    if (!code) {
      return reply.type("text/html").send(errorPage("Missing authorization code."));
    }
    if (state && pendingStates.size > 0 && !pendingStates.has(state)) {
      req.log.warn({ state }, "callback state not recognised (continuing anyway)");
    }
    pendingStates.delete(state || "");

    try {
      const accounts = await linkSessionFromCode(code);
      await recordDailySnapshot().catch(() => {});
      return reply.type("text/html").send(successPage(accounts.length));
    } catch (err) {
      req.log.error(err);
      const msg = err instanceof EbApiError ? err.message : (err as Error).message;
      return reply.type("text/html").send(errorPage(msg));
    }
  },
);

// All persisted accounts with their latest balance.
app.get("/accounts", async () => {
  const accounts = await prisma.account.findMany({
    orderBy: { createdAt: "asc" },
    include: { session: { select: { aspspName: true } } },
  });
  return {
    count: accounts.length,
    accounts: accounts.map((a) => ({
      uid: a.uid,
      name: a.name,
      product: a.product,
      type: a.cashAccountType,
      bank: a.session.aspspName,
      balance: a.balanceAmount,
      currency: a.balanceCurrency || a.currency,
      updatedAt: a.balanceUpdatedAt,
    })),
  };
});

// Net worth summary (assets - liabilities), grouped by currency. Also records
// today's snapshot so the trend chart has data.
app.get("/net-worth", async () => {
  const result = await computeNetWorth();
  await recordDailySnapshot().catch(() => {});
  return result;
});

// Net-worth trend history. Query: ?currency=GBP
app.get<{ Querystring: { currency?: string } }>("/net-worth/history", async (req) =>
  getNetWorthHistory(req.query.currency || "GBP"),
);

// --- Manual accounts (SJP, Moneybox, etc.) ---------------------------------

app.get("/manual-accounts", async () => {
  const items = await prisma.manualAccount.findMany({ orderBy: { createdAt: "asc" } });
  return { count: items.length, accounts: items };
});

app.post<{
  Body: { name: string; kind?: string; provider?: string; balance: number; currency?: string; asOf?: string };
}>("/manual-accounts", async (req, reply) => {
  const { name, balance } = req.body || ({} as any);
  if (!name || balance == null || Number.isNaN(Number(balance))) {
    return reply.code(400).send({ error: "Body must include { name, balance }" });
  }
  const created = await prisma.manualAccount.create({
    data: {
      name,
      kind: (req.body.kind || "ASSET").toUpperCase() === "LIABILITY" ? "LIABILITY" : "ASSET",
      provider: req.body.provider ?? null,
      balance: Number(balance),
      currency: req.body.currency || "GBP",
      asOf: req.body.asOf ? new Date(req.body.asOf) : new Date(),
    },
  });
  await recordDailySnapshot().catch(() => {});
  return created;
});

app.patch<{
  Params: { id: string };
  Body: { name?: string; kind?: string; provider?: string; balance?: number; currency?: string; asOf?: string };
}>("/manual-accounts/:id", async (req, reply) => {
  const existing = await prisma.manualAccount.findUnique({ where: { id: req.params.id } });
  if (!existing) return reply.code(404).send({ error: "Unknown manual account" });
  const b = req.body || {};
  const updated = await prisma.manualAccount.update({
    where: { id: req.params.id },
    data: {
      name: b.name ?? undefined,
      kind: b.kind ? (b.kind.toUpperCase() === "LIABILITY" ? "LIABILITY" : "ASSET") : undefined,
      provider: b.provider ?? undefined,
      balance: b.balance != null ? Number(b.balance) : undefined,
      currency: b.currency ?? undefined,
      asOf: b.asOf ? new Date(b.asOf) : undefined,
    },
  });
  await recordDailySnapshot().catch(() => {});
  return updated;
});

app.delete<{ Params: { id: string } }>("/manual-accounts/:id", async (req, reply) => {
  const existing = await prisma.manualAccount.findUnique({ where: { id: req.params.id } });
  if (!existing) return reply.code(404).send({ error: "Unknown manual account" });
  await prisma.manualAccount.delete({ where: { id: req.params.id } });
  await recordDailySnapshot().catch(() => {});
  return { deleted: true };
});

// Pull + store transactions for one account. Query: ?date_from=YYYY-MM-DD
app.post<{ Params: { uid: string }; Querystring: { date_from?: string } }>(
  "/accounts/:uid/sync",
  async (req) => syncTransactions(req.params.uid, req.query.date_from),
);

// List stored transactions for one account.
app.get<{ Params: { uid: string } }>(
  "/accounts/:uid/transactions",
  async (req, reply) => {
    const account = await prisma.account.findUnique({
      where: { uid: req.params.uid },
      include: { transactions: { orderBy: { bookingDate: "desc" } } },
    });
    if (!account) return reply.code(404).send({ error: "Unknown account" });
    return {
      account: { uid: account.uid, name: account.name },
      count: account.transactions.length,
      transactions: account.transactions.map((t) => ({
        date: t.bookingDate,
        amount: t.amount,
        currency: t.currency,
        description: t.description,
        merchant: t.merchant,
        status: t.status,
      })),
    };
  },
);

function successPage(n: number): string {
  return `<!doctype html><meta charset="utf-8"><title>Bank linked</title>
<body style="font-family:-apple-system,sans-serif;max-width:32rem;margin:4rem auto;text-align:center">
<h1>&#9989; Bank linked</h1>
<p>${n} account${n === 1 ? "" : "s"} connected. You can close this window and return to the app.</p>
</body>`;
}

function errorPage(msg: string): string {
  return `<!doctype html><meta charset="utf-8"><title>Linking failed</title>
<body style="font-family:-apple-system,sans-serif;max-width:32rem;margin:4rem auto;text-align:center">
<h1>&#9888; Linking failed</h1>
<p>${msg.replace(/</g, "&lt;")}</p>
</body>`;
}

async function start() {
  await app.register(cors, { origin: true });
  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(`household-finance server on :${config.port}`);
}

start().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
