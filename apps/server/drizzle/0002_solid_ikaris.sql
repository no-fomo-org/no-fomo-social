PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_collections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`media_count` integer,
	`backfill_complete` integer DEFAULT false NOT NULL,
	`last_seen_run_id` integer
);
--> statement-breakpoint
INSERT INTO `__new_collections`("id", "name", "media_count", "backfill_complete", "last_seen_run_id") SELECT "id", "name", "media_count", "backfill_complete", "last_seen_run_id" FROM `collections`;--> statement-breakpoint
DROP TABLE `collections`;--> statement-breakpoint
ALTER TABLE `__new_collections` RENAME TO `collections`;--> statement-breakpoint
PRAGMA foreign_keys=ON;