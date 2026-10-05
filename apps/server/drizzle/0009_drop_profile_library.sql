-- The first version kept whole profiles. Posts that were only there (not saved, no report) leave with it.
DELETE FROM `posts` WHERE `id` IN (SELECT `post_id` FROM `profile_posts`)
  AND `id` NOT IN (SELECT `post_id` FROM `saved_posts`)
  AND `id` NOT IN (SELECT `post_id` FROM `reports`);--> statement-breakpoint
DELETE FROM `post_search` WHERE `post_id` NOT IN (SELECT `id` FROM `posts`);--> statement-breakpoint
DROP TABLE `load_runs`;--> statement-breakpoint
DROP TABLE `profile_posts`;--> statement-breakpoint
DROP TABLE `profiles`;