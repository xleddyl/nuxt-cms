CREATE TABLE `pages_fields` (
	`page_id` text NOT NULL,
	`key` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`page_id`, `key`, `position`),
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `pages_media` (
	`page_id` text NOT NULL,
	`key` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`media_key` text NOT NULL,
	PRIMARY KEY(`page_id`, `key`, `position`),
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `pages_fields` (`page_id`, `key`, `position`, `value`) SELECT `id`, 'title', 0, `title` FROM `pages` WHERE `title` IS NOT NULL;--> statement-breakpoint
INSERT INTO `pages_fields` (`page_id`, `key`, `position`, `value`) SELECT `id`, 'intro', 0, `intro` FROM `pages` WHERE `intro` IS NOT NULL;--> statement-breakpoint
INSERT INTO `pages_media` (`page_id`, `key`, `position`, `media_key`) SELECT `id`, 'cover', 0, `cover` FROM `pages` WHERE `cover` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `pages` DROP COLUMN `title`;--> statement-breakpoint
ALTER TABLE `pages` DROP COLUMN `cover`;--> statement-breakpoint
ALTER TABLE `pages` DROP COLUMN `intro`;