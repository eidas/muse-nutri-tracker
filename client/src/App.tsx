import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { api, type ApiResponse } from "./api";

type Bundle = ApiResponse<typeof api, "getDayBundle">;
type Meal = Bundle["meals"][number];
type Master = Bundle["masters"][number];
type RecentItem = Bundle["recentByType"]["breakfast"][number];
type MealType = Meal["mealType"];

const MEAL_LABEL: Record<MealType, { label: string; emoji: string; color: string }> = {
  breakfast: { label: "朝食", emoji: "🌅", color: "#f59e0b" },
  lunch: { label: "昼食", emoji: "☀️", color: "#ea580c" },
  dinner: { label: "夕食", emoji: "🌙", color: "#7c3aed" },
  snack: { label: "間食", emoji: "🍪", color: "#15803d" },
};

const QUICK_FOODS: { name: string; kcal: number; p: number; f: number; c: number }[] = [
  { name: "ごはん（茶碗1杯 150g）", kcal: 234, p: 3.8, f: 0.5, c: 55.7 },
  { name: "食パン（6枚切り1枚）", kcal: 149, p: 5.3, f: 2.5, c: 26.6 },
  { name: "おにぎり（鮭）", kcal: 180, p: 4.5, f: 1.2, c: 37 },
  { name: "ゆで卵 1個", kcal: 76, p: 6.2, f: 5.2, c: 0.2 },
  { name: "納豆 1パック", kcal: 100, p: 8.3, f: 5.0, c: 6.1 },
  { name: "鶏むね肉 100g（皮なし）", kcal: 116, p: 23.3, f: 1.9, c: 0.1 },
  { name: "サラダチキン", kcal: 114, p: 21.7, f: 1.7, c: 0.3 },
  { name: "味噌汁 1杯", kcal: 34, p: 2.1, f: 1.0, c: 4.2 },
  { name: "うどん 1玉", kcal: 256, p: 6.5, f: 0.9, c: 55 },
  { name: "そば 1玉", kcal: 228, p: 9.6, f: 1.5, c: 44 },
  { name: "ラーメン 1杯", kcal: 450, p: 18, f: 12, c: 65 },
  { name: "カレーライス 1皿", kcal: 750, p: 18, f: 28, c: 105 },
  { name: "牛丼（並）", kcal: 650, p: 22, f: 22, c: 88 },
  { name: "バナナ 1本", kcal: 93, p: 1.1, f: 0.2, c: 24 },
  { name: "ヨーグルト 100g", kcal: 62, p: 3.6, f: 3.0, c: 5.0 },
  { name: "プロテイン 1杯", kcal: 110, p: 21, f: 1.0, c: 4.0 },
];

function portionLabel(p: number): string {
  if (p === 1) return "1食分";
  if (p === 0.5) return "半分";
  if (p === 0.25) return "1/4";
  if (p === 0.75) return "3/4";
  return `×${p}`;
}
function scaleKcal(base: number, portion: number): number { return Math.round(base * portion); }
function scaleMacro(v: number | null, portion: number): number | null {
  if (v == null) return null;
  return Math.round(v * portion * 10) / 10;
}
function unscaleKcal(scaled: number, portion: number): number {
  if (!portion || portion === 1) return scaled;
  return Math.round(scaled / portion);
}
function unscaleMacro(v: number | null, portion: number): number | null {
  if (v == null || !portion || portion === 1) return v;
  return Math.round((v / portion) * 10) / 10;
}

const PORTION_PRESETS: { v: number; label: string }[] = [
  { v: 1, label: "1食分" },
  { v: 0.75, label: "3/4" },
  { v: 0.5, label: "半分" },
  { v: 0.25, label: "1/4" },
];

function PortionSelector({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const isPreset = PORTION_PRESETS.some(p => p.v === value);
  const [customActive, setCustomActive] = useState(!isPreset);
  const [customText, setCustomText] = useState(!isPreset ? String(value) : "0.6");
  useEffect(() => {
    if (!PORTION_PRESETS.some(p => p.v === value)) {
      setCustomActive(true);
      setCustomText(String(value));
    } else {
      setCustomActive(false);
    }
  }, [value]);
  function handleCustom(text: string) {
    setCustomText(text);
    const n = Number(text);
    if (!Number.isNaN(n) && n >= 0.1 && n <= 0.9) onChange(Math.round(n * 100) / 100);
  }
  const customValid = customText !== "" && !Number.isNaN(Number(customText)) && Number(customText) >= 0.1 && Number(customText) <= 0.9;
  return (
    <div>
      <div className="text-xs font-bold text-[var(--dim)]">{label}</div>
      <div className="flex gap-1.5 mt-1.5 flex-wrap" role="group" aria-label={label}>
        {PORTION_PRESETS.map(p => (
          <button key={p.v} type="button" aria-pressed={!customActive && value === p.v} onClick={() => { setCustomActive(false); onChange(p.v); }} className={`px-3 py-2 rounded-full text-sm font-bold border ${!customActive && value === p.v ? "bg-[var(--accent)] text-white border-transparent" : "border-[var(--border)]"}`}>{p.label}</button>
        ))}
        <button type="button" aria-pressed={customActive} onClick={() => { setCustomActive(true); const n = Number(customText); if (!Number.isNaN(n) && n >= 0.1 && n <= 0.9) onChange(Math.round(n * 100) / 100); else { setCustomText("0.6"); onChange(0.6); } }} className={`px-3 py-2 rounded-full text-sm font-bold border ${customActive ? "bg-[var(--accent)] text-white border-transparent" : "border-[var(--border)]"}`}>自由入力</button>
      </div>
      {customActive && (
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <input aria-label="自由入力の割合（0.1〜0.9）" type="number" inputMode="decimal" step="0.05" min="0.1" max="0.9" value={customText} onChange={e => handleCustom(e.target.value)} className="w-24 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" />
          <input aria-label="割合スライダー" type="range" min="0.1" max="0.9" step="0.05" value={customValid ? Number(customText) : 0.6} onChange={e => handleCustom(e.target.value)} className="flex-1 min-w-28 accent-[#ea580c]" />
          <span className="text-xs text-[var(--dim)]">0.1〜0.9{customValid ? `（×${Number(customText)}）` : " の範囲で入力"}</span>
        </div>
      )}
    </div>
  );
}

// 写真を長辺1024pxのJPEGに縮小して base64 化する（送信量と解析速度のため）
async function preparePhoto(file: File): Promise<{ base64: string; preview: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image load failed"));
      el.src = url;
    });
    const maxSide = 1024;
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const w = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
    const h = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) throw new Error("canvas unavailable");
    ctx2d.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    const base64 = dataUrl.split(",")[1] ?? "";
    if (!base64) throw new Error("encode failed");
    return { base64, preview: dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

type PhotoItem = {
  key: number;
  name: string;
  calories: string;
  protein: string;
  fat: string;
  carbs: string;
  selected: boolean;
};

function toKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayKey() { return toKey(new Date()); }
function addDays(key: string, delta: number) {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return toKey(d);
}
function formatJa(key: string) {
  const d = new Date(`${key}T12:00:00`);
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  return `${d.getMonth() + 1}月${d.getDate()}日（${days[d.getDay()] ?? ""}）`;
}
function isToday(key: string) { return key === todayKey(); }

function Ring({ value, goal }: { value: number; goal: number }) {
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  const R = 84; const C = 2 * Math.PI * R;
  const over = value > goal;
  return (
    <div className="relative mx-auto" style={{ width: 210, height: 210 }}>
      <svg width="210" height="210" viewBox="0 0 210 210" className="-rotate-90">
        <circle cx="105" cy="105" r={R} fill="none" stroke="var(--border)" strokeWidth="14" />
        <circle cx="105" cy="105" r={R} fill="none" stroke={over ? "#dc2626" : "var(--accent)"} strokeWidth="14" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C - (C * pct) / 100} style={{ transition: "stroke-dashoffset .5s ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
        <div className="text-[11px] font-bold tracking-widest text-[var(--dim)]">{over ? "オーバー" : "あと"}</div>
        <div className={`font-display text-[42px] leading-none font-black ${over ? "text-red-600" : ""}`}>{Math.abs(goal - value).toLocaleString()}</div>
        <div className="text-xs text-[var(--dim)] mt-1">kcal / 目標 {goal.toLocaleString()}</div>
        <div className="mt-2 text-sm font-bold">摂取 {value.toLocaleString()} kcal</div>
        <div className="text-[11px] text-[var(--dim)]">{Math.round(pct)}% 達成</div>
      </div>
    </div>
  );
}

type AddVars = {
  name: string; calories: number;
  protein: number | null; fat: number | null; carbs: number | null;
  mealType: MealType; masterId?: number; portion: number;
  // 記録先の日付はミューテーション変数として明示的に保持する。
  // 画面の date 状態をクロージャで参照すると、通信中に日付を移動した際に
  // 別の日のキャッシュへ楽観的更新が混ざる恐れがあるため。
  targetDate: string;
};

export function App() {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayKey());
  const [showForm, setShowForm] = useState(false);
  const [showPhoto, setShowPhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoItems, setPhotoItems] = useState<PhotoItem[] | null>(null);
  const [photoDescription, setPhotoDescription] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [photoNotFood, setPhotoNotFood] = useState(false);
  const [photoPortion, setPhotoPortion] = useState(1);
  const [photoSaving, setPhotoSaving] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const [editing, setEditing] = useState<Meal | null>(null);
  const [showGoal, setShowGoal] = useState(false);
  const [showQuick, setShowQuick] = useState(false);
  const [showMasters, setShowMasters] = useState(false);
  const [showWeightForm, setShowWeightForm] = useState(false);
  const [view, setView] = useState<"main" | "masters">("main");
  // マスター管理画面用
  const [manageQuery, setManageQuery] = useState("");
  const [manageSort, setManageSort] = useState<"freq" | "recent" | "name" | "kcal">("freq");
  const [manageFilterType, setManageFilterType] = useState<MealType | "all">("all");
  const [editingMaster, setEditingMaster] = useState<Master | null>(null);
  const [showMasterForm, setShowMasterForm] = useState(false);
  const [mName, setMName] = useState("");
  const [mCalories, setMCalories] = useState("");
  const [mProtein, setMProtein] = useState("");
  const [mFat, setMFat] = useState("");
  const [mCarbs, setMCarbs] = useState("");
  const [mMealType, setMMealType] = useState<MealType>("lunch");
  const [masterFormError, setMasterFormError] = useState("");
  const [masterToast, setMasterToast] = useState("");

  // form state
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [fat, setFat] = useState("");
  const [carbs, setCarbs] = useState("");
  const [mealType, setMealType] = useState<MealType>("lunch");
  const [portion, setPortion] = useState(1);
  const [instantPortion, setInstantPortion] = useState(1);
  const [goalInput, setGoalInput] = useState("");
  const [weightInput, setWeightInput] = useState("");
  const [masterQuery, setMasterQuery] = useState("");
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const [confirmDelMaster, setConfirmDelMaster] = useState<number | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [debouncedName, setDebouncedName] = useState("");
  const tempIdRef = useRef(-1);
  const backfilledRef = useRef(false);

  // 画面の全データを1リクエストで取得。
  // 日付ごとに queryKey を分け、placeholderData で前日のデータを流用しない
  // （前日の食事・合計が新しい日付の見出しの下に表示され、「昨日も今日と
  // 同じ内容になった」ように見える不具合の原因だった）。
  const bundleQ = useQuery({
    queryKey: ["bundle", date],
    queryFn: () => api.getDayBundle({ date }),
    staleTime: 30_000,
  });
  // 取得できたバンドルでも、選択中の日付と一致しないものは表示に使わない
  // （キャッシュや再取得のタイミングで別日のデータが混ざらないための防御）。
  const day = bundleQ.data && bundleQ.data.date === date ? bundleQ.data : undefined;
  const dayMismatch = bundleQ.data != null && bundleQ.data.date !== date;

  const mastersQ = useQuery({
    queryKey: ["masters"],
    queryFn: () => api.getMasters({}),
    enabled: view === "masters",
    staleTime: 10_000,
  });

  // 入力候補は少し遅らせて検索（タイプ中のリクエストを減らす）
  useEffect(() => {
    const t = setTimeout(() => setDebouncedName(name), 200);
    return () => clearTimeout(t);
  }, [name]);
  const suggestQ = useQuery({
    queryKey: ["suggest", debouncedName, mealType],
    queryFn: () => api.suggestFoods({ query: debouncedName, mealType }),
    enabled: showForm && !editing && debouncedName.trim().length > 0,
    staleTime: 60_000,
  });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["bundle"] }); qc.invalidateQueries({ queryKey: ["masters"] }); };

  // 既存の履歴があるのにマスターが空なら一度だけ自動で一括登録
  const backfillMut = useMutation({
    mutationFn: () => api.backfillMasters({}),
    onSuccess: invalidate,
  });
  useEffect(() => {
    if (!day || backfilledRef.current) return;
    const hasHistory = day.meals.length > 0 || (Object.keys(day.recentByType) as MealType[]).some(t => day.recentByType[t].length > 0);
    if (day.masters.length === 0 && hasHistory) {
      backfilledRef.current = true;
      backfillMut.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  // 日付を移動したら、前日の食事に対する編集フォームや削除確認などの
  // 一時状態を引き継がない（別日の記録を誤って編集・表示しないため）。
  const firstDateRef = useRef(true);
  useEffect(() => {
    if (firstDateRef.current) { firstDateRef.current = false; return; }
    setEditing(null);
    setShowForm(false);
    setShowPhoto(false);
    resetPhoto();
    setShowGoal(false);
    setShowWeightForm(false);
    setConfirmDel(null);
    setSuggestOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // ---- 楽観的更新つきミューテーション ----
  // 楽観的更新は必ず「対象日付のキャッシュキー」だけを書き換える。
  // 対象日付は変数（v.targetDate）から取り、画面の date 状態には依存しない。
  const addMut = useMutation({
    mutationFn: (v: AddVars) => v.masterId != null
      ? api.addMealFromMaster({ masterId: v.masterId, mealType: v.mealType, portion: v.portion, date: v.targetDate })
      : api.addMeal({ name: v.name, calories: v.calories, protein: v.protein, fat: v.fat, carbs: v.carbs, mealType: v.mealType, portion: v.portion, date: v.targetDate }),
    onMutate: async (v) => {
      const key = ["bundle", v.targetDate] as const;
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Bundle>(key);
      // キャッシュの日付が対象日付と一致するときだけ楽観的に追記する
      if (prev && prev.date === v.targetDate) {
        const temp: Meal = {
          id: tempIdRef.current--, name: v.name, calories: scaleKcal(v.calories, v.portion),
          protein: scaleMacro(v.protein, v.portion), fat: scaleMacro(v.fat, v.portion), carbs: scaleMacro(v.carbs, v.portion),
          mealType: v.mealType, portion: v.portion, date: v.targetDate, created_at: new Date().toISOString(),
        };
        const meals = [...prev.meals, temp];
        qc.setQueryData<Bundle>(key, {
          ...prev, meals,
          totalCalories: meals.reduce((s, m) => s + m.calories, 0),
          totalProtein: Math.round(meals.reduce((s, m) => s + (m.protein ?? 0), 0) * 10) / 10,
          totalFat: Math.round(meals.reduce((s, m) => s + (m.fat ?? 0), 0) * 10) / 10,
          totalCarbs: Math.round(meals.reduce((s, m) => s + (m.carbs ?? 0), 0) * 10) / 10,
        });
      }
      return { prev, targetDate: v.targetDate };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["bundle", ctx.targetDate], ctx.prev); },
    onSettled: invalidate,
  });

  const photoMut = useMutation({
    mutationFn: (v: { base64: string }) => api.analyzeFoodPhoto({ imageBase64: v.base64, mimeType: "image/jpeg", mealType }),
    onSuccess: (res) => {
      if (!res.ok) {
        setPhotoError(res.error ?? "写真を解析できませんでした。撮り直してください。");
        setPhotoItems(null);
        return;
      }
      if (!res.isFood || res.items.length === 0) {
        setPhotoNotFood(true);
        setPhotoDescription(res.description);
        setPhotoItems(null);
        return;
      }
      setPhotoDescription(res.description);
      setPhotoItems(res.items.map((it, i) => ({
        key: i,
        name: it.name,
        calories: String(it.calories),
        protein: it.protein != null ? String(it.protein) : "",
        fat: it.fat != null ? String(it.fat) : "",
        carbs: it.carbs != null ? String(it.carbs) : "",
        selected: true,
      })));
    },
    onError: () => { setPhotoError("写真を解析できませんでした。通信状態を確認して、もう一度お試しください。"); setPhotoItems(null); },
  });

  async function handlePhotoFile(file: File) {
    setPhotoError("");
    setPhotoNotFood(false);
    setPhotoItems(null);
    setPhotoDescription("");
    try {
      const { base64, preview } = await preparePhoto(file);
      setPhotoPreview(preview);
      photoMut.mutate({ base64 });
    } catch {
      setPhotoError("写真を読み込めませんでした。別の写真でお試しください。");
    }
  }

  function resetPhoto() {
    setPhotoPreview(null);
    setPhotoItems(null);
    setPhotoDescription("");
    setPhotoError("");
    setPhotoNotFood(false);
    setPhotoPortion(1);
  }

  async function savePhotoItems() {
    if (!photoItems) return;
    const targets = photoItems.filter(it => it.selected && it.name.trim() && it.calories !== "" && !Number.isNaN(Number(it.calories)) && Number(it.calories) >= 0);
    if (targets.length === 0) return;
    setPhotoSaving(true);
    // 保存開始時点の日付を記録先として固定する（保存中に日付が変わっても
    // 別の日に記録されないように）
    const targetDate = date;
    try {
      for (const it of targets) {
        await addMut.mutateAsync({
          name: it.name.trim(),
          calories: Number(it.calories),
          protein: it.protein ? Number(it.protein) : null,
          fat: it.fat ? Number(it.fat) : null,
          carbs: it.carbs ? Number(it.carbs) : null,
          mealType,
          portion: photoPortion,
          targetDate,
        });
      }
      resetPhoto();
      setShowPhoto(false);
    } catch {
      setPhotoError("一部の項目を記録できませんでした。記録済みの項目は下の一覧で確認してください。");
    } finally {
      setPhotoSaving(false);
    }
  }

  const editMut = useMutation({
    mutationFn: () => api.updateMeal({ id: editing!.id, name: name.trim(), calories: Number(calories), protein: protein ? Number(protein) : null, fat: fat ? Number(fat) : null, carbs: carbs ? Number(carbs) : null, mealType, portion }),
    onSuccess: () => { invalidate(); resetForm(); },
  });
  const delMut = useMutation({
    mutationFn: (v: { id: number; targetDate: string }) => api.deleteMeal({ id: v.id }),
    onMutate: async (v) => {
      const key = ["bundle", v.targetDate] as const;
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Bundle>(key);
      if (prev && prev.date === v.targetDate) {
        const meals = prev.meals.filter(m => m.id !== v.id);
        qc.setQueryData<Bundle>(key, {
          ...prev, meals,
          totalCalories: meals.reduce((s, m) => s + m.calories, 0),
          totalProtein: Math.round(meals.reduce((s, m) => s + (m.protein ?? 0), 0) * 10) / 10,
          totalFat: Math.round(meals.reduce((s, m) => s + (m.fat ?? 0), 0) * 10) / 10,
          totalCarbs: Math.round(meals.reduce((s, m) => s + (m.carbs ?? 0), 0) * 10) / 10,
        });
      }
      return { prev, targetDate: v.targetDate };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["bundle", ctx.targetDate], ctx.prev); },
    onSettled: invalidate,
  });
  const goalMut = useMutation({ mutationFn: () => api.updateGoal({ dailyGoal: Number(goalInput) }), onSuccess: () => { invalidate(); setShowGoal(false); } });
  const weightMut = useMutation({
    mutationFn: (v: { weight: number; targetDate: string }) => api.addWeight({ weight: v.weight, date: v.targetDate }),
    onMutate: async (v) => {
      const key = ["bundle", v.targetDate] as const;
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Bundle>(key);
      if (prev && prev.date === v.targetDate) {
        const w = { id: tempIdRef.current--, weight: v.weight, date: v.targetDate };
        const weights = [w, ...prev.weights.filter(x => x.date !== v.targetDate)].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 30);
        qc.setQueryData<Bundle>(key, { ...prev, weights });
      }
      return { prev, targetDate: v.targetDate };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["bundle", ctx.targetDate], ctx.prev); },
    onSuccess: () => { setWeightInput(""); setShowWeightForm(false); },
    onSettled: invalidate,
  });
  const delWeightMut = useMutation({ mutationFn: (id: number) => api.deleteWeight({ id }), onSuccess: invalidate });
  const delMasterMut = useMutation({
    mutationFn: (id: number) => api.deleteMaster({ id }),
    onSuccess: () => { invalidate(); setMasterToast("マスターを削除しました"); setTimeout(() => setMasterToast(""), 2500); },
  });
  const createMasterMut = useMutation({
    mutationFn: () => api.createMaster({ name: mName.trim(), calories: Number(mCalories), protein: mProtein ? Number(mProtein) : null, fat: mFat ? Number(mFat) : null, carbs: mCarbs ? Number(mCarbs) : null, mealType: mMealType }),
    onSuccess: (res) => {
      if (!res.ok) { setMasterFormError(res.error ?? "登録できませんでした"); return; }
      setMasterFormError(""); setShowMasterForm(false); setEditingMaster(null); invalidate(); setMasterToast("マスターを追加しました"); setTimeout(() => setMasterToast(""), 2500);
    },
    onError: () => setMasterFormError("保存できませんでした。入力を確認してください。"),
  });
  const updateMasterMut = useMutation({
    mutationFn: () => api.updateMaster({ id: editingMaster!.id, name: mName.trim(), calories: Number(mCalories), protein: mProtein ? Number(mProtein) : null, fat: mFat ? Number(mFat) : null, carbs: mCarbs ? Number(mCarbs) : null, mealType: mMealType }),
    onSuccess: (res) => {
      if (!res.ok) { setMasterFormError(res.error ?? "保存できませんでした"); return; }
      setMasterFormError(""); setShowMasterForm(false); setEditingMaster(null); invalidate(); setMasterToast("マスターを更新しました"); setTimeout(() => setMasterToast(""), 2500);
    },
    onError: () => setMasterFormError("保存できませんでした。入力を確認してください。"),
  });

  function resetMasterForm() { setMName(""); setMCalories(""); setMProtein(""); setMFat(""); setMCarbs(""); setMMealType("lunch"); setEditingMaster(null); setShowMasterForm(false); setMasterFormError(""); }
  function startAddMaster() { resetMasterForm(); setShowMasterForm(true); setMasterFormError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function startEditMaster(m: Master) { setEditingMaster(m); setMName(m.name); setMCalories(String(m.calories)); setMProtein(m.protein != null ? String(m.protein) : ""); setMFat(m.fat != null ? String(m.fat) : ""); setMCarbs(m.carbs != null ? String(m.carbs) : ""); setMMealType(m.lastMealType); setShowMasterForm(true); setMasterFormError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function saveMaster() { if (editingMaster) updateMasterMut.mutate(); else createMasterMut.mutate(); }

  function resetForm() { setName(""); setCalories(""); setProtein(""); setFat(""); setCarbs(""); setPortion(1); setEditing(null); setShowForm(false); setSuggestOpen(false); }
  function startEdit(m: Meal) { const p = m.portion ?? 1; setEditing(m); setName(m.name); setPortion(p); setCalories(String(unscaleKcal(m.calories, p))); setProtein(m.protein != null ? String(unscaleMacro(m.protein, p) ?? "") : ""); setFat(m.fat != null ? String(unscaleMacro(m.fat, p) ?? "") : ""); setCarbs(m.carbs != null ? String(unscaleMacro(m.carbs, p) ?? "") : ""); setMealType(m.mealType); setShowForm(true); setSuggestOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }

  function addRecent(item: RecentItem, t: MealType) {
    addMut.mutate({ name: item.name, calories: item.calories, protein: item.protein, fat: item.fat, carbs: item.carbs, mealType: t, portion: instantPortion, targetDate: date });
  }
  function addMaster(m: Master, t: MealType) {
    addMut.mutate({ name: m.name, calories: m.calories, protein: m.protein, fat: m.fat, carbs: m.carbs, mealType: t, masterId: m.id, portion: instantPortion, targetDate: date });
  }
  function addQuick(f: typeof QUICK_FOODS[number], t: MealType) {
    addMut.mutate({ name: f.name, calories: f.kcal, protein: f.p, fat: f.f, carbs: f.c, mealType: t, portion: instantPortion, targetDate: date });
  }
  function applySuggestion(s: { name: string; calories: number; protein: number | null; fat: number | null; carbs: number | null }) {
    setName(s.name);
    setCalories(String(s.calories));
    setProtein(s.protein != null ? String(s.protein) : "");
    setFat(s.fat != null ? String(s.fat) : "");
    setCarbs(s.carbs != null ? String(s.carbs) : "");
    setSuggestOpen(false);
  }

  const grouped = useMemo(() => {
    const g: Record<MealType, Meal[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
    day?.meals.forEach(m => g[m.mealType].push(m));
    return g;
  }, [day]);

  const filteredMasters = useMemo(() => {
    if (!day) return [];
    const q = masterQuery.trim();
    if (!q) return day.masters;
    return day.masters.filter(m => m.name.includes(q));
  }, [day, masterQuery]);

  const allMasters: Master[] = useMemo(() => {
    // 管理画面は getMasters（最大200件）を優先、未取得時は bundle の一覧を使う
    if (mastersQ.data?.masters) return mastersQ.data.masters as Master[];
    return day?.masters ?? [];
  }, [mastersQ.data, day]);

  const managedMasters = useMemo(() => {
    let list = [...allMasters];
    const q = manageQuery.trim();
    if (q) list = list.filter(m => m.name.includes(q));
    if (manageFilterType !== "all") list = list.filter(m => m.lastMealType === manageFilterType);
    switch (manageSort) {
      case "freq": list.sort((a, b) => b.useCount - a.useCount || b.lastUsedAt.localeCompare(a.lastUsedAt)); break;
      case "recent": list.sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt)); break;
      case "name": list.sort((a, b) => a.name.localeCompare(b.name, "ja")); break;
      case "kcal": list.sort((a, b) => b.calories - a.calories); break;
    }
    return list;
  }, [allMasters, manageQuery, manageFilterType, manageSort]);

  const localSuggestions = useMemo(() => {
    if (!day || !name.trim() || editing) return [];
    const q = name.trim();
    return day.masters.filter(m => m.name.includes(q)).slice(0, 5).map(m => ({
      name: m.name, calories: m.calories, protein: m.protein, fat: m.fat, carbs: m.carbs, source: "master" as const,
    }));
  }, [day, name, editing]);

  const suggestions = useMemo(() => {
    const server = suggestQ.data?.suggestions ?? [];
    const seen = new Set<string>();
    const merged: typeof server = [];
    for (const s of [...localSuggestions, ...server]) {
      if (seen.has(s.name)) continue;
      seen.add(s.name);
      merged.push(s);
      if (merged.length >= 8) break;
    }
    return merged;
  }, [localSuggestions, suggestQ.data]);

  const pfcMax = { p: 80, f: 65, c: 260 }; // 参考値（一般的な目安）

  if (view === "masters") {
    return (
      <div className="min-h-screen bg-[var(--bg)] pb-28">
        <SafeAreaTopScrim backgroundColor="var(--bg)" />
        <main className="mx-auto max-w-2xl px-4 pt-4">
          {/* Header */}
          <div className="flex items-center gap-3">
            <button aria-label="カロリー管理に戻る" onClick={() => { setView("main"); resetMasterForm(); }} className="w-10 h-10 shrink-0 rounded-full bg-[var(--surface)] border border-[var(--border)] text-lg font-bold shadow-sm">‹</button>
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-xl font-black leading-tight">マスター管理</h1>
              <p className="text-xs text-[var(--dim)]">登録済み {allMasters.length}件 ・ 1食分の値で管理しています</p>
            </div>
            <span className="rounded-full bg-[var(--surface)] border border-[var(--border)] px-3 py-1 text-xs font-bold">{managedMasters.length}件表示</span>
          </div>

          {masterToast && <div aria-live="polite" className="mt-3 rounded-xl bg-green-50 border border-green-200 text-green-800 px-3 py-2.5 text-sm font-bold dark:bg-green-950 dark:border-green-800 dark:text-green-200">{masterToast}</div>}

          {/* Add button */}
          {!showMasterForm && (
            <button onClick={startAddMaster} className="mt-4 w-full rounded-2xl bg-[var(--accent)] text-white py-3.5 font-display font-black shadow text-sm">＋ 新しい食品をマスターに追加</button>
          )}

          {/* Master form: add / edit */}
          {showMasterForm && (
            <section className="mt-4 rounded-2xl bg-[var(--surface)] border-2 border-[var(--accent)] p-4">
              <h2 className="font-display font-black">{editingMaster ? "マスターを編集" : "マスターに追加"}</h2>
              <p className="text-[11px] text-[var(--dim)] mt-1">カロリー・PFCは「1食分」の基準値で入力してください。食事に記録するときに割合で換算されます。</p>
              <div className="mt-3">
                <div className="text-xs font-bold text-[var(--dim)]">よく使う区分（目安）</div>
                <div className="flex gap-1.5 mt-1.5 flex-wrap">
                  {(Object.keys(MEAL_LABEL) as MealType[]).map(t => (
                    <button key={t} type="button" onClick={() => setMMealType(t)} className={`px-3 py-2 rounded-full text-sm font-bold border ${mMealType === t ? "bg-[var(--accent)] text-white border-transparent" : "border-[var(--border)]"}`}>{MEAL_LABEL[t].emoji} {MEAL_LABEL[t].label}</button>
                  ))}
                </div>
              </div>
              <label className="block mt-3 text-xs font-bold text-[var(--dim)]" htmlFor="master-name">食品名 *</label>
              <input id="master-name" value={mName} onChange={e => setMName(e.target.value)} placeholder="例：プロテイン 50g" className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm" autoComplete="off" />
              <label className="block mt-3 text-xs font-bold text-[var(--dim)]" htmlFor="master-cal">カロリー（kcal）* ― 1食分の値</label>
              <input id="master-cal" type="number" inputMode="numeric" value={mCalories} onChange={e => setMCalories(e.target.value)} placeholder="例：200" className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm" />
              <div className="grid grid-cols-3 gap-2 mt-3">
                <div><label className="block whitespace-nowrap text-xs font-bold text-[var(--dim)]" htmlFor="mf-p">たんぱく質 g<span className="text-[10px] font-normal">（1食分）</span></label><input id="mf-p" type="number" inputMode="decimal" value={mProtein} onChange={e => setMProtein(e.target.value)} placeholder="任意" className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-2 py-2.5 text-sm" /></div>
                <div><label className="block whitespace-nowrap text-xs font-bold text-[var(--dim)]" htmlFor="mf-f">脂質 g<span className="text-[10px] font-normal">（1食分）</span></label><input id="mf-f" type="number" inputMode="decimal" value={mFat} onChange={e => setMFat(e.target.value)} placeholder="任意" className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-2 py-2.5 text-sm" /></div>
                <div><label className="block whitespace-nowrap text-xs font-bold text-[var(--dim)]" htmlFor="mf-c">炭水化物 g<span className="text-[10px] font-normal">（1食分）</span></label><input id="mf-c" type="number" inputMode="decimal" value={mCarbs} onChange={e => setMCarbs(e.target.value)} placeholder="任意" className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-2 py-2.5 text-sm" /></div>
              </div>
              {masterFormError && <p className="mt-3 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs font-bold text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-200">{masterFormError}</p>}
              <div className="flex gap-2 mt-4">
                <button disabled={!mName.trim() || !mCalories || Number(mCalories) < 0 || createMasterMut.isPending || updateMasterMut.isPending} onClick={saveMaster} className="flex-1 rounded-xl bg-[var(--accent)] text-white py-3 font-bold disabled:opacity-40">{editingMaster ? "更新する" : "追加する"}</button>
                <button onClick={resetMasterForm} className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm font-bold">キャンセル</button>
              </div>
            </section>
          )}

          {/* Search / filter / sort */}
          <section className="mt-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-3">
            <input aria-label="マスターを検索" value={manageQuery} onChange={e => setManageQuery(e.target.value)} placeholder="食品名で検索…" className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm" />
            <div className="flex gap-1.5 mt-3 flex-wrap" role="group" aria-label="区分で絞り込み">
              <button onClick={() => setManageFilterType("all")} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${manageFilterType === "all" ? "bg-[var(--accent)] text-white border-transparent" : "border-[var(--border)]"}`}>すべて</button>
              {(Object.keys(MEAL_LABEL) as MealType[]).map(t => (
                <button key={t} onClick={() => setManageFilterType(t)} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${manageFilterType === t ? "bg-[var(--accent)] text-white border-transparent" : "border-[var(--border)]"}`}>{MEAL_LABEL[t].emoji} {MEAL_LABEL[t].label}</button>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-3">
              <label htmlFor="master-sort" className="text-xs font-bold text-[var(--dim)] shrink-0">並び順</label>
              <select id="master-sort" aria-label="マスターの並び順" value={manageSort} onChange={e => setManageSort(e.target.value as typeof manageSort)} className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm">
                <option value="freq">よく使う順</option>
                <option value="recent">最近使った順</option>
                <option value="name">名前順</option>
                <option value="kcal">カロリーが高い順</option>
              </select>
            </div>
          </section>

          {/* List */}
          <section className="mt-3">
            {mastersQ.isPending && <p className="py-10 text-center text-sm text-[var(--dim)]">読み込み中…</p>}
            {mastersQ.error && <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-800">読み込めませんでした。<button className="ml-2 font-bold underline" onClick={() => mastersQ.refetch()}>再試行</button></div>}
            {!mastersQ.isPending && allMasters.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] py-10 px-4 text-center">
                <p className="font-display font-black">まだマスターがありません</p>
                <p className="text-xs text-[var(--dim)] mt-2 leading-relaxed">上の「＋ 新しい食品をマスターに追加」から手動で登録できます。<br />食事を記録した食品も自動でここに登録されます。</p>
              </div>
            )}
            {!mastersQ.isPending && allMasters.length > 0 && managedMasters.length === 0 && (
              <p className="py-8 text-center text-sm text-[var(--dim)]">条件に一致するマスターがありません。検索や絞り込みを変えてみてください。</p>
            )}
            {managedMasters.length > 0 && (
              <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
                {managedMasters.map(m => (
                  <div key={m.id} className="px-3.5 py-3">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold leading-snug break-words">{m.name}</div>
                        <div className="text-[11px] text-[var(--dim)] mt-0.5">
                          {(m.protein != null || m.fat != null || m.carbs != null) ? <span>P {m.protein ?? "—"}g ・ F {m.fat ?? "—"}g ・ C {m.carbs ?? "—"}g（1食分）　</span> : <span>PFC未登録　</span>}
                          <span>{MEAL_LABEL[m.lastMealType].emoji} {MEAL_LABEL[m.lastMealType].label}</span>
                          {m.useCount > 0 ? <span> ・ {m.useCount}回記録</span> : <span> ・ 手動登録</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-display font-black">{m.calories.toLocaleString()}</span><span className="text-[10px] text-[var(--dim)]"> kcal</span>
                        <div className="text-[10px] text-[var(--dim)]">1食分</div>
                      </div>
                    </div>
                    <div className="flex gap-1.5 mt-2.5 flex-wrap">
                      <button aria-label={`${m.name}を編集`} onClick={() => startEditMaster(m)} className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--accent)]">編集</button>
                      <button aria-label={`${m.name}をマスターから削除`} onClick={() => { if (confirmDelMaster === m.id) { delMasterMut.mutate(m.id); setConfirmDelMaster(null); if (editingMaster?.id === m.id) resetMasterForm(); } else { setConfirmDelMaster(m.id); setTimeout(() => setConfirmDelMaster(null), 3000); } }} className={`rounded-full px-3 py-1.5 text-xs font-bold ${confirmDelMaster === m.id ? "bg-red-500 text-white" : "border border-red-200 text-red-500"}`}>{confirmDelMaster === m.id ? "本当に削除する" : "削除"}</button>
                    </div>
                    {confirmDelMaster === m.id && <p className="text-[11px] text-red-500 mt-1.5">マスターから削除します（過去の食事記録は残ります）。もう一度「本当に削除する」を押してください。</p>}
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-[var(--dim)] mt-3 leading-relaxed px-1">マスターを編集しても、すでに記録済みの食事のカロリーは変わりません。次回から追加するときに新しい値が使われます。削除しても過去の記録は消えません。</p>
            <button onClick={() => { setView("main"); resetMasterForm(); }} className="mt-4 w-full rounded-2xl bg-[var(--surface)] border border-[var(--border)] py-3 font-bold text-sm">カロリー管理に戻る</button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] pb-28">
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      <main className="mx-auto max-w-2xl px-4 pt-4">

        {/* Date nav */}
        <div className="flex items-center justify-between gap-2">
          <button aria-label="前の日" onClick={() => setDate(addDays(date, -1))} className="w-10 h-10 shrink-0 rounded-full bg-[var(--surface)] border border-[var(--border)] text-lg font-bold shadow-sm">‹</button>
          <div className="text-center flex-1 min-w-0">
            <div className="font-display text-lg font-black leading-tight">{isToday(date) ? "今日" : formatJa(date)}</div>
            {isToday(date) ? <div className="text-xs text-[var(--dim)]">{formatJa(date)}</div> : <button onClick={() => setDate(todayKey())} className="text-xs font-bold text-[var(--accent)] underline">今日に戻る</button>}
          </div>
          <button aria-label="次の日" onClick={() => setDate(addDays(date, 1))} className="w-10 h-10 shrink-0 rounded-full bg-[var(--surface)] border border-[var(--border)] text-lg font-bold shadow-sm">›</button>
          <button aria-label="マスター管理画面" title="マスター管理" onClick={() => setView("masters")} className="w-10 h-10 shrink-0 rounded-full bg-[var(--surface)] border border-[var(--border)] shadow-sm flex items-center justify-center text-[var(--dim)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
          </button>
        </div>
        <div className="mt-2 flex justify-center">
          <input aria-label="日付を選択" type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} className="text-xs bg-transparent text-[var(--dim)] border border-[var(--border)] rounded-full px-3 py-1" />
        </div>

        {(bundleQ.isPending || dayMismatch) && <p className="py-16 text-center text-sm text-[var(--dim)]">読み込み中…</p>}
        {bundleQ.error && <div className="mt-6 rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-800">読み込めませんでした。<button className="ml-2 font-bold underline" onClick={() => bundleQ.refetch()}>再試行</button></div>}

        {day && (
          <>
            {/* Hero ring */}
            <section className="mt-4 rounded-[28px] bg-[var(--surface)] border border-[var(--border)] p-5 shadow-sm">
              <Ring value={day.totalCalories} goal={day.dailyGoal} />
              {/* PFC */}
              <div className="mt-4 space-y-2.5">
                {[
                  { label: "たんぱく質 P", val: day.totalProtein, max: pfcMax.p, color: "#dc2626", unit: "g" },
                  { label: "脂質 F", val: day.totalFat, max: pfcMax.f, color: "#f59e0b", unit: "g" },
                  { label: "炭水化物 C", val: day.totalCarbs, max: pfcMax.c, color: "#15803d", unit: "g" },
                ].map(row => (
                  <div key={row.label} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-xs font-bold">{row.label}</span>
                    <div className="flex-1 h-2.5 rounded-full bg-[var(--border)] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, (row.val / row.max) * 100)}%`, background: row.color }} /></div>
                    <span className="w-20 text-right text-xs text-[var(--dim)]">{row.val}{row.unit} / {row.max}{row.unit}</span>
                  </div>
                ))}
                <p className="text-[11px] text-[var(--dim)]">※ PFCの目安は一般的な参考値です。記録がない項目は0として表示しています。</p>
              </div>
              <button onClick={() => { setGoalInput(String(day.dailyGoal)); setShowGoal(v => !v); }} className="mt-3 w-full text-center text-xs font-bold text-[var(--accent)] py-2">目標カロリーを変更する（現在 {day.dailyGoal.toLocaleString()} kcal）</button>
              {showGoal && (
                <div className="flex gap-2 mt-1">
                  <input aria-label="目標カロリー" type="number" inputMode="numeric" value={goalInput} onChange={e => setGoalInput(e.target.value)} className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm" placeholder="例：2000" />
                  <button disabled={!goalInput || Number(goalInput) < 500} onClick={() => goalMut.mutate()} className="rounded-xl bg-[var(--accent)] text-white px-4 py-2.5 text-sm font-bold disabled:opacity-40">保存</button>
                </div>
              )}
            </section>

            {/* Add buttons */}
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button onClick={() => { resetForm(); setShowForm(v => !v); }} className="rounded-2xl bg-[var(--accent)] text-white py-3.5 font-display font-black shadow text-sm">＋ 食事を記録</button>
              <button aria-expanded={showPhoto} onClick={() => setShowPhoto(v => !v)} className="rounded-2xl bg-[var(--accent2)] text-white py-3.5 font-display font-black shadow text-sm">📸 写真で記録</button>
              <button onClick={() => setShowQuick(v => !v)} className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] py-3.5 font-display font-black shadow-sm text-sm">🍱 よくある食品</button>
              <button onClick={() => setShowMasters(v => !v)} className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] py-3.5 font-display font-black shadow-sm text-sm">📚 マスター{day.masters.length > 0 ? `（${day.masters.length}）` : ""}</button>
            </div>

            {showPhoto && (
              <section className="mt-3 rounded-2xl bg-[var(--surface)] border-2 border-[var(--accent2)] p-4">
                <h2 className="font-display font-black">📸 写真から記録</h2>
                <p className="text-[11px] text-[var(--dim)] mt-1 leading-relaxed">食事の写真を選ぶと、AIが料理ごとにカロリーとPFCを推定します。推定値は目安なので、内容を確認・修正してから記録してください。写真は解析のためだけに使われ、保存されません。</p>
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" aria-label="カメラで撮影する" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void handlePhotoFile(f); }} />
                <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" aria-label="写真アルバムから選ぶ" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void handlePhotoFile(f); }} />
                <div className="flex gap-1.5 mt-3 flex-wrap" role="group" aria-label="写真の食事区分">
                  {(Object.keys(MEAL_LABEL) as MealType[]).map(t => (
                    <button key={t} onClick={() => setMealType(t)} className={`px-3 py-2 rounded-full text-sm font-bold border ${mealType === t ? "bg-[var(--accent2)] text-white border-transparent" : "border-[var(--border)]"}`}>{MEAL_LABEL[t].emoji} {MEAL_LABEL[t].label}</button>
                  ))}
                </div>
                {!photoPreview && (
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <button onClick={() => cameraInputRef.current?.click()} className="rounded-2xl bg-[var(--accent2)] text-white py-4 font-display font-black text-sm">📷 撮影する</button>
                    <button onClick={() => galleryInputRef.current?.click()} className="rounded-2xl bg-[var(--surface2)] border border-[var(--border)] py-4 font-display font-black text-sm">🖼 写真を選ぶ</button>
                  </div>
                )}
                {photoPreview && (
                  <div className="mt-3">
                    <img src={photoPreview} alt="解析する食事の写真" className="w-full max-h-60 object-cover rounded-2xl border border-[var(--border)]" />
                    <div className="flex gap-2 mt-2">
                      <button disabled={photoMut.isPending || photoSaving} onClick={() => cameraInputRef.current?.click()} className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-sm font-bold disabled:opacity-40">📷 撮り直す</button>
                      <button disabled={photoMut.isPending || photoSaving} onClick={() => galleryInputRef.current?.click()} className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-sm font-bold disabled:opacity-40">🖼 選び直す</button>
                    </div>
                  </div>
                )}
                {photoMut.isPending && <p aria-live="polite" className="mt-3 rounded-xl bg-[var(--surface2)] px-3 py-3 text-sm font-bold animate-pulse">AIが写真を解析中です…（10〜30秒ほどかかります）</p>}
                {photoError && <p role="alert" className="mt-3 rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-sm font-bold text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-200">{photoError}</p>}
                {photoNotFood && !photoMut.isPending && (
                  <p aria-live="polite" className="mt-3 rounded-xl bg-[var(--surface2)] px-3 py-2.5 text-sm font-bold">食べ物が写っていないようです。料理全体が写る写真でもう一度お試しください。</p>
                )}
                {photoItems && !photoMut.isPending && (
                  <div className="mt-3">
                    {photoDescription && <p className="text-sm font-bold leading-relaxed">{photoDescription}</p>}
                    <div className="mt-3">
                      <PortionSelector label="食べた割合（すべての品目に適用）" value={photoPortion} onChange={setPhotoPortion} />
                    </div>
                    <div className="mt-3 space-y-2">
                      {photoItems.map(it => (
                        <div key={it.key} className={`rounded-2xl border p-3 ${it.selected ? "border-[var(--accent2)] bg-[var(--surface)]" : "border-[var(--border)] opacity-60"}`}>
                          <div className="flex items-start gap-2">
                            <input aria-label={`${it.name || "品目"}を記録対象にする`} type="checkbox" checked={it.selected} onChange={e => setPhotoItems(prev => prev ? prev.map(x => x.key === it.key ? { ...x, selected: e.target.checked } : x) : prev)} className="mt-2.5 w-5 h-5 shrink-0 accent-[#15803d]" />
                            <div className="flex-1 min-w-0">
                              <label className="block text-[11px] font-bold text-[var(--dim)]" htmlFor={`photo-name-${it.key}`}>品目名（1食分の推定）</label>
                              <input id={`photo-name-${it.key}`} value={it.name} onChange={e => setPhotoItems(prev => prev ? prev.map(x => x.key === it.key ? { ...x, name: e.target.value } : x) : prev)} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm font-bold" autoComplete="off" />
                              <div className="grid grid-cols-4 gap-1.5 mt-2">
                                <div><label className="block text-[10px] font-bold text-[var(--dim)]" htmlFor={`photo-cal-${it.key}`}>kcal</label><input id={`photo-cal-${it.key}`} type="number" inputMode="numeric" value={it.calories} onChange={e => setPhotoItems(prev => prev ? prev.map(x => x.key === it.key ? { ...x, calories: e.target.value } : x) : prev)} className="mt-0.5 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-1.5 py-2 text-sm" /></div>
                                <div><label className="block whitespace-nowrap text-[10px] font-bold text-[var(--dim)]" htmlFor={`photo-p-${it.key}`}>P g</label><input id={`photo-p-${it.key}`} type="number" inputMode="decimal" value={it.protein} onChange={e => setPhotoItems(prev => prev ? prev.map(x => x.key === it.key ? { ...x, protein: e.target.value } : x) : prev)} placeholder="—" className="mt-0.5 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-1.5 py-2 text-sm" /></div>
                                <div><label className="block whitespace-nowrap text-[10px] font-bold text-[var(--dim)]" htmlFor={`photo-f-${it.key}`}>F g</label><input id={`photo-f-${it.key}`} type="number" inputMode="decimal" value={it.fat} onChange={e => setPhotoItems(prev => prev ? prev.map(x => x.key === it.key ? { ...x, fat: e.target.value } : x) : prev)} placeholder="—" className="mt-0.5 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-1.5 py-2 text-sm" /></div>
                                <div><label className="block whitespace-nowrap text-[10px] font-bold text-[var(--dim)]" htmlFor={`photo-c-${it.key}`}>C g</label><input id={`photo-c-${it.key}`} type="number" inputMode="decimal" value={it.carbs} onChange={e => setPhotoItems(prev => prev ? prev.map(x => x.key === it.key ? { ...x, carbs: e.target.value } : x) : prev)} placeholder="—" className="mt-0.5 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-1.5 py-2 text-sm" /></div>
                              </div>
                              {it.selected && it.calories !== "" && !Number.isNaN(Number(it.calories)) && photoPortion !== 1 && (
                                <p className="text-[11px] text-[var(--dim)] mt-1.5">記録される量：{portionLabel(photoPortion)} ＝ {scaleKcal(Number(it.calories), photoPortion).toLocaleString()} kcal</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {(() => {
                      const targets = photoItems.filter(x => x.selected && x.calories !== "" && !Number.isNaN(Number(x.calories)));
                      const total = targets.reduce((s, x) => s + scaleKcal(Number(x.calories), photoPortion), 0);
                      return (
                        <>
                          <p className="mt-3 text-sm font-bold" aria-live="polite">選択中 {targets.length}件 ・ 合計 {total.toLocaleString()} kcal{photoPortion !== 1 ? `（${portionLabel(photoPortion)}で換算）` : ""}を{MEAL_LABEL[mealType].label}に記録します</p>
                          <div className="flex gap-2 mt-3">
                            <button disabled={targets.length === 0 || photoSaving} onClick={() => void savePhotoItems()} className="flex-1 rounded-xl bg-[var(--accent2)] text-white py-3 font-bold disabled:opacity-40">{photoSaving ? "記録中…" : `選択した${targets.length}件を記録する`}</button>
                            <button disabled={photoSaving} onClick={() => { resetPhoto(); setShowPhoto(false); }} className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm font-bold disabled:opacity-40">キャンセル</button>
                          </div>
                          <p className="text-[11px] text-[var(--dim)] mt-2">記録するとマスター食品にも自動登録されます（重複・よく似た名前は登録されません）。</p>
                        </>
                      );
                    })()}
                  </div>
                )}
                {!photoItems && !photoMut.isPending && (
                  <button onClick={() => { resetPhoto(); setShowPhoto(false); }} className="mt-3 w-full rounded-xl border border-[var(--border)] py-2.5 text-sm font-bold">閉じる</button>
                )}
              </section>
            )}
            {/* クイック追加（よくある食品・マスター・履歴チップ）で使う割合 */}
            <section className="mt-3 rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-3">
              <PortionSelector label="クイック追加の割合（1食分が基準）" value={instantPortion} onChange={setInstantPortion} />
              <p className="text-[11px] text-[var(--dim)] mt-2">「よくある食品」「マスター」「最近の履歴」からタップで追加するときは、この割合でカロリー・PFCが換算されます。既定は1食分です。</p>
            </section>

            {showQuick && (
              <section className="mt-3 rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-3">
                <div className="flex gap-1.5 mb-3 flex-wrap">
                  {(Object.keys(MEAL_LABEL) as MealType[]).map(t => (
                    <button key={t} onClick={() => setMealType(t)} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${mealType === t ? "bg-[var(--accent)] text-white border-transparent" : "border-[var(--border)]"}`}>{MEAL_LABEL[t].emoji} {MEAL_LABEL[t].label}に追加</button>
                  ))}
                </div>
                <p className="text-xs font-bold mb-2">割合：{portionLabel(instantPortion)}{instantPortion !== 1 ? `（表示は換算後のカロリー）` : ""}</p>
                <div className="grid sm:grid-cols-2 gap-1.5">
                  {QUICK_FOODS.map(f => (
                    <button key={f.name} onClick={() => addQuick(f, mealType)} className="flex justify-between items-center text-left rounded-xl bg-[var(--surface2)] px-3 py-2.5 hover:opacity-80">
                      <span className="text-[13px] font-medium leading-snug pr-2">{f.name}</span>
                      <span className="text-[13px] font-black whitespace-nowrap">{scaleKcal(f.kcal, instantPortion)}<span className="text-[10px] font-normal text-[var(--dim)]"> kcal{instantPortion !== 1 ? `（1食分 ${f.kcal}）` : ""}</span></span>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-[var(--dim)] mt-2">カロリー・PFCは一般的な目安です。タップすると選択中の区分で{formatJa(date)}に記録され、マスターにも自動登録されます。</p>
              </section>
            )}

            {showMasters && (
              <section className="mt-3 rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-3">
                <div className="flex gap-1.5 mb-3 flex-wrap">
                  {(Object.keys(MEAL_LABEL) as MealType[]).map(t => (
                    <button key={t} onClick={() => setMealType(t)} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${mealType === t ? "bg-[var(--accent)] text-white border-transparent" : "border-[var(--border)]"}`}>{MEAL_LABEL[t].emoji} {MEAL_LABEL[t].label}に追加</button>
                  ))}
                </div>
                <input aria-label="マスター食品を検索" value={masterQuery} onChange={e => setMasterQuery(e.target.value)} placeholder="マスター食品を検索…" className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm mb-2" />
                {day.masters.length === 0 ? (
                  <p className="text-xs text-[var(--dim)] py-3 text-center">まだマスター食品がありません。食事を記録すると自動で登録されます（重複・よく似た名前は登録されません）。</p>
                ) : filteredMasters.length === 0 ? (
                  <p className="text-xs text-[var(--dim)] py-3 text-center">「{masterQuery}」に一致するマスター食品はありません。</p>
                ) : (
                  <div className="divide-y divide-[var(--border)]">
                    {filteredMasters.map(m => (
                      <div key={m.id} className="flex items-center gap-2 py-2">
                        <button onClick={() => addMaster(m, mealType)} className="flex-1 min-w-0 text-left">
                          <span className="block text-[13px] font-bold truncate">{m.name}</span>
                          <span className="block text-[11px] text-[var(--dim)]">{instantPortion !== 1 ? `${scaleKcal(m.calories, instantPortion)} kcal（${portionLabel(instantPortion)}／1食分 ${m.calories} kcal）` : `${m.calories} kcal`}{ m.useCount > 1 ? ` ・ ${m.useCount}回記録` : ""} ・ 最終 {MEAL_LABEL[m.lastMealType].label}</span>
                        </button>
                        <button aria-label={`${m.name}を編集`} onClick={() => { setView("masters"); startEditMaster(m); }} className="text-xs font-bold px-2 py-1.5 rounded shrink-0 text-[var(--accent)]">編集</button>
                        <button aria-label={`${m.name}をマスターから削除`} onClick={() => { if (confirmDelMaster === m.id) { delMasterMut.mutate(m.id); setConfirmDelMaster(null); } else { setConfirmDelMaster(m.id); setTimeout(() => setConfirmDelMaster(null), 3000); } }} className={`text-xs font-bold px-2 py-1.5 rounded shrink-0 ${confirmDelMaster === m.id ? "bg-red-500 text-white" : "text-red-500"}`}>{confirmDelMaster === m.id ? "本当に削除" : "削除"}</button>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={() => setView("masters")} className="mt-3 w-full rounded-xl bg-[var(--surface2)] border border-[var(--border)] py-2.5 text-xs font-bold text-[var(--accent)]">マスター管理画面で追加・編集・削除する →</button>
                <p className="text-[11px] text-[var(--dim)] mt-2">一度入力した食品は自動でマスターに登録されます。名前が完全に同じものや、数量違いなど「同じ食品と思われるもの」は重複登録されません。タップで選択中の区分に追加できます。</p>
              </section>
            )}

            {/* Form */}
            {showForm && (
              <section className="mt-3 rounded-2xl bg-[var(--surface)] border-2 border-[var(--accent)] p-4">
                <h2 className="font-display font-black">{editing ? "記録を編集" : "食事を記録"}</h2>
                {!editing && <button onClick={() => { resetForm(); setShowPhoto(true); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="mt-2 text-xs font-bold text-[var(--accent2)] underline">📸 写真から推定して入力する</button>}
                <div className="flex gap-1.5 mt-3 flex-wrap">
                  {(Object.keys(MEAL_LABEL) as MealType[]).map(t => (
                    <button key={t} onClick={() => setMealType(t)} className={`px-3 py-2 rounded-full text-sm font-bold border ${mealType === t ? "bg-[var(--accent)] text-white border-transparent" : "border-[var(--border)]"}`}>{MEAL_LABEL[t].emoji} {MEAL_LABEL[t].label}</button>
                  ))}
                </div>
                <div className="mt-3">
                  <PortionSelector label="食べた割合（既定は1食分）" value={portion} onChange={setPortion} />
                </div>
                {/* 選択中の時間帯の直近履歴（最大3件） */}
                {!editing && day.recentByType[mealType].length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-bold text-[var(--dim)]">{MEAL_LABEL[mealType].label}の最近の履歴から選ぶ</div>
                    <div className="flex gap-1.5 mt-1.5 flex-wrap">
                      {day.recentByType[mealType].map(item => (
                        <button key={item.name} onClick={() => applySuggestion(item)} className="rounded-full bg-[var(--surface2)] border border-[var(--border)] px-3 py-2 text-left">
                          <span className="block text-[13px] font-bold leading-tight">{item.name}</span>
                          <span className="block text-[11px] text-[var(--dim)]">1食分 {item.calories} kcal ・ {formatJa(item.lastDate)}{item.lastPortion !== 1 ? ` ・ 前回 ${portionLabel(item.lastPortion)}` : ""}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <label className="block mt-3 text-xs font-bold text-[var(--dim)]" htmlFor="food-name">食品名 *</label>
                <div className="relative">
                  <input id="food-name" value={name} onChange={e => { setName(e.target.value); setSuggestOpen(true); }} onFocus={() => setSuggestOpen(true)} placeholder="例：鶏の照り焼き定食" className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm" autoComplete="off" />
                  {suggestOpen && !editing && suggestions.length > 0 && name.trim().length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-lg overflow-hidden">
                      {suggestions.map(s => (
                        <button key={`${s.source}-${s.name}`} onClick={() => applySuggestion(s)} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-[var(--surface2)]">
                          <span className="min-w-0">
                            <span className="block text-sm font-bold truncate">{s.name}</span>
                            <span className="block text-[11px] text-[var(--dim)]">{s.source === "master" ? "📚 マスター登録済み" : "🕘 過去の記録"}</span>
                          </span>
                          <span className="text-sm font-black whitespace-nowrap">{s.calories}<span className="text-[10px] font-normal text-[var(--dim)]"> kcal</span></span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <label className="block mt-3 text-xs font-bold text-[var(--dim)]" htmlFor="food-cal">カロリー（kcal）* ― 1食分の値</label>
                <input id="food-cal" type="number" inputMode="numeric" value={calories} onChange={e => setCalories(e.target.value)} placeholder="例：650" className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm" />
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div><label className="block whitespace-nowrap text-xs font-bold text-[var(--dim)]" htmlFor="f-p">たんぱく質 g<span className="text-[10px] font-normal">（1食分）</span></label><input id="f-p" type="number" inputMode="decimal" value={protein} onChange={e => setProtein(e.target.value)} placeholder="任意" className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-2 py-2.5 text-sm" /></div>
                  <div><label className="block whitespace-nowrap text-xs font-bold text-[var(--dim)]" htmlFor="f-f">脂質 g<span className="text-[10px] font-normal">（1食分）</span></label><input id="f-f" type="number" inputMode="decimal" value={fat} onChange={e => setFat(e.target.value)} placeholder="任意" className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-2 py-2.5 text-sm" /></div>
                  <div><label className="block whitespace-nowrap text-xs font-bold text-[var(--dim)]" htmlFor="f-c">炭水化物 g<span className="text-[10px] font-normal">（1食分）</span></label><input id="f-c" type="number" inputMode="decimal" value={carbs} onChange={e => setCarbs(e.target.value)} placeholder="任意" className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-2 py-2.5 text-sm" /></div>
                </div>
                {calories && !Number.isNaN(Number(calories)) && (
                  <p className="mt-3 rounded-xl bg-[var(--surface2)] px-3 py-2.5 text-sm font-bold" aria-live="polite">
                    {portion === 1
                      ? `記録される量：1食分 ＝ ${scaleKcal(Number(calories), 1).toLocaleString()} kcal`
                      : `記録される量：${portionLabel(portion)} ＝ ${scaleKcal(Number(calories), portion).toLocaleString()} kcal（1食分 ${Number(calories).toLocaleString()} kcal × ${portion}）`}
                    {portion !== 1 && (protein || fat || carbs) ? <span className="block text-[11px] font-normal text-[var(--dim)] mt-0.5">P {protein ? scaleMacro(Number(protein), portion) : "—"}g ・ F {fat ? scaleMacro(Number(fat), portion) : "—"}g ・ C {carbs ? scaleMacro(Number(carbs), portion) : "—"}g で記録されます</span> : null}
                  </p>
                )}
                {(addMut.error || editMut.error) && <p className="text-xs text-red-600 mt-2">保存できませんでした。入力を確認してください。</p>}
                <div className="flex gap-2 mt-4">
                  <button disabled={!name.trim() || !calories || Number(calories) < 0 || addMut.isPending || editMut.isPending} onClick={() => editing ? editMut.mutate() : addMut.mutate({ name: name.trim(), calories: Number(calories), protein: protein ? Number(protein) : null, fat: fat ? Number(fat) : null, carbs: carbs ? Number(carbs) : null, mealType, portion, targetDate: date }, { onSuccess: resetForm })} className="flex-1 rounded-xl bg-[var(--accent)] text-white py-3 font-bold disabled:opacity-40">{editing ? "更新する" : "記録する"}</button>
                  <button onClick={resetForm} className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm font-bold">キャンセル</button>
                </div>
                {!editing && <p className="text-[11px] text-[var(--dim)] mt-2">記録するとマスター食品に自動登録されます（重複・よく似た名前は登録されません）。</p>}
              </section>
            )}

            {/* Meals grouped */}
            <section className="mt-5 space-y-4">
              {(Object.keys(MEAL_LABEL) as MealType[]).map(t => {
                const list = grouped[t];
                const subtotal = list.reduce((s, m) => s + m.calories, 0);
                const recents = day.recentByType[t];
                return (
                  <div key={t}>
                    <div className="flex items-baseline justify-between px-1">
                      <h3 className="font-display font-black">{MEAL_LABEL[t].emoji} {MEAL_LABEL[t].label}</h3>
                      <span className="text-xs font-bold text-[var(--dim)]">{list.length ? `${subtotal.toLocaleString()} kcal` : "未記録"}</span>
                    </div>
                    {recents.length > 0 && (
                      <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1 px-0.5" aria-label={`${MEAL_LABEL[t].label}の最近の履歴`}>
                        {recents.map(item => {
                          const pending = addMut.isPending && addMut.variables?.name === item.name && addMut.variables?.mealType === t && addMut.variables?.portion === instantPortion;
                          return (
                            <button key={item.name} disabled={pending} onClick={() => addRecent(item, t)} className="shrink-0 rounded-full bg-[var(--surface)] border border-[var(--border)] px-3 py-1.5 text-left shadow-sm disabled:opacity-50">
                              <span className="text-xs font-bold">＋ {item.name}</span>
                              <span className="text-[11px] text-[var(--dim)]"> {scaleKcal(item.calories, instantPortion)}kcal{instantPortion !== 1 ? `（${portionLabel(instantPortion)}）` : ""}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {list.length === 0 ? (
                      <div className="mt-1.5 rounded-2xl border border-dashed border-[var(--border)] py-3 text-center text-xs text-[var(--dim)]">まだ記録がありません</div>
                    ) : (
                      <div className="mt-1.5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
                        {list.map(m => (
                          <div key={m.id} className="flex items-center gap-2 px-3.5 py-3">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-bold truncate">{m.name}{(m.portion ?? 1) !== 1 && <span className="ml-1.5 align-middle rounded-full bg-[var(--surface2)] border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--accent)]">{portionLabel(m.portion ?? 1)}</span>}</div>
                              {(m.protein != null || m.fat != null || m.carbs != null) && <div className="text-[11px] text-[var(--dim)]">P {m.protein ?? "—"}g ・ F {m.fat ?? "—"}g ・ C {m.carbs ?? "—"}g</div>}
                            </div>
                            <span className="font-display font-black whitespace-nowrap">{m.calories.toLocaleString()}<span className="text-[10px] font-normal text-[var(--dim)]"> kcal</span></span>
                            <button aria-label={`${m.name}を編集`} onClick={() => startEdit(m)} className="text-xs font-bold text-[var(--accent)] px-1.5 py-1">編集</button>
                            <button aria-label={`${m.name}を削除`} onClick={() => { if (confirmDel === m.id) { delMut.mutate({ id: m.id, targetDate: m.date }); setConfirmDel(null); } else { setConfirmDel(m.id); setTimeout(() => setConfirmDel(null), 3000); } }} className={`text-xs font-bold px-1.5 py-1 rounded ${confirmDel === m.id ? "bg-red-500 text-white" : "text-red-500"}`}>{confirmDel === m.id ? "本当に削除" : "削除"}</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>

            {/* History chart */}
            <section className="mt-6 rounded-[24px] bg-[var(--surface)] border border-[var(--border)] p-4">
              <h3 className="font-display font-black">直近14日間の推移</h3>
              <div className="mt-3 flex items-end gap-1 h-32">
                {day.days.map(d => {
                  const max = Math.max(day.dailyGoal * 1.2, ...day.days.map(x => x.total), 1);
                  const h = Math.max(2, (d.total / max) * 100);
                  const isSel = d.date === date;
                  return (
                    <button key={d.date} aria-label={`${d.date} ${d.total}kcal`} onClick={() => setDate(d.date)} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                      <span className="text-[9px] text-[var(--dim)]">{d.total > 0 ? d.total : ""}</span>
                      <div className="w-full rounded-t-md" style={{ height: `${h}%`, minHeight: 3, background: isSel ? "var(--accent)" : d.total > day.dailyGoal ? "#dc2626" : "var(--accent2)", opacity: isSel ? 1 : 0.75 }} />
                      <span className={`text-[9px] ${isSel ? "font-black text-[var(--accent)]" : "text-[var(--dim)]"}`}>{new Date(`${d.date}T12:00:00`).getDate()}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-[var(--dim)]"><span>バーをタップするとその日を表示</span><span>目標 {day.dailyGoal.toLocaleString()} kcal</span></div>
              {(() => {
                const withData = day.days.filter(d => d.count > 0);
                const avg = withData.length ? Math.round(withData.reduce((s, d) => s + d.total, 0) / withData.length) : 0;
                return <p className="mt-2 text-xs font-bold">記録した日の平均：{avg ? `${avg.toLocaleString()} kcal` : "—"}（{withData.length}日分）</p>;
              })()}
            </section>

            {/* Weight */}
            <section className="mt-4 rounded-[24px] bg-[var(--surface)] border border-[var(--border)] p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-black">⚖️ 体重</h3>
                <button onClick={() => setShowWeightForm(v => !v)} className="text-xs font-bold text-[var(--accent)]">＋ 今日の体重を記録</button>
              </div>
              {showWeightForm && (
                <div className="flex gap-2 mt-3">
                  <input aria-label="体重 kg" type="number" inputMode="decimal" step="0.1" value={weightInput} onChange={e => setWeightInput(e.target.value)} placeholder="例：65.5" className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm" />
                  <span className="self-center text-sm text-[var(--dim)]">kg</span>
                  <button disabled={!weightInput} onClick={() => weightMut.mutate({ weight: Number(weightInput), targetDate: date })} className="rounded-xl bg-[var(--accent2)] text-white px-4 py-2.5 text-sm font-bold disabled:opacity-40">記録</button>
                </div>
              )}
              {day.weights.length > 0 ? (
                <>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="font-display text-3xl font-black">{day.weights[0]!.weight}</span><span className="text-sm text-[var(--dim)]">kg（最新：{formatJa(day.weights[0]!.date)}）</span>
                    {day.weights.length > 1 && (() => { const diff = Math.round((day.weights[0]!.weight - day.weights[day.weights.length - 1]!.weight) * 10) / 10; return <span className={`text-xs font-bold ${diff > 0 ? "text-red-500" : diff < 0 ? "text-[var(--accent2)]" : "text-[var(--dim)]"}`}>{diff > 0 ? `+${diff}` : diff} kg（最古の記録比）</span>; })()}
                  </div>
                  <div className="mt-2 divide-y divide-[var(--border)]">
                    {day.weights.slice(0, 7).map(w => (
                      <div key={w.id} className="flex items-center py-2 text-sm"><span className="flex-1 text-[var(--dim)] text-xs">{formatJa(w.date)}</span><span className="font-bold">{w.weight} kg</span><button aria-label={`${w.date}の体重を削除`} onClick={() => delWeightMut.mutate(w.id)} className="ml-2 text-xs text-red-500 font-bold">削除</button></div>
                    ))}
                  </div>
                </>
              ) : <p className="mt-2 text-xs text-[var(--dim)]">まだ体重の記録がありません。体重を記録するとここに推移が表示されます。</p>}
            </section>

            <p className="mt-6 text-center text-[11px] leading-relaxed text-[var(--dim)]">食品のカロリーは目安です。体調や健康に関する判断は、必要に応じて専門家にご相談ください。</p>
          </>
        )}
      </main>
    </div>
  );
}
