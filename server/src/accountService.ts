import { prisma } from "./db";
import {
  createSession,
  getAccountBalances,
  getAccountTransactions,
  type EbAccount,
} from "./enableBanking";

/**
 * Pick the most meaningful balance from an Enable Banking balances array.
 * Prefers a "closing booked" style balance, then "expected", else the first.
 */
function pickBalance(balances: any[]): any | undefined {
  if (!balances || balances.length === 0) return undefined;
  const byType = (t: string) =>
    balances.find(
      (b) => String(b.balance_type || b.name || "").toUpperCase().includes(t),
    );
  return (
    byType("CLBD") || // closing booked
    byType("CLOSING") ||
    byType("XPCD") || // expected
    byType("EXPECTED") ||
    byType("ITAV") || // interim available
    balances[0]
  );
}

/** Account types we treat as liabilities (subtract from net worth). */
const LIABILITY_TYPES = ["CARD", "LOAN", "CRDT"];

export function isLiability(cashAccountType?: string | null): boolean {
  const t = (cashAccountType || "").toUpperCase();
  return LIABILITY_TYPES.some((x) => t.includes(x));
}

/**
 * Complete a bank authorization: exchange the code for a session, then persist
 * the session, its accounts, and each account's current balance.
 */
export async function linkSessionFromCode(code: string) {
  const session = await createSession(code);

  const dbSession = await prisma.bankSession.upsert({
    where: { ebSessionId: session.session_id },
    update: {},
    create: {
      ebSessionId: session.session_id,
      aspspName: session.aspsp?.name ?? "Unknown",
      aspspCountry: session.aspsp?.country ?? "GB",
      validUntil: session.access?.valid_until
        ? new Date(session.access.valid_until)
        : null,
    },
  });

  for (const acc of session.accounts as EbAccount[]) {
    const balances = await getAccountBalances(acc.uid).catch(() => []);
    const bal = pickBalance(balances);
    const amount = bal?.balance_amount?.amount ?? bal?.amount;
    const currency =
      bal?.balance_amount?.currency ?? bal?.currency ?? acc.currency;

    await prisma.account.upsert({
      where: { uid: acc.uid },
      update: {
        name: acc.name ?? acc.product ?? null,
        product: acc.product ?? null,
        cashAccountType: acc.cash_account_type ?? null,
        currency: acc.currency ?? null,
        iban: acc.account_id?.iban ?? null,
        balanceAmount: amount != null ? Number(amount) : null,
        balanceCurrency: currency ?? null,
        balanceType: bal?.balance_type ?? bal?.name ?? null,
        balanceUpdatedAt: new Date(),
        sessionId: dbSession.id,
      },
      create: {
        uid: acc.uid,
        name: acc.name ?? acc.product ?? null,
        product: acc.product ?? null,
        cashAccountType: acc.cash_account_type ?? null,
        currency: acc.currency ?? null,
        iban: acc.account_id?.iban ?? null,
        balanceAmount: amount != null ? Number(amount) : null,
        balanceCurrency: currency ?? null,
        balanceType: bal?.balance_type ?? bal?.name ?? null,
        balanceUpdatedAt: new Date(),
        sessionId: dbSession.id,
      },
    });
  }

  return prisma.account.findMany({ where: { sessionId: dbSession.id } });
}

/** Compute net worth = assets - liabilities, grouped by currency.
 * Merges connected (open banking) accounts with manually-tracked ones. */
export async function computeNetWorth() {
  const [accounts, manual] = await Promise.all([
    prisma.account.findMany(),
    prisma.manualAccount.findMany(),
  ]);

  const byCurrency: Record<
    string,
    { assets: number; liabilities: number; net: number }
  > = {};

  const add = (cur: string, amt: number, liability: boolean) => {
    byCurrency[cur] ??= { assets: 0, liabilities: 0, net: 0 };
    if (liability) {
      byCurrency[cur].liabilities += Math.abs(amt);
      byCurrency[cur].net -= Math.abs(amt);
    } else {
      byCurrency[cur].assets += amt;
      byCurrency[cur].net += amt;
    }
  };

  for (const a of accounts) {
    // Liability balances may be reported as positive owed amounts.
    add(
      a.balanceCurrency || a.currency || "GBP",
      a.balanceAmount ?? 0,
      isLiability(a.cashAccountType),
    );
  }
  for (const m of manual) {
    add(m.currency || "GBP", m.balance, m.kind.toUpperCase() === "LIABILITY");
  }

  return {
    currencies: byCurrency,
    accounts: [
      ...accounts.map((a) => ({
        source: "connected" as const,
        id: a.uid,
        name: a.name,
        type: a.cashAccountType,
        isLiability: isLiability(a.cashAccountType),
        balance: a.balanceAmount,
        currency: a.balanceCurrency || a.currency,
      })),
      ...manual.map((m) => ({
        source: "manual" as const,
        id: m.id,
        name: m.name,
        type: m.kind,
        isLiability: m.kind.toUpperCase() === "LIABILITY",
        balance: m.balance,
        currency: m.currency,
      })),
    ],
  };
}

/** Record (or update) today's net-worth snapshot per currency, for the trend. */
export async function recordDailySnapshot() {
  const { currencies } = await computeNetWorth();
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  for (const [currency, v] of Object.entries(currencies)) {
    await prisma.netWorthSnapshot.upsert({
      where: { day_currency: { day, currency } },
      update: { assets: v.assets, liabilities: v.liabilities, net: v.net },
      create: {
        day,
        currency,
        assets: v.assets,
        liabilities: v.liabilities,
        net: v.net,
      },
    });
  }
}

/** Net-worth history (snapshots) for a currency, oldest first. */
export async function getNetWorthHistory(currency = "GBP") {
  return prisma.netWorthSnapshot.findMany({
    where: { currency },
    orderBy: { day: "asc" },
    select: { day: true, assets: true, liabilities: true, net: true },
  });
}

/** Pull transactions for an account and store them (dedup by entryReference). */
export async function syncTransactions(uid: string, dateFrom?: string) {
  const account = await prisma.account.findUnique({ where: { uid } });
  if (!account) throw new Error(`Unknown account uid ${uid}`);

  const txns = await getAccountTransactions(uid, dateFrom);
  let saved = 0;

  for (const t of txns) {
    const amount = Number(t.transaction_amount?.amount ?? t.amount ?? 0);
    const currency =
      t.transaction_amount?.currency ?? t.currency ?? account.currency ?? "GBP";
    const entryRef =
      t.entry_reference ??
      t.transaction_id ??
      `${t.booking_date ?? ""}:${amount}:${(t.remittance_information || []).join("|")}`;
    const description = Array.isArray(t.remittance_information)
      ? t.remittance_information.join(" ")
      : (t.remittance_information ?? t.creditor?.name ?? t.debtor?.name ?? null);

    try {
      await prisma.transaction.upsert({
        where: {
          accountId_entryReference: {
            accountId: account.id,
            entryReference: entryRef,
          },
        },
        update: {},
        create: {
          accountId: account.id,
          entryReference: entryRef,
          amount,
          currency,
          creditDebit: t.credit_debit_indicator ?? null,
          status: t.status ?? null,
          bookingDate: t.booking_date ? new Date(t.booking_date) : null,
          valueDate: t.value_date ? new Date(t.value_date) : null,
          description,
          merchant: t.creditor?.name ?? t.debtor?.name ?? null,
          raw: JSON.stringify(t),
        },
      });
      saved++;
    } catch {
      // ignore duplicates / rows that violate the unique constraint
    }
  }

  return { fetched: txns.length, saved };
}
