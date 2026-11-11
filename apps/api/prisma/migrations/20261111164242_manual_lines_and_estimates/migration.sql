-- CreateEnum
CREATE TYPE "BillType" AS ENUM ('TAX_INVOICE', 'ESTIMATE');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "billType" "BillType" NOT NULL DEFAULT 'TAX_INVOICE';

-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "description" TEXT,
ADD COLUMN     "purity" "Purity",
ALTER COLUMN "itemId" DROP NOT NULL;
