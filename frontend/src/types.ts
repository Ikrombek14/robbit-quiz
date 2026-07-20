export type SlideKind = "CONTENT" | "QUESTION";

export type QType =
  | "SINGLE"
  | "MULTIPLE"
  | "TRUE_FALSE"
  | "DROPDOWN"
  | "POLL"
  | "OPEN"
  | "FILL_BLANK"
  | "MATCH"
  | "REORDER";

export interface ChoiceOption {
  text: string;
  isCorrect: boolean;
  imageUrl?: string;
}

export interface MatchPair {
  left: string;
  right: string;
}

/* ============================================================
   Kanvas (Google Slides uslubidagi) CONTENT slayd modeli.
   Sahna doimiy 1280×720 (16:9); koordinatalar shu kanvasga
   nisbatan piksel. Hamma joyda (muharrir, Host, Join, Preview)
   scale qilib bir xil chiziladi.
   ============================================================ */
export const STAGE_W = 1280;
export const STAGE_H = 720;

export type ElementType = "text" | "image" | "shape" | "draw";
export type ShapeKind = "rect" | "ellipse" | "triangle" | "line" | "arrow";
export type TextAlign = "left" | "center" | "right";

export interface BaseElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number; // gradus
  z: number; // qatlam tartibi
}

export interface TextElement extends BaseElement {
  type: "text";
  text: string;
  font: string;
  size: number;
  color: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align: TextAlign;
  valign?: "top" | "middle" | "bottom";
  lineHeight?: number;
  bg?: string; // matn quti foni (ixtiyoriy)
  link?: string; // bosilganda ochiladigan havola (ixtiyoriy; ko'rish rejimida yangi tabda)
}

export interface ImageElement extends BaseElement {
  type: "image";
  url: string;
  fit: "cover" | "contain";
  radius?: number;
}

export interface ShapeElement extends BaseElement {
  type: "shape";
  shape: ShapeKind;
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius?: number;
}

export interface DrawElement extends BaseElement {
  type: "draw"; // Faza 2 — erkin qalam
  points: [number, number][];
  color: string;
  width: number;
}

export type SlideElement = TextElement | ImageElement | ShapeElement | DrawElement;

export interface SlideBackground {
  type: "color" | "gradient" | "image";
  value: string;
}

export interface SlideData {
  // ---- CONTENT (yangi kanvas formati) ----
  v?: 2;
  background?: SlideBackground;
  elements?: SlideElement[];
  // ---- CONTENT (eski/legacy — orqaga moslik, PDF import) ----
  title?: string;
  body?: string;
  imageUrl?: string;
  // ---- QUESTION (umumiy) ----
  text?: string;
  // SINGLE / MULTIPLE / TRUE_FALSE / DROPDOWN / POLL
  options?: ChoiceOption[];
  // OPEN
  answers?: string[];
  // FILL_BLANK — matnda "___" belgilari, har bir bo'sh joy uchun qabul qilinadigan javoblar
  blanks?: string[][];
  // MATCH
  pairs?: MatchPair[];
  // REORDER — to'g'ri tartibda saqlanadi
  items?: string[];
}

export interface Slide {
  id?: string;
  kind: SlideKind;
  type?: QType | null;
  data: SlideData;
  notes?: string | null;
  timeLimit: number;
  points: number;
}

export interface Quiz {
  id: string;
  title: string;
  description?: string | null;
  shuffle: boolean;
  mine?: boolean; // egasi yoki admin — tahrirlash mumkin
  slides: Slide[];
}

export interface QuizListItem {
  id: string;
  title: string;
  description?: string | null;
  updatedAt: string;
  folderId?: string | null;
  _count: { slides: number };
  // Admin ro'yxatda barcha o'qituvchilarning loyihalarini ko'radi — egasi ko'rsatiladi
  owner?: { id: string; name: string; email: string };
  mine?: boolean;
}

// Kutubxona papkasi
export interface FolderItem {
  id: string;
  name: string;
  parentId?: string | null;
  createdAt: string;
  count: number;
  owner?: { id: string; name: string };
  mine?: boolean;
}

export interface Teacher {
  id: string;
  email: string;
  name: string;
  picture?: string | null;
  isAdmin?: boolean;
  isSuperAdmin?: boolean; // ADMIN_EMAILS env'dagi = super admin (hamma narsa)
  approved?: boolean; // roster (ustozlar ro'yxati)ga ism-familiyasi mos kelsa
  canCreate?: boolean; // "slayd qilish" ruxsati (quiz yaratish/tahrirlash/biriktirish)
  officeAdmin?: boolean; // ofis/qabul admini — roadmap + yo'riqnoma (ustoz emas)
  hasPassword?: boolean; // parol o'rnatilganmi (Sozlamalar: joriy parol kerakmi)
  teacherRequestPending?: boolean; // ustozlik so'rovi yuborilgan, admin javobi kutilmoqda
}

// O'quvchi shaxsiy sahifasi uchun bitta o'yin natijasi (/auth/my-results)
export interface MyResult {
  id: string;
  title: string;
  mode: string; // LIVE | HOMEWORK
  playedAt: string;
  score: number;
  correctCount: number;
  totalAnswered: number;
}

// Saytga kirgan foydalanuvchi (Teacher account) — admin nazorat paneli uchun
export interface AppUser {
  id: string;
  email: string;
  name: string;
  picture?: string | null;
  isAdmin: boolean;
  approved: boolean;
  canCreate: boolean; // "slayd qilish" ruxsati
  officeAdmin: boolean; // ofis/qabul admini (roadmap + yo'riqnoma, ustoz emas)
  accessOverride: boolean | null; // null = avtomatik, true = berilgan, false = olib tashlangan
  teacherRequestAt: string | null; // ustozlik so'rovi yuborilgan vaqt (kutilayotgan bo'lsa)
  teacherRequestName: string | null; // so'rovda ko'rsatilgan ism-familiya
  envAdmin: boolean; // ADMIN_EMAILS'dagi (super admin) — huquqini panelda olib bo'lmaydi
  quizCount: number;
  createdAt: string;
}

// Rasmiy ustozlar ro'yxati (roster) elementi
export interface RosterTeacher {
  id: string;
  name: string;
  branch?: string | null;
  category?: string | null;
  phone?: string | null;
  username?: string | null;
  status?: string | null;
  order: number;
  // Platformadan foydalanish (faqat adminga keladi): null = akkaunt ochmagan
  usage?: {
    email: string;
    registeredAt: string;
    games: number; // o'tkazilgan o'yinlar soni
    quizzes: number; // yaratilgan slaydlar soni
    lastGameAt: string | null; // oxirgi o'yin sanasi
  } | null;
}

// Ustoz statistikasi (Google Sheet'dan) — bosh sahifadagi kataklar va reyting uchun
export interface TeacherStat {
  name: string;
  nameKey: string;
  branch: string | null;
  davomat: number | null; // o'quvchilar davomati, %
  uyBajarilishi: number | null; // uy vazifa bajarilishi, %
  uyTekshirilmaganSoni: number | null; // tekshirilmagan uy vazifa soni (H ustun)
  kechikish: number | null; // kechikish, daqiqa (oy varag'idagi Kechikish→Daqiqa ustunidan)
  kechikishOy: string | null; // kechikish qaysi oy varag'idan olingan (masalan "Iyun")
  ketganlar: number | null; // ketgan o'quvchilar soni
  guruhlar: number | null; // guruhlar soni
  umumiyBall: number | null; // umumiy ball
}

// Toifa tahlili (3 oylik dinamika + keyingi toifa talablari) — /stats/tahlil sahifasi
export interface MonthMetrics {
  month: string;
  uvBajarish: number | null;
  davomat: number | null;
  ketgan: number | null;
  kechUv: number | null;
  kechikish: number | null;
  umumiyBall: number | null;
}

export interface TierCheck {
  key: "uv" | "davomat" | "ketgan" | "kechUv" | "kechikish";
  label: string;
  value: number | null;
  required: number;
  direction: "min" | "max";
  ok: boolean;
}

export interface TeacherAnalysis {
  name: string;
  nameKey: string;
  branch: string | null;
  currentTier: number;
  targetTier: number;
  guruhLimit: string;
  months: MonthMetrics[];
  latestMonth: string | null;
  checks: TierCheck[];
  passed: boolean;
  isExpert: boolean;
}

export interface LeaderRow {
  nickname: string;
  score: number;
  lastGain: number;
}
