ALTER TABLE `sync_runs` ADD `posts_removed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `warning` text;