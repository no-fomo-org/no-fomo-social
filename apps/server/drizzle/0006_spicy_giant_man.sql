CREATE TABLE `reports` (
	`post_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`step` text,
	`markdown` text,
	`language` text NOT NULL,
	`report_model` text NOT NULL,
	`transcribe_model` text,
	`frame_count` integer,
	`error_code` text,
	`error_message` text,
	`created_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
