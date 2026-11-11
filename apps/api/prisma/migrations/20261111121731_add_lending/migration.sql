-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'REDEEMED', 'FORFEITED');

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "loanNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "LoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "loanDate" TIMESTAMP(3) NOT NULL,
    "principalOriginal" DECIMAL(14,2) NOT NULL,
    "principal" DECIMAL(14,2) NOT NULL,
    "interestStartDate" TIMESTAMP(3) NOT NULL,
    "monthlyRatePct" DECIMAL(5,2) NOT NULL,
    "ltvPct" DECIMAL(6,2),
    "valuationTotal" DECIMAL(14,2),
    "disbursedMode" "PaymentMode" NOT NULL DEFAULT 'CASH',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3),
    "forfeitOutcome" TEXT,
    "forfeitNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanItem" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metal" "Metal" NOT NULL,
    "purity" "Purity" NOT NULL,
    "grossWeightG" DECIMAL(10,3) NOT NULL,
    "netWeightG" DECIMAL(10,3) NOT NULL,
    "ratePerGram" DECIMAL(12,4),
    "value" DECIMAL(14,2),
    "notes" TEXT,

    CONSTRAINT "LoanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanPayment" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "interestPart" DECIMAL(14,2) NOT NULL,
    "principalPart" DECIMAL(14,2) NOT NULL,
    "principalBefore" DECIMAL(14,2) NOT NULL,
    "principalAfter" DECIMAL(14,2) NOT NULL,
    "monthsCharged" INTEGER NOT NULL,
    "interestStartBefore" TIMESTAMP(3) NOT NULL,
    "mode" "PaymentMode" NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT,

    CONSTRAINT "LoanPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanMerchantPledge" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "merchantPhone" TEXT,
    "pledgedAt" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "returnedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanMerchantPledge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Loan_loanNumber_key" ON "Loan"("loanNumber");

-- CreateIndex
CREATE INDEX "Loan_status_loanDate_idx" ON "Loan"("status", "loanDate");

-- CreateIndex
CREATE INDEX "Loan_customerId_idx" ON "Loan"("customerId");

-- CreateIndex
CREATE INDEX "LoanItem_loanId_idx" ON "LoanItem"("loanId");

-- CreateIndex
CREATE INDEX "LoanPayment_loanId_paidAt_idx" ON "LoanPayment"("loanId", "paidAt");

-- CreateIndex
CREATE INDEX "LoanMerchantPledge_loanId_idx" ON "LoanMerchantPledge"("loanId");

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanItem" ADD CONSTRAINT "LoanItem_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanPayment" ADD CONSTRAINT "LoanPayment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanMerchantPledge" ADD CONSTRAINT "LoanMerchantPledge_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
