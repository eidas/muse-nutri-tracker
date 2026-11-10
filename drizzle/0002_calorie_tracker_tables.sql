DROP TABLE IF EXISTS entries;
--> statement-breakpoint
CREATE TABLE meals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  calories INTEGER NOT NULL,
  protein REAL,
  fat REAL,
  carbs REAL,
  meal_type TEXT NOT NULL DEFAULT 'lunch',
  date TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE settings (
  id INTEGER PRIMARY KEY,
  daily_goal INTEGER NOT NULL DEFAULT 2000
);
--> statement-breakpoint
CREATE TABLE weight_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  weight REAL NOT NULL,
  date TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
INSERT INTO settings (id, daily_goal) VALUES (1, 2000);
