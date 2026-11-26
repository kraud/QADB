CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`user_id` text NOT NULL,
	`correct` integer NOT NULL,
	`answered_at` integer DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000) NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`question` text NOT NULL,
	`answer_summary` text NOT NULL,
	`difficulty` text NOT NULL,
	`importance` text NOT NULL,
	`category` text NOT NULL,
	`link` text,
	`mastered` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000) NOT NULL
);
CREATE INDEX `attempts_question_answered_idx` ON `attempts` (`question_id`,`answered_at`);
CREATE INDEX `attempts_user_answered_idx` ON `attempts` (`user_id`,`answered_at`);
CREATE INDEX `questions_user_id_idx` ON `questions` (`user_id`);
CREATE INDEX `questions_user_difficulty_idx` ON `questions` (`user_id`,`difficulty`);
CREATE INDEX `questions_user_importance_idx` ON `questions` (`user_id`,`importance`);
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);
