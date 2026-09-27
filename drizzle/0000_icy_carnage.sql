CREATE TABLE `articles` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`content` text NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`expires_at` text,
	`links` text DEFAULT '[]' NOT NULL,
	`friend_links` text DEFAULT '[]' NOT NULL,
	`related_ids` text DEFAULT '[]' NOT NULL,
	`faq` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_articles_category_status` ON `articles` (`category`,`status`);--> statement-breakpoint
CREATE INDEX `idx_articles_status_updated` ON `articles` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `favorites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`article_id` text NOT NULL,
	`device_fp` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_favorites_article_fp` ON `favorites` (`article_id`,`device_fp`);