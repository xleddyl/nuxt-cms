CREATE TABLE `authors` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`avatar` text,
	`bio` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `blog` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`published_at` text,
	`excerpt` text,
	`cover` text,
	`author` text NOT NULL,
	`reading_time` integer,
	`body` text,
	`seo_title` text,
	`seo_description` text,
	`seo_image` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`author`) REFERENCES `authors`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blog_slug_unique` ON `blog` (`slug`);--> statement-breakpoint
CREATE TABLE `blog_tags` (
	`source_id` text NOT NULL,
	`target_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`source_id`, `target_id`),
	FOREIGN KEY (`source_id`) REFERENCES `blog`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `categories` ADD `parent` text REFERENCES categories(id);--> statement-breakpoint
ALTER TABLE `events` ADD `doors_open` text;--> statement-breakpoint
ALTER TABLE `events` ADD `sponsor` text;--> statement-breakpoint
ALTER TABLE `events` ADD `report` text REFERENCES blog(id);--> statement-breakpoint
CREATE UNIQUE INDEX `events_report_unique` ON `events` (`report`);--> statement-breakpoint
ALTER TABLE `pages` ADD `title` text;