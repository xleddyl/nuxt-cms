CREATE TABLE `pages` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`title` text,
	`cover` text,
	`intro` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pages_path_unique` ON `pages` (`path`);