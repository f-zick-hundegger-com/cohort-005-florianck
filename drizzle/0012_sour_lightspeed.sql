CREATE TABLE `refund_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`refund_id` integer NOT NULL,
	`provider` text NOT NULL,
	`provider_reference` text,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`confirmed_at` text,
	FOREIGN KEY (`refund_id`) REFERENCES `refunds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `refund_payments_idempotency_key_unique` ON `refund_payments` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `refund_payments_refund_idx` ON `refund_payments` (`refund_id`);--> statement-breakpoint
ALTER TABLE `refunds` ADD `paid_at` text;