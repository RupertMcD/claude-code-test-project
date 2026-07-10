-- CreateTable
CREATE TABLE "BankSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ebSessionId" TEXT NOT NULL,
    "aspspName" TEXT NOT NULL,
    "aspspCountry" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AUTHORIZED',
    "validUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "uid" TEXT NOT NULL,
    "name" TEXT,
    "product" TEXT,
    "cashAccountType" TEXT,
    "currency" TEXT,
    "iban" TEXT,
    "balanceAmount" REAL,
    "balanceCurrency" TEXT,
    "balanceType" TEXT,
    "balanceUpdatedAt" DATETIME,
    "sessionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Account_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BankSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryReference" TEXT,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL,
    "creditDebit" TEXT,
    "status" TEXT,
    "bookingDate" DATETIME,
    "valueDate" DATETIME,
    "description" TEXT,
    "merchant" TEXT,
    "category" TEXT,
    "raw" TEXT,
    "accountId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "BankSession_ebSessionId_key" ON "BankSession"("ebSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_uid_key" ON "Account"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_accountId_entryReference_key" ON "Transaction"("accountId", "entryReference");
