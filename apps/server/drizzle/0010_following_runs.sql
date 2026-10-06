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
