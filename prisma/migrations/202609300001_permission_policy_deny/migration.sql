-- Replace the ambiguous ALWAYS_ASK option with an explicit DENY option.
-- Existing ALWAYS_ASK preferences keep their previous behavior by migrating to ASK.
CREATE TYPE "PermissionPolicy_new" AS ENUM ('DENY', 'ASK', 'ALWAYS_ALLOW');

ALTER TABLE "Permission"
ALTER COLUMN "policy" TYPE "PermissionPolicy_new"
USING (
  CASE
    WHEN "policy"::text = 'ALWAYS_ASK' THEN 'ASK'
    ELSE "policy"::text
  END
)::"PermissionPolicy_new";

DROP TYPE "PermissionPolicy";
ALTER TYPE "PermissionPolicy_new" RENAME TO "PermissionPolicy";
