CREATE TABLE `authors` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`full_name` text,
	`avatar_url` text,
	`avatar_path` text
);
--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`media_count` integer,
	`backfill_complete` integer DEFAULT false NOT NULL,
	`last_seen_run_id` integer
);
--> statement-breakpoint
CREATE TABLE `post_collections` (
	`post_id` text NOT NULL,
	`collection_id` text NOT NULL,
	`first_seen_run_id` integer NOT NULL,
	PRIMARY KEY(`post_id`, `collection_id`),
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `post_collections_coll_idx` ON `post_collections` (`collection_id`);--> statement-breakpoint
CREATE TABLE `post_parts` (
	`post_id` text NOT NULL,
	`idx` integer NOT NULL,
	`kind` text NOT NULL,
	`image_url` text,
	`video_url` text,
	`width` integer,
	`height` integer,
	`accessibility_caption` text,
	PRIMARY KEY(`post_id`, `idx`),
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`kind` text NOT NULL,
	`product_type` text,
	`author_id` text NOT NULL,
	`caption` text,
	`hashtags` text NOT NULL,
	`mentions` text NOT NULL,
	`taken_at` integer NOT NULL,
	`thumbnail_url` text,
	`thumb_path` text,
	`video_url` text,
	`video_url_expires_at` integer,
	`duration_sec` real,
	`like_count` integer,
	`view_count` integer,
	`comment_count` integer,
	`accessibility_caption` text,
	`location_name` text,
	`music_title` text,
	`music_artist` text,
	`width` integer,
	`height` integer,
	`sort_key` integer NOT NULL,
	`first_seen_run_id` integer NOT NULL,
	`last_seen_run_id` integer NOT NULL,
	`removed_at` integer,
	`removed_remotely_at` integer,
	FOREIGN KEY (`author_id`) REFERENCES `authors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `posts_sort_idx` ON `posts` (`sort_key`);--> statement-breakpoint
CREATE INDEX `posts_author_idx` ON `posts` (`author_id`);--> statement-breakpoint
CREATE INDEX `posts_kind_idx` ON `posts` (`kind`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mode` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`base_key` integer NOT NULL,
	`next_pos` integer DEFAULT 0 NOT NULL,
	`pages` integer DEFAULT 0 NOT NULL,
	`posts_seen` integer DEFAULT 0 NOT NULL,
	`posts_new` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`error_message` text
);
