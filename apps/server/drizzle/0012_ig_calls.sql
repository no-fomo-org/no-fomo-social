CREATE TABLE `ig_calls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`kind` text NOT NULL,
	`status` integer NOT NULL,
	`result` text NOT NULL,
	`ms` integer NOT NULL
);
