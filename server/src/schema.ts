import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const meals = sqliteTable("meals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  calories: integer("calories").notNull(),
  protein: real("protein"),
  fat: real("fat"),
  carbs: real("carbs"),
  mealType: text("meal_type", { enum: ["breakfast", "lunch", "dinner", "snack"] }).notNull().default("lunch"),
  portion: real("portion").notNull().default(1), // 1食分=1、半分=0.5、1/4=0.25、3/4=0.75、自由入力0.1〜0.9
  date: text("date").notNull(), // YYYY-MM-DD
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  dailyGoal: integer("daily_goal").notNull().default(2000),
});

export const weightLogs = sqliteTable("weight_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  weight: real("weight").notNull(),
  date: text("date").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const masterFoods = sqliteTable("master_foods", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull().unique(),
  canonicalKey: text("canonical_key").notNull(),
  calories: integer("calories").notNull(),
  protein: real("protein"),
  fat: real("fat"),
  carbs: real("carbs"),
  lastMealType: text("last_meal_type", { enum: ["breakfast", "lunch", "dinner", "snack"] }).notNull().default("lunch"),
  useCount: integer("use_count").notNull().default(1),
  lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});
