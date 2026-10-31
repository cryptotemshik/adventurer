CREATE TABLE `address_pool` (
	`idx` integer PRIMARY KEY NOT NULL,
	`sol_vault` text NOT NULL,
	`hl_account` text NOT NULL,
	`hl_agent` text NOT NULL,
	`used` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `admin_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`wallet` text NOT NULL,
	`action` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `alerts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`market_id` text,
	`level` text NOT NULL,
	`message` text NOT NULL,
	`resolved` integer DEFAULT false NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `alerts_open` ON `alerts` (`resolved`,`at`);--> statement-breakpoint
CREATE TABLE `balance_cache` (
	`wallet` text NOT NULL,
	`mint` text NOT NULL,
	`balance` text NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`wallet`, `mint`)
);
--> statement-breakpoint
CREATE TABLE `equity_snapshots` (
	`market_id` text NOT NULL,
	`at` integer NOT NULL,
	`equity_usd` text NOT NULL,
	`upnl_usd` text NOT NULL,
	PRIMARY KEY(`market_id`, `at`)
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`market_id` text,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`txid` text,
	`chain` text,
	`amount` text,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_market` ON `events` (`market_id`,`at`);--> statement-breakpoint
CREATE INDEX `events_at` ON `events` (`at`);--> statement-breakpoint
CREATE INDEX `events_type` ON `events` (`type`);--> statement-breakpoint
CREATE TABLE `job_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`ok` integer,
	`summary` text DEFAULT '' NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `job_runs_job` ON `job_runs` (`job`,`started_at`);--> statement-breakpoint
CREATE TABLE `ledger` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`market_id` text NOT NULL,
	`type` text NOT NULL,
	`amount` text NOT NULL,
	`asset` text NOT NULL,
	`txid` text,
	`op_id` text,
	`note` text,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ledger_market` ON `ledger` (`market_id`,`type`);--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_op` ON `ledger` (`op_id`,`type`);--> statement-breakpoint
CREATE TABLE `locks` (
	`name` text PRIMARY KEY NOT NULL,
	`holder` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `markets` (
	`id` text PRIMARY KEY NOT NULL,
	`idx` integer NOT NULL,
	`mint` text,
	`name` text NOT NULL,
	`ticker` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`image` text DEFAULT '' NOT NULL,
	`metadata_uri` text DEFAULT '' NOT NULL,
	`socials` text DEFAULT '{}' NOT NULL,
	`launcher` text NOT NULL,
	`payout_wallet` text NOT NULL,
	`sol_vault` text NOT NULL,
	`hl_account` text NOT NULL,
	`hl_agent` text NOT NULL,
	`agent_approved` integer DEFAULT false NOT NULL,
	`strategy` text NOT NULL,
	`community` integer DEFAULT false NOT NULL,
	`flagship` integer DEFAULT false NOT NULL,
	`desk_badge` integer DEFAULT false NOT NULL,
	`featured_until` integer,
	`status` text DEFAULT 'pending_launch' NOT NULL,
	`direction` text DEFAULT 'long' NOT NULL,
	`paused` integer DEFAULT false NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`tp_stages` text DEFAULT '{}' NOT NULL,
	`consecutive_stops` integer DEFAULT 0 NOT NULL,
	`cooldown_until` integer,
	`stopped_at` integer,
	`last_flip_at` integer,
	`last_add_at` integer,
	`last_fee_at` integer,
	`last_claim_at` integer,
	`last_payout_at` integer,
	`last_fill_at` integer,
	`ended_at` integer,
	`end_reason` text,
	`launch_sig` text,
	`created_at` integer NOT NULL,
	`equity_usd` text DEFAULT '0' NOT NULL,
	`upnl_usd` text DEFAULT '0' NOT NULL,
	`notional_usd` text DEFAULT '0' NOT NULL,
	`realized_pnl_usd` text DEFAULT '0' NOT NULL,
	`profit_taken_usd` text DEFAULT '0' NOT NULL,
	`profit_queue_usd` text DEFAULT '0' NOT NULL,
	`deposited_usd` text DEFAULT '0' NOT NULL,
	`fees_claimed` text DEFAULT '0' NOT NULL,
	`fees_launcher` text DEFAULT '0' NOT NULL,
	`fees_platform` text DEFAULT '0' NOT NULL,
	`fees_position` text DEFAULT '0' NOT NULL,
	`pipeline_lamports` text DEFAULT '0' NOT NULL,
	`owed_launcher` text DEFAULT '0' NOT NULL,
	`owed_platform` text DEFAULT '0' NOT NULL,
	`in_transit_lamports` text DEFAULT '0' NOT NULL,
	`bought_back_lamports` text DEFAULT '0' NOT NULL,
	`burned_tokens` text DEFAULT '0' NOT NULL,
	`burned_pct` real DEFAULT 0 NOT NULL,
	`mcap_usd` real DEFAULT 0 NOT NULL,
	`price_usd` real DEFAULT 0 NOT NULL,
	`bonding_progress` real DEFAULT 0 NOT NULL,
	`graduated` integer DEFAULT false NOT NULL,
	`risk_to_sl` real,
	`risk_to_liq` real,
	`closest_tp` real,
	`respects` integer DEFAULT 0 NOT NULL,
	`recon_ok` integer DEFAULT true NOT NULL,
	`recon_json` text DEFAULT '[]' NOT NULL,
	`snapshot_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `markets_idx` ON `markets` (`idx`);--> statement-breakpoint
CREATE UNIQUE INDEX `markets_mint` ON `markets` (`mint`);--> statement-breakpoint
CREATE INDEX `markets_status` ON `markets` (`status`);--> statement-breakpoint
CREATE INDEX `markets_created` ON `markets` (`created_at`);--> statement-breakpoint
CREATE TABLE `nonces` (
	`nonce` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`used_at` integer
);
--> statement-breakpoint
CREATE TABLE `operations` (
	`id` text PRIMARY KEY NOT NULL,
	`market_id` text,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`txids` text DEFAULT '[]' NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `operations_status` ON `operations` (`status`,`type`);--> statement-breakpoint
CREATE TABLE `pending_launches` (
	`id` text PRIMARY KEY NOT NULL,
	`market_id` text NOT NULL,
	`wallet` text NOT NULL,
	`mint` text NOT NULL,
	`launch_fee_lamports` text NOT NULL,
	`input` text NOT NULL,
	`signature` text,
	`status` text DEFAULT 'prepared' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `platform_stats` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `positions` (
	`market_id` text PRIMARY KEY NOT NULL,
	`legs` text DEFAULT '[]' NOT NULL,
	`triggers` text DEFAULT '[]' NOT NULL,
	`marks` text DEFAULT '{}' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`window_start` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `respects_paid` (
	`key` text PRIMARY KEY NOT NULL,
	`market_id` text NOT NULL,
	`wallet` text NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`wallet` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tier_cache` (
	`wallet` text PRIMARY KEY NOT NULL,
	`balance` text NOT NULL,
	`tier` text NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vote_rounds` (
	`market_id` text NOT NULL,
	`round` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`long_w` real DEFAULT 0 NOT NULL,
	`short_w` real DEFAULT 0 NOT NULL,
	`flat_w` real DEFAULT 0 NOT NULL,
	`wallets` integer DEFAULT 0 NOT NULL,
	`quorum` integer DEFAULT false NOT NULL,
	`winner` text,
	`applied` integer DEFAULT false NOT NULL,
	`finalized_at` integer,
	PRIMARY KEY(`market_id`, `round`)
);
--> statement-breakpoint
CREATE TABLE `votes` (
	`market_id` text NOT NULL,
	`round` text NOT NULL,
	`wallet` text NOT NULL,
	`choice` text NOT NULL,
	`balance` text NOT NULL,
	`signature` text NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`market_id`, `round`, `wallet`)
);
