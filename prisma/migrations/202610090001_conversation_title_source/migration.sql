ALTER TABLE "Conversation" ADD COLUMN "titleSource" TEXT NOT NULL DEFAULT 'DEFAULT';
-- Preserve existing named conversations; we cannot safely infer who named them.
UPDATE "Conversation" SET "titleSource" = 'CUSTOM' WHERE "title" <> '새 대화';
