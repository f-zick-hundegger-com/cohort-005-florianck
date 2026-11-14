ALTER TABLE `refunds` ADD `decline_reason` text;--> statement-breakpoint
ALTER TABLE `refunds` ADD `last_day_in_window_at_request` text;--> statement-breakpoint
ALTER TABLE `refunds` ADD `seconds_watched_at_request` integer;--> statement-breakpoint
ALTER TABLE `refunds` ADD `completion_at_request` real;