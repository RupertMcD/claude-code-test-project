-- CreateTable
CREATE TABLE "ManualAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'ASSET',
    "provider" TEXT,
    "balance" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "asOf" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "NetWorthSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "day" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "assets" REAL NOT NULL,
    "liabilities" REAL NOT NULL,
    "net" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "NetWorthSnapshot_day_currency_key" ON "NetWorthSnapshot"("day", "currency");
