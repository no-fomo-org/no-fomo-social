CREATE TABLE `following` (
	`author_id` text PRIMARY KEY NOT NULL,
	`position` integer NOT NULL,
	`last_seen_run_id` integer NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `authors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `following_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`active_at` integer NOT NULL,
	`finished_at` integer,
	`pages` integer DEFAULT 0 NOT NULL,
	`items` integer DEFAULT 0 NOT NULL,
	`next_pos` integer DEFAULT 0 NOT NULL,
	`complete` integer DEFAULT false NOT NULL,
	`error_code` text,
	`error_message` text
);
--> statement-breakpoint
CREATE TABLE `saved_posts` (
	`post_id` text PRIMARY KEY NOT NULL,
	`sort_key` integer NOT NULL,
	`first_seen_run_id` integer NOT NULL,
	`last_seen_run_id` integer NOT NULL,
	`removed_at` integer,
	`removed_remotely_at` integer,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `saved_posts_sort_idx` ON `saved_posts` (`sort_key`);--> statement-breakpoint
-- Every post stored before this version came from the saved feed.
INSERT INTO `saved_posts` (`post_id`, `sort_key`, `first_seen_run_id`, `last_seen_run_id`, `removed_at`, `removed_remotely_at`)
SELECT `id`, `sort_key`, `first_seen_run_id`, `last_seen_run_id`, `removed_at`, `removed_remotely_at` FROM `posts`;--> statement-breakpoint
DROP INDEX `posts_sort_idx`;--> statement-breakpoint
CREATE INDEX `posts_taken_idx` ON `posts` (`taken_at`);--> statement-breakpoint
ALTER TABLE `posts` DROP COLUMN `sort_key`;--> statement-breakpoint
ALTER TABLE `posts` DROP COLUMN `first_seen_run_id`;--> statement-breakpoint
ALTER TABLE `posts` DROP COLUMN `last_seen_run_id`;--> statement-breakpoint
ALTER TABLE `posts` DROP COLUMN `removed_at`;--> statement-breakpoint
ALTER TABLE `posts` DROP COLUMN `removed_remotely_at`;