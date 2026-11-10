CREATE TABLE `master_foods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`canonical_key` text NOT NULL,
	`calories` integer NOT NULL,
	`protein` real,
	`fat` real,
	`carbs` real,
	`last_meal_type` text DEFAULT 'lunch' NOT NULL,
	`use_count` integer DEFAULT 1 NOT NULL,
	`last_used_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `master_foods_normalized_name_unique` ON `master_foods` (`normalized_name`);
--> statement-breakpoint
CREATE INDEX `master_foods_canonical_idx` ON `master_foods` (`canonical_key`);
--> statement-breakpoint
CREATE INDEX `meals_date_idx` ON `meals` (`date`);
--> statement-breakpoint
CREATE INDEX `meals_type_date_idx` ON `meals` (`meal_type`, `date`);
