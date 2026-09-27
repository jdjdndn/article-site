ALTER TABLE `articles` ADD `template` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE `articles` ADD `needs_review` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `articles` ADD `publish_at` text;