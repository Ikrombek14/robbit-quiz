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
  slides: Slide[];
}

export interface QuizListItem {
  id: string;
  title: string;
  description?: string | null;
  updatedAt: string;
  _count: { slides: number };
  // Admin ro'yxatda barcha o'qituvchilarning loyihalarini ko'radi — egasi ko'rsatiladi
  owner?: { id: string; name: string; email: string };
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
  hasPassword?: boolean; // parol o'rnatilganmi (Sozlamalar: joriy parol kerakmi)
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
  accessOverride: boolean | null; // null = avtomatik, true = berilgan, false = olib tashlangan
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
}

// Ustoz statistikasi (Google Sheet'dan) — bosh sahifadagi kataklar va reyting uchun
export interface TeacherStat {
  name: string;
  nameKey: string;
  branch: string | null;
  davomat: number | null; // o'quvchilar davomati, %
  uyBajarilishi: number | null; // uy vazifa bajarilishi, %
  uyTekshirilmaganSoni: number | null; // tekshirilmagan uy vazifa soni (H ustun)
  kechikish: number | null; // kechikish, daqiqa
  ketganlar: number | null; // ketgan o'quvchilar soni
  guruhlar: number | null; // guruhlar soni
  umumiyBall: number | null; // umumiy ball
}

export interface LeaderRow {
  nickname: string;
  score: number;
  lastGain: number;
}
