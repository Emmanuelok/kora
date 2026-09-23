CREATE TABLE `basket` (
	`owner` text NOT NULL,
	`product` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`owner`, `product`)
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`owner` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `requests` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`kind` text NOT NULL,
	`data` text NOT NULL,
	`status` text DEFAULT 'Request received' NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `requests_owner_created` ON `requests` (`owner`,`created`);--> statement-breakpoint
CREATE TABLE `saved` (
	`owner` text NOT NULL,
	`product` text NOT NULL,
	PRIMARY KEY(`owner`, `product`)
);
