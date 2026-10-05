-- Full-text index over what users remember about a post. Kept up to date by sync ingest.
CREATE VIRTUAL TABLE `post_search` USING fts5(`post_id` UNINDEXED, `body`, tokenize = 'unicode61 remove_diacritics 2');
--> statement-breakpoint
INSERT INTO `post_search` (`post_id`, `body`)
SELECT p.`id`,
  coalesce(a.`username`, '') || ' ' || coalesce(a.`full_name`, '') || ' ' || coalesce(p.`caption`, '') || ' ' ||
  coalesce(p.`music_title`, '') || ' ' || coalesce(p.`music_artist`, '') || ' ' || coalesce(p.`location_name`, '') || ' ' ||
  coalesce(p.`accessibility_caption`, '')
FROM `posts` p JOIN `authors` a ON a.`id` = p.`author_id`;
