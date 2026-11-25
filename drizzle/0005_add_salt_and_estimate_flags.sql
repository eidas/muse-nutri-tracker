ALTER TABLE `meals` ADD COLUMN `salt` real;
--> statement-breakpoint
ALTER TABLE `meals` ADD COLUMN `nutrition_estimated` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `meals` ADD COLUMN `salt_estimated` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `master_foods` ADD COLUMN `salt` real;
--> statement-breakpoint
ALTER TABLE `master_foods` ADD COLUMN `nutrition_estimated` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `master_foods` ADD COLUMN `salt_estimated` integer DEFAULT 0 NOT NULL;
