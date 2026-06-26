-- CreateTable
CREATE TABLE `match_details` (
    `game_id` VARCHAR(32) NOT NULL,
    `api_season_id` INTEGER NULL,
    `display_season_id` INTEGER NULL,
    `game_mode` VARCHAR(24) NOT NULL,
    `matching_mode` INTEGER NULL,
    `matching_team_mode` INTEGER NULL,
    `played_at` DATETIME(3) NOT NULL,
    `duration_seconds` INTEGER NULL,
    `raw_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `match_detail_played_at_idx`(`played_at` DESC),
    PRIMARY KEY (`game_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `match_participants` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `game_id` VARCHAR(32) NOT NULL,
    `uid` VARCHAR(128) NULL,
    `nickname` VARCHAR(64) NULL,
    `team_number` INTEGER NULL,
    `team_rank` INTEGER NULL,
    `placement` INTEGER NULL,
    `character_num` INTEGER NOT NULL,
    `character_name` VARCHAR(64) NULL,
    `skin_code` INTEGER NULL,
    `account_level` INTEGER NULL,
    `character_level` INTEGER NULL,
    `kills` INTEGER NULL,
    `deaths` INTEGER NULL,
    `assists` INTEGER NULL,
    `team_kills` INTEGER NULL,
    `damage_to_player` INTEGER NULL,
    `damage_to_monster` INTEGER NULL,
    `damage_taken` INTEGER NULL,
    `credit` INTEGER NULL,
    `rp_after` INTEGER NULL,
    `rp_delta` INTEGER NULL,
    `best_weapon` INTEGER NULL,
    `tactical_skill_group` INTEGER NULL,
    `trait_first_core` INTEGER NULL,
    `trait_first_sub` JSON NULL,
    `trait_second_sub` JSON NULL,
    `equipment` JSON NULL,
    `equipment_grade` JSON NULL,
    `cobalt_infusions` JSON NULL,
    `raw_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `match_participant_game_team_idx`(`game_id`, `team_number`),
    INDEX `match_participant_game_placement_idx`(`game_id`, `placement`),
    INDEX `match_participant_uid_game_idx`(`uid`, `game_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `match_participants` ADD CONSTRAINT `match_participants_game_id_fkey` FOREIGN KEY (`game_id`) REFERENCES `match_details`(`game_id`) ON DELETE CASCADE ON UPDATE CASCADE;
