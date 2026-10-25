ALTER TABLE "SupplierPortalPerson" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "SupplierPortalPerson" ADD COLUMN IF NOT EXISTS "phone" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierPortalPerson_phone_key" ON "SupplierPortalPerson"("phone");
DO $$ BEGIN
  ALTER TABLE "SupplierPortalPerson" ADD CONSTRAINT "SupplierPortalPerson_identity_check" CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
