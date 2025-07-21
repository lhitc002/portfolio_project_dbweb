-- 1. Define variables
SET @db_name     = 'continuum_reader';
SET @user_name   = 'continuum_reader_app';
SET @user_host   = 'localhost';
SET @user_pass   = 'qwertyuiop';
SET @full_user   = CONCAT("'", @user_name, "'@'", @user_host, "'");

-- 2. Create the database
SET @create_db = CONCAT('CREATE DATABASE IF NOT EXISTS ', @db_name, ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;');
PREPARE stmt FROM @create_db;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. Create the service user (if not exists) and grant privileges
SET @create_user = CONCAT(
  'CREATE USER IF NOT EXISTS ', @full_user,
  ' IDENTIFIED BY "', @user_pass, '";'
);
PREPARE stmt FROM @create_user;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @grant_privs = CONCAT(
  'GRANT ALL PRIVILEGES ON ', @db_name, '.* TO ', @full_user, ';'
);
PREPARE stmt FROM @grant_privs;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4. Select the new database
USE continuum_reader;


-- 5. Create tables in dependency order

-- 5.1 Users
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50) NOT NULL UNIQUE,
  email         VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 5.2 Collections
CREATE TABLE IF NOT EXISTS collections (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(100) NOT NULL,
  description TEXT,
  user_id     INT NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 5.3 Stories
CREATE TABLE IF NOT EXISTS stories (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  title         VARCHAR(150) NOT NULL,
  synopsis      TEXT,
  user_id       INT NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 5.4 Chapters
CREATE TABLE IF NOT EXISTS chapters (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  story_id    INT NOT NULL,
  chapter_num INT NOT NULL,
  title       VARCHAR(150),
  content     LONGTEXT NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_story_chapter (story_id, chapter_num)
) ENGINE=InnoDB;

-- 5.5 Story‑Collection pivot (many‑to‑many)
CREATE TABLE IF NOT EXISTS story_collections (
  story_id      INT NOT NULL,
  collection_id INT NOT NULL,
  PRIMARY KEY (story_id, collection_id),
  FOREIGN KEY (story_id)      REFERENCES stories(id)     ON DELETE CASCADE,
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 5.6 Favorites (user bookmarks stories)
CREATE TABLE IF NOT EXISTS favorites (
  user_id   INT NOT NULL,
  story_id  INT NOT NULL,
  favorited_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, story_id),
  FOREIGN KEY (user_id)  REFERENCES users(id)   ON DELETE CASCADE,
  FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 5.7 Ratings (user ratings of stories)
CREATE TABLE IF NOT EXISTS ratings (
  user_id   INT  NOT NULL,
  story_id  INT  NOT NULL,
  rating    TINYINT UNSIGNED NOT NULL CHECK (rating BETWEEN 1 AND 5),
  rated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, story_id),
  FOREIGN KEY (user_id)  REFERENCES users(id)   ON DELETE CASCADE,
  FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 5.8 Comments (on chapters)
CREATE TABLE IF NOT EXISTS comments (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NOT NULL,
  chapter_id   INT NOT NULL,
  parent_id    INT DEFAULT NULL,
  content      TEXT NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id)  REFERENCES comments(id) ON DELETE CASCADE
) ENGINE=InnoDB;
