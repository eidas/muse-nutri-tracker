import { defineAction, z, type ActionsModule, type Ctx } from "@hatch/space-sdk";
import { asc, desc, eq, gte } from "drizzle-orm";
import * as schema from "./schema";

const mealTypeEnum = z.enum(["breakfast", "lunch", "dinner", "snack"]);
type MealType = z.infer<typeof mealTypeEnum>;
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const mealObj = z.object({
id: z.number(),
name: z.string(),
calories: z.number(),
protein: z.number().nullable(),
fat: z.number().nullable(),
carbs: z.number().nullable(),
mealType: mealTypeEnum,
portion: z.number(),
date: z.string(),
created_at: z.string(),
});

const portionSchema = z.number().min(0.1).max(1);

function scaleCalories(base: number, portion: number): number {
return Math.round(base * portion);
}
function scaleMacro(v: number | null | undefined, portion: number): number | null {
if (v == null) return null;
return Math.round(v * portion * 10) / 10;
}
function unscaleCalories(scaled: number, portion: number): number {
if (!portion || portion === 1) return scaled;
return Math.round(scaled / portion);
}
function unscaleMacro(v: number | null, portion: number): number | null {
if (v == null || !portion || portion === 1) return v;
return Math.round((v / portion) * 10) / 10;
}

const masterObj = z.object({
id: z.number(),
name: z.string(),
calories: z.number(),
protein: z.number().nullable(),
fat: z.number().nullable(),
carbs: z.number().nullable(),
lastMealType: mealTypeEnum,
useCount: z.number(),
lastUsedAt: z.string(),
});

// ---------- 名前の正規化と重複判定 ----------
// 完全重複: 正規化名（NFKC・小文字化・空白/記号除去・末尾の数量表現除去）が一致。
// 重複と思われるもの: 数量や単位を除いた「基幹キー」が一致、または一方が他方を含み
// カロリー差が小さい（同一食品の表記ゆれ・分量違いとみなす）。
function normalizeName(raw: string): string {
return raw
.normalize("NFKC")
.toLowerCase()
.replace(/[\s　]+/g, "")
.replace(/[・,、。．!！?？:：;；/／\\|｜\-ー―~〜'’"”「」『』〔〕]/g, "");
}

const QTY_SUFFIX = /(（[^）]*）|\([^)]*\))$/;
const QTY_TOKEN = /[0-9]+(?:\.[0-9]+)?\s*(?:g|kg|ml|l|グラム|キロ|個|枚|本|杯|皿|玉|食|人前|切れ|パック|缶|袋|箱|粒|かけ)?/g;

function stripQuantity(s: string): string {
let out = s;
let prev = "";
while (out!== prev) {
prev = out;
out = out.replace(QTY_SUFFIX, "");
}
return out.replace(QTY_TOKEN, "").trim();
}

function canonicalKey(normalized: string): string {
return stripQuantity(normalized);
}

function levenshtein(a: string, b: string): number {
if (a === b) return 0;
if (a.length === 0) return b.length;
if (b.length === 0) return a.length;
let prevRow = Array.from({ length: b.length + 1}, (_, i) => i);
for (let i = 1; i <= a.length; i++) {
const cur = [i];
for (let j = 1; j <= b.length; j++) {
cur.push(Math.min(
(prevRow[j]?? 0) + 1,
(cur[j - 1]?? 0) + 1,
(prevRow[j - 1]?? 0) + (a[i - 1] === b[j - 1]? 0: 1),
));
}
prevRow = cur;
}
return prevRow[b.length]?? 0;
}

type MasterCandidate = {
name: string;
calories: number;
protein: number | null;
fat: number | null;
carbs: number | null;
mealType: MealType;
};

// 既存マスター群に対して重複（完全／類似）かどうかを判定する。
// 戻り値: 一致した既存マスターの id。なければ null（新規登録可）。
function findDuplicateId(
existing: { id: number; normalizedName: string; canonicalKey: string; calories: number}[],
normalized: string,
canonical: string,
calories: number,
): number | null {
for (const m of existing) {
if (m.normalizedName === normalized) return m.id; // 完全重複
}
for (const m of existing) {
// 基幹キー一致（数量・単位だけが違う表記ゆれ）
if (canonical.length >= 2 && m.canonicalKey === canonical) return m.id;
// 一方が他方を含む（例: 「ごはん」 vs 「ごはん大盛り」系）かつカロリーが近い
if (normalized.length >= 2 && m.normalizedName.length >= 2) {
const contains = normalized.includes(m.normalizedName) || m.normalizedName.includes(normalized);
if (contains && Math.abs(m.calories - calories) <= Math.max(30, calories * 0.15)) return m.id;
}
// 編集距離が小さくカロリーも近い（誤字・表記ゆれ）
const maxLen = Math.max(normalized.length, m.normalizedName.length);
if (maxLen >= 4) {
const dist = levenshtein(normalized, m.normalizedName);
if (dist <= 1 && Math.abs(m.calories - calories) <= Math.max(30, calories * 0.15)) return m.id;
}
}
return null;
}

// 食事が追加・更新されたときにマスターへ登録（重複時は登録せず利用回数だけ更新）。
async function registerMaster(ctx: Ctx, cand: MasterCandidate) {
const db = ctx.db<typeof schema>();
const normalized = normalizeName(cand.name);
if (!normalized) return;
const canonical = canonicalKey(normalized);
const existing = await db.select({
id: schema.masterFoods.id,
normalizedName: schema.masterFoods.normalizedName,
canonicalKey: schema.masterFoods.canonicalKey,
calories: schema.masterFoods.calories,
}).from(schema.masterFoods);
const dupId = findDuplicateId(existing, normalized, canonical, cand.calories);
const now = new Date();
if (dupId!= null) {
const row = await db.select().from(schema.masterFoods).where(eq(schema.masterFoods.id, dupId));
await db.update(schema.masterFoods).set({
useCount: (row[0]?.useCount?? 1) + 1,
lastUsedAt: now,
lastMealType: cand.mealType,
}).where(eq(schema.masterFoods.id, dupId));
return;
}
await db.insert(schema.masterFoods).values({
name: cand.name.trim(),
normalizedName: normalized,
canonicalKey: canonical,
calories: cand.calories,
protein: cand.protein,
fat: cand.fat,
carbs: cand.carbs,
lastMealType: cand.mealType,
useCount: 1,
lastUsedAt: now,
createdAt: now,
});
}

async function ensureSettings(ctx: Ctx) {
const db = ctx.db<typeof schema>();
const rows = await db.select().from(schema.settings).where(eq(schema.settings.id, 1));
if (rows.length === 0) {
await db.insert(schema.settings).values({ id: 1, dailyGoal: 2000});
return 2000;
}
return rows[0]!.dailyGoal;
}

function dateKey(d: Date) {
return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftKey(key: string, delta: number) {
const d = new Date(`${key}T12:00:00`);
d.setDate(d.getDate() + delta);
return dateKey(d);
}

type MealRow = typeof schema.meals.$inferSelect;

function toMeal(r: MealRow) {
return {
id: r.id, name: r.name, calories: r.calories,
protein: r.protein, fat: r.fat, carbs: r.carbs,
mealType: r.mealType as MealType,
portion: r.portion ?? 1,
date: r.date, created_at: r.createdAt.toISOString(),
};
}

const recentItem = z.object({
name: z.string(),
// calories / PFC は「1食分（割合1）」に換算した基準値。追加時に選んだ割合で換算し直す。
calories: z.number(),
protein: z.number().nullable(),
fat: z.number().nullable(),
carbs: z.number().nullable(),
lastPortion: z.number(),
lastDate: z.string(),
});

const bundleResponse = z.object({
date: z.string(),
dailyGoal: z.number(),
totalCalories: z.number(),
totalProtein: z.number(),
totalFat: z.number(),
totalCarbs: z.number(),
meals: z.array(mealObj),
days: z.array(z.object({ date: z.string(), total: z.number(), count: z.number()})),
weights: z.array(z.object({ id: z.number(), weight: z.number(), date: z.string()})),
recentByType: z.object({
breakfast: z.array(recentItem),
lunch: z.array(recentItem),
dinner: z.array(recentItem),
snack: z.array(recentItem),
}),
masters: z.array(masterObj),
});

export const Actions = {
// 画面表示に必要なデータを1回のリクエストでまとめて返す（高速化の要）。
getDayBundle: defineAction({
description: "指定日の食事・合計・直近14日の履歴・体重・時間帯別の直近履歴・マスター食品を一括で取得します。",
request: z.object({ date: dateStr}),
response: bundleResponse,
async handler(ctx, args): Promise<z.infer<typeof bundleResponse>> {
const db = ctx.db<typeof schema>();
const goal = await ensureSettings(ctx);
const from14 = shiftKey(args.date, -13);

const [dayRows, histRows, weightRows, masterRows, recentPool] = await Promise.all([
db.select().from(schema.meals).where(eq(schema.meals.date, args.date)).orderBy(asc(schema.meals.createdAt)),
db.select().from(schema.meals).where(gte(schema.meals.date, from14)).orderBy(desc(schema.meals.date)),
db.select().from(schema.weightLogs).orderBy(desc(schema.weightLogs.date), desc(schema.weightLogs.id)).limit(30),
db.select().from(schema.masterFoods).orderBy(desc(schema.masterFoods.useCount), desc(schema.masterFoods.lastUsedAt)).limit(100),
// 時間帯別の直近履歴: 対象日以前の記録を新しい順に多めに取り、メモリ上で区分ごとに直近3件へ絞る
db.select().from(schema.meals)
.where(gte(schema.meals.date, shiftKey(args.date, -90)))
.orderBy(desc(schema.meals.date), desc(schema.meals.id))
.limit(400),
]);

const meals = dayRows.map(toMeal);

const map = new Map<string, { total: number; count: number}>();
for (const r of histRows) {
if (r.date > args.date) continue;
const cur = map.get(r.date)?? { total: 0, count: 0};
cur.total += r.calories; cur.count += 1;
map.set(r.date, cur);
}
const days: { date: string; total: number; count: number}[] = [];
for (let i = 13; i >= 0; i--) {
const key = shiftKey(args.date, -i);
const v = map.get(key);
days.push({ date: key, total: v?.total?? 0, count: v?.count?? 0});
}

// 区分ごとに「同じ食品は最新1件だけ」にして直近3件
const recentByType: Record<MealType, z.infer<typeof recentItem>[]> = { breakfast: [], lunch: [], dinner: [], snack: []};
const seen = new Set<string>();
for (const r of recentPool) {
if (r.date > args.date) continue;
const t = r.mealType as MealType;
if (recentByType[t].length >= 3) continue;
const dedupeKey = `${t}:${normalizeName(r.name)}`;
if (seen.has(dedupeKey)) continue;
seen.add(dedupeKey);
recentByType[t].push({
name: r.name,
calories: unscaleCalories(r.calories, r.portion ?? 1),
protein: unscaleMacro(r.protein, r.portion ?? 1),
fat: unscaleMacro(r.fat, r.portion ?? 1),
carbs: unscaleMacro(r.carbs, r.portion ?? 1),
lastPortion: r.portion ?? 1,
lastDate: r.date,
});
}

return {
date: args.date,
dailyGoal: goal,
totalCalories: meals.reduce((s, m) => s + m.calories, 0),
totalProtein: Math.round(meals.reduce((s, m) => s + (m.protein?? 0), 0) * 10) / 10,
totalFat: Math.round(meals.reduce((s, m) => s + (m.fat?? 0), 0) * 10) / 10,
totalCarbs: Math.round(meals.reduce((s, m) => s + (m.carbs?? 0), 0) * 10) / 10,
meals,
days,
weights: weightRows.map(r => ({ id: r.id, weight: r.weight, date: r.date})),
recentByType,
masters: masterRows.map(r => ({
id: r.id, name: r.name, calories: r.calories,
protein: r.protein, fat: r.fat, carbs: r.carbs,
lastMealType: r.lastMealType as MealType,
useCount: r.useCount, lastUsedAt: r.lastUsedAt.toISOString(),
})),
};
},
}),

getDay: defineAction({
description: "指定した日の食事記録、合計カロリー、目標を取得します。",
request: z.object({ date: dateStr}),
response: z.object({
date: z.string(),
dailyGoal: z.number(),
totalCalories: z.number(),
totalProtein: z.number(),
totalFat: z.number(),
totalCarbs: z.number(),
meals: z.array(mealObj),
}),
async handler(ctx, args) {
const db = ctx.db<typeof schema>();
const goal = await ensureSettings(ctx);
const rows = await db.select().from(schema.meals).where(eq(schema.meals.date, args.date)).orderBy(asc(schema.meals.createdAt));
const meals = rows.map(toMeal);
return {
date: args.date,
dailyGoal: goal,
totalCalories: meals.reduce((s, m) => s + m.calories, 0),
totalProtein: Math.round(meals.reduce((s, m) => s + (m.protein?? 0), 0) * 10) / 10,
totalFat: Math.round(meals.reduce((s, m) => s + (m.fat?? 0), 0) * 10) / 10,
totalCarbs: Math.round(meals.reduce((s, m) => s + (m.carbs?? 0), 0) * 10) / 10,
meals,
};
},
}),

getHistory: defineAction({
description: "直近の日別カロリー履歴を取得します。",
request: z.object({ days: z.number().int().min(7).max(90).default(14)}),
response: z.object({
dailyGoal: z.number(),
days: z.array(z.object({ date: z.string(), total: z.number(), count: z.number()})),
}),
async handler(ctx, args) {
const db = ctx.db<typeof schema>();
const goal = await ensureSettings(ctx);
const now = new Date();
const from = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (args.days - 1)));
const rows = await db.select().from(schema.meals).where(gte(schema.meals.date, from));
const map = new Map<string, { total: number; count: number}>();
for (const r of rows) {
const cur = map.get(r.date)?? { total: 0, count: 0};
cur.total += r.calories; cur.count += 1;
map.set(r.date, cur);
}
const result: { date: string; total: number; count: number}[] = [];
for (let i = args.days - 1; i >= 0; i--) {
const d = new Date(now);
d.setDate(d.getDate() - i);
const key = dateKey(d);
const v = map.get(key);
result.push({ date: key, total: v?.total?? 0, count: v?.count?? 0});
}
return { dailyGoal: goal, days: result};
},
}),

// マスター＋過去履歴から入力補助候補を検索（入力のたびに軽く叩けるよう最小限の列だけ返す）
suggestFoods: defineAction({
description: "食品名の入力候補をマスターと過去履歴から検索します。",
request: z.object({ query: z.string().max(50), mealType: mealTypeEnum.optional()}),
response: z.object({
suggestions: z.array(z.object({
name: z.string(),
calories: z.number(),
protein: z.number().nullable(),
fat: z.number().nullable(),
carbs: z.number().nullable(),
source: z.enum(["master", "history"]),
})),
}),
async handler(ctx, args) {
const db = ctx.db<typeof schema>();
const q = normalizeName(args.query);
const masters = await db.select().from(schema.masterFoods)
.orderBy(desc(schema.masterFoods.useCount), desc(schema.masterFoods.lastUsedAt)).limit(100);
const out: { name: string; calories: number; protein: number | null; fat: number | null; carbs: number | null; source: "master" | "history"}[] = [];
const seenNames = new Set<string>();
for (const m of masters) {
if (args.mealType && m.lastMealType!== args.mealType && q === "") continue;
if (q &&!m.normalizedName.includes(q)) continue;
out.push({ name: m.name, calories: m.calories, protein: m.protein, fat: m.fat, carbs: m.carbs, source: "master"});
seenNames.add(m.normalizedName);
if (out.length >= 8) break;
}
if (out.length < 8 && q) {
const rows = await db.select().from(schema.meals).orderBy(desc(schema.meals.id)).limit(300);
for (const r of rows) {
const n = normalizeName(r.name);
if (!n.includes(q) || seenNames.has(n)) continue;
seenNames.add(n);
out.push({ name: r.name, calories: unscaleCalories(r.calories, r.portion ?? 1), protein: unscaleMacro(r.protein, r.portion ?? 1), fat: unscaleMacro(r.fat, r.portion ?? 1), carbs: unscaleMacro(r.carbs, r.portion ?? 1), source: "history"});
if (out.length >= 8) break;
}
}
return { suggestions: out};
},
}),

getMasters: defineAction({
description: "登録済みのマスター食品一覧を取得します。",
request: z.object({}),
response: z.object({ masters: z.array(masterObj)}),
async handler(ctx) {
const db = ctx.db<typeof schema>();
const rows = await db.select().from(schema.masterFoods)
.orderBy(desc(schema.masterFoods.useCount), desc(schema.masterFoods.lastUsedAt)).limit(200);
return {
masters: rows.map(r => ({
id: r.id, name: r.name, calories: r.calories,
protein: r.protein, fat: r.fat, carbs: r.carbs,
lastMealType: r.lastMealType as MealType,
useCount: r.useCount, lastUsedAt: r.lastUsedAt.toISOString(),
})),
};
},
}),

deleteMaster: defineAction({
description: "マスター食品を削除します。",
request: z.object({ id: z.number()}),
response: z.object({ ok: z.literal(true)}),
async handler(ctx, args): Promise<{ ok: true}> {
const db = ctx.db<typeof schema>();
await db.delete(schema.masterFoods).where(eq(schema.masterFoods.id, args.id));
ctx.invalidateQueries();
return { ok: true};
},
}),

addMeal: defineAction({
description: "食事を1件追加し、重複でなければマスター食品にも登録します。calories等は1食分の基準値で受け取り、portion（割合）で換算して記録します。マスターには基準値で登録します。",
request: z.object({
name: z.string().min(1).max(100),
calories: z.number().int().min(0).max(10000),
protein: z.number().min(0).max(1000).nullable().optional(),
fat: z.number().min(0).max(1000).nullable().optional(),
carbs: z.number().min(0).max(1000).nullable().optional(),
mealType: mealTypeEnum,
portion: portionSchema.optional(),
date: dateStr,
}),
response: z.object({ id: z.number()}),
async handler(ctx, args) {
const db = ctx.db<typeof schema>();
const portion = args.portion ?? 1;
const res = await db.insert(schema.meals).values({
name: args.name, calories: scaleCalories(args.calories, portion),
protein: scaleMacro(args.protein, portion), fat: scaleMacro(args.fat, portion), carbs: scaleMacro(args.carbs, portion),
mealType: args.mealType, portion, date: args.date,
}).returning({ id: schema.meals.id});
await registerMaster(ctx, {
name: args.name, calories: args.calories,
protein: args.protein?? null, fat: args.fat?? null, carbs: args.carbs?? null,
mealType: args.mealType,
});
ctx.invalidateQueries();
return { id: res[0]!.id};
},
}),

// マスターからワンタップ追加（マスターの利用回数も更新）
addMealFromMaster: defineAction({
description: "マスター食品を使って食事を1件追加します。portion（割合）でカロリー・PFCを換算して記録します。",
request: z.object({
masterId: z.number(),
mealType: mealTypeEnum,
portion: portionSchema.optional(),
date: dateStr,
}),
response: z.object({ id: z.number()}),
async handler(ctx, args) {
const db = ctx.db<typeof schema>();
const rows = await db.select().from(schema.masterFoods).where(eq(schema.masterFoods.id, args.masterId));
const m = rows[0];
if (!m) throw new Error("マスター食品が見つかりません");
const portion = args.portion ?? 1;
const res = await db.insert(schema.meals).values({
name: m.name, calories: scaleCalories(m.calories, portion),
protein: scaleMacro(m.protein, portion), fat: scaleMacro(m.fat, portion), carbs: scaleMacro(m.carbs, portion),
mealType: args.mealType, portion, date: args.date,
}).returning({ id: schema.meals.id});
await db.update(schema.masterFoods).set({
useCount: m.useCount + 1, lastUsedAt: new Date(), lastMealType: args.mealType,
}).where(eq(schema.masterFoods.id, m.id));
ctx.invalidateQueries();
return { id: res[0]!.id};
},
}),

updateMeal: defineAction({
description: "食事記録を編集します。calories等は1食分の基準値で受け取り、portion（割合）で換算して保存します。",
request: z.object({
id: z.number(),
name: z.string().min(1).max(100),
calories: z.number().int().min(0).max(10000),
protein: z.number().min(0).max(1000).nullable().optional(),
fat: z.number().min(0).max(1000).nullable().optional(),
carbs: z.number().min(0).max(1000).nullable().optional(),
mealType: mealTypeEnum,
portion: portionSchema.optional(),
}),
response: z.object({ ok: z.literal(true)}),
async handler(ctx, args): Promise<{ ok: true}> {
const db = ctx.db<typeof schema>();
const portion = args.portion ?? 1;
await db.update(schema.meals).set({
name: args.name, calories: scaleCalories(args.calories, portion),
protein: scaleMacro(args.protein, portion), fat: scaleMacro(args.fat, portion), carbs: scaleMacro(args.carbs, portion),
mealType: args.mealType, portion,
}).where(eq(schema.meals.id, args.id));
await registerMaster(ctx, {
name: args.name, calories: args.calories,
protein: args.protein?? null, fat: args.fat?? null, carbs: args.carbs?? null,
mealType: args.mealType,
});
ctx.invalidateQueries();
return { ok: true};
},
}),

deleteMeal: defineAction({
description: "食事記録を削除します。",
request: z.object({ id: z.number()}),
response: z.object({ ok: z.literal(true)}),
async handler(ctx, args): Promise<{ ok: true}> {
const db = ctx.db<typeof schema>();
await db.delete(schema.meals).where(eq(schema.meals.id, args.id));
ctx.invalidateQueries();
return { ok: true};
},
}),

updateGoal: defineAction({
description: "1日の目標カロリーを変更します。",
request: z.object({ dailyGoal: z.number().int().min(500).max(10000)}),
response: z.object({ ok: z.literal(true), dailyGoal: z.number()}),
async handler(ctx, args) {
const db = ctx.db<typeof schema>();
await ensureSettings(ctx);
await db.update(schema.settings).set({ dailyGoal: args.dailyGoal}).where(eq(schema.settings.id, 1));
ctx.invalidateQueries();
return { ok: true as const, dailyGoal: args.dailyGoal};
},
}),

getWeights: defineAction({
description: "体重記録の一覧を取得します。",
request: z.object({ limit: z.number().int().positive().max(100).default(30)}),
response: z.object({
weights: z.array(z.object({ id: z.number(), weight: z.number(), date: z.string()})),
}),
async handler(ctx, args) {
const db = ctx.db<typeof schema>();
const rows = await db.select().from(schema.weightLogs).orderBy(desc(schema.weightLogs.date), desc(schema.weightLogs.id)).limit(args.limit);
return { weights: rows.map(r => ({ id: r.id, weight: r.weight, date: r.date}))};
},
}),

addWeight: defineAction({
description: "体重を記録します。",
request: z.object({ weight: z.number().min(20).max(300), date: dateStr}),
response: z.object({ id: z.number()}),
async handler(ctx, args) {
const db = ctx.db<typeof schema>();
const res = await db.insert(schema.weightLogs).values({ weight: args.weight, date: args.date}).returning({ id: schema.weightLogs.id});
ctx.invalidateQueries();
return { id: res[0]!.id};
},
}),

deleteWeight: defineAction({
description: "体重記録を削除します。",
request: z.object({ id: z.number()}),
response: z.object({ ok: z.literal(true)}),
async handler(ctx, args): Promise<{ ok: true}> {
const db = ctx.db<typeof schema>();
await db.delete(schema.weightLogs).where(eq(schema.weightLogs.id, args.id));
ctx.invalidateQueries();
return { ok: true};
},
}),

// 既存の全食事履歴を走査してマスターへ一括登録（重複・類似はスキップ）。移行・修復用。
backfillMasters: defineAction({
description: "過去の食事記録すべてからマスター食品を一括登録します（重複・類似は登録しません）。",
request: z.object({}),
response: z.object({ registered: z.number(), total: z.number()}),
async handler(ctx) {
const db = ctx.db<typeof schema>();
const rows = await db.select().from(schema.meals).orderBy(asc(schema.meals.id));
const before = (await db.select({ id: schema.masterFoods.id}).from(schema.masterFoods)).length;
// 同じ正規化名は最新（最後に使った）値で1回だけ登録する
const byKey = new Map<string, MealRow>();
for (const r of rows) byKey.set(normalizeName(r.name), r);
for (const r of byKey.values()) {
await registerMaster(ctx, {
name: r.name, calories: unscaleCalories(r.calories, r.portion ?? 1),
protein: unscaleMacro(r.protein, r.portion ?? 1), fat: unscaleMacro(r.fat, r.portion ?? 1), carbs: unscaleMacro(r.carbs, r.portion ?? 1),
mealType: r.mealType as MealType,
});
}
const after = (await db.select({ id: schema.masterFoods.id}).from(schema.masterFoods)).length;
ctx.invalidateQueries();
return { registered: after - before, total: after};
},
}),
} satisfies ActionsModule;
