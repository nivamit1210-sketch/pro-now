-- AlterTable
ALTER TABLE "professional_profiles" ADD COLUMN     "shopBrandColor" TEXT,
ADD COLUMN     "shopLogoUploadId" TEXT,
ADD COLUMN     "shopName" TEXT;

-- AddForeignKey
ALTER TABLE "professional_profiles" ADD CONSTRAINT "professional_profiles_shopLogoUploadId_fkey" FOREIGN KEY ("shopLogoUploadId") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

