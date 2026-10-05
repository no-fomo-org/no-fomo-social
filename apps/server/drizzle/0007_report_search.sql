-- Full-text index over finished reports, so search finds words spoken or shown in a post. Written by the analyzer.
CREATE VIRTUAL TABLE `report_search` USING fts5(`post_id` UNINDEXED, `body`, tokenize = 'unicode61 remove_diacritics 2');
