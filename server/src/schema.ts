import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const meals = sqliteTable("meals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  calories: integer("calories").notNull(),
  protein: real("protein"),
  fat: real("fat"),
  carbs: real("carbs"),
  mealType: text("meal_type", { enum: ["breakfast", "lunch", "dinner", "snack"] }).notNull().default("lunch"),
  portion: real("portion").notNull().default(1), // 1食分=1、半分=0.5。スライダー（0.1〜2.0）と整数分の追加（＋/−）を組み合わせて0.1〜10まで指定可
  salt: real("salt"), // 食塩相当量（g、1食分あたりを割合で換算した実際に記録された量）。不明な場合は null
  nutritionEstimated: integer("nutrition_estimated").notNull().default(0), // カロリー・PFCが推定値かどうか（1=推定）
  saltEstimated: integer("salt_estimated").notNull().default(0), // 食塩相当量が成分からの推定値かどうか（1=推定）。カロリー・PFCの推定フラグとは独立
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
  salt: real("salt"), // 食塩相当量（g、1食分）。不明な場合は null
  nutritionEstimated: integer("nutrition_estimated").notNull().default(0), // カロリー・PFCが推定値かどうか（1=推定）
  saltEstimated: integer("salt_estimated").notNull().default(0), // 食塩相当量が推定値かどうか（1=推定）
  lastMealType: text("last_meal_type", { enum: ["breakfast", "lunch", "dinner", "snack"] }).notNull().default("lunch"),
  useCount: integer("use_count").notNull().default(1),
  lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});
