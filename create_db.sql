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
  vanity        VARCHAR(200) NOT NULL DEFAULT '',
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


-- 6 Create Views

-- 6.1 Story Summary (ratings, comments, chapters all joined in one table)
CREATE OR REPLACE VIEW story_summary AS
SELECT
  s.id,
  s.user_id,
  u.username,
  s.title,
  s.synopsis,
  s.created_at,
  s.updated_at,
  COUNT(DISTINCT c.id)     AS chapter_count,
  AVG(r.rating)            AS avg_rating,
  COUNT(DISTINCT r.user_id) AS rating_count
FROM stories AS s
  JOIN users    AS u ON s.user_id = u.id
  LEFT JOIN chapters AS c ON c.story_id = s.id
  LEFT JOIN ratings  AS r ON r.story_id  = s.id
GROUP BY s.id;

-- 6.2 Chapter Comments (user details with comments)
CREATE VIEW comments_with_users AS
SELECT 
    c.*,
    u.username
FROM comments c
JOIN users u ON c.user_id = u.id
ORDER BY c.created_at ASC;

-- 7 Create Procedures and Triggers

-- 7.1 Generate Vanity URL Procedure
DELIMITER $$

DROP PROCEDURE IF EXISTS `generate_vanity`$$
CREATE PROCEDURE `generate_vanity`(IN input_title VARCHAR(150), OUT output_vanity VARCHAR(200))
BEGIN
  DECLARE cleaned_title VARCHAR(200);
  DECLARE word VARCHAR(100);
  DECLARE result VARCHAR(200) DEFAULT '';
  DECLARE i INT DEFAULT 1;
  DECLARE count INT;

  -- Basic sanitize and normalize spaces
  SET cleaned_title = TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(input_title, '&', ''), '<', ''), '>', ''), '"', ''), '''', ''));
  WHILE INSTR(cleaned_title, '  ') > 0 DO
    SET cleaned_title = REPLACE(cleaned_title, '  ', ' ');
  END WHILE;

  SET count = 1 + LENGTH(cleaned_title) - LENGTH(REPLACE(cleaned_title, ' ', ''));

  WHILE i <= count DO
    SET word = SUBSTRING_INDEX(SUBSTRING_INDEX(cleaned_title, ' ', i), ' ', -1);
    SET word = CONCAT(UPPER(LEFT(word,1)), LOWER(SUBSTRING(word,2)));
    IF i = 1 THEN
      SET result = word;
    ELSE
      SET result = CONCAT(result, '-', word);
    END IF;
    SET i = i + 1;
  END WHILE;

  SET output_vanity = result;
END$$

DELIMITER ;

-- 7.2 STORIES Insert Trigger for vanity
DELIMITER $$

CREATE TRIGGER `before_stories_insert`
BEFORE INSERT ON `stories`
FOR EACH ROW
BEGIN
  DECLARE v VARCHAR(200);
  CALL generate_vanity(NEW.title, v);
  SET NEW.vanity = v;
END$$

DELIMITER ;

-- 7.2 STORIES Update Trigger for vanity
DELIMITER $$

CREATE TRIGGER `before_stories_update`
BEFORE UPDATE ON `stories`
FOR EACH ROW
BEGIN
  DECLARE v VARCHAR(200);
  IF NEW.title <> OLD.title THEN
    CALL generate_vanity(NEW.title, v);
    SET NEW.vanity = v;
  END IF;
END$$

DELIMITER ;
