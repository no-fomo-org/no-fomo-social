ALTER TABLE `sync_runs` ADD `posts_skipped` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `end_confirmed` integer DEFAULT false NOT NULL;