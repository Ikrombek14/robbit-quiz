import type {
  Slide, SlideData, SlideElement, BaseElement,
  TextElement, ImageElement, ShapeElement, DrawElement,
} from "./types";
import { STAGE_W, STAGE_H } from "./types";

/* ============================================================
   Slayd shablonlari — Google Slides uslubidagi tayyor layout'lar.
   Har biri kanvas formatidagi SlideData qaytaradi.
   Ranglar index.css brendiga uyg'un (terakota/krem/navy).
   ============================================================ */

const INK = "#3c3633";
const MUTED = "#8c817a";
const PRIMARY = "#e8772e";
const CREAM = "#faf6f0";
const NAVY = "#2c2f3d";
const WHITE = "#ffffff";

let _seq = 0;
function eid(): string {
  _seq += 1;
  return `e${Date.now().toString(36)}${_seq}`;
}

// Element yaratishda id/rotation/z ni avtomatik to'ldiruvchi yordamchi.
// Diskriminatsiyalangan union har bir a'zo uchun alohida Omit (aks holda
// turga xos maydonlar yo'qoladi).
type AutoFields = Partial<Pick<BaseElement, "id" | "rotation" | "z">>;
type ElInput =
  | (Omit<TextElement, "id" | "rotation" | "z"> & AutoFields)
  | (Omit<ImageElement, "id" | "rotation" | "z"> & AutoFields)
  | (Omit<ShapeElement, "id" | "rotation" | "z"> & AutoFields)
  | (Omit<DrawElement, "id" | "rotation" | "z"> & AutoFields);

function el(e: ElInput): SlideElement {
  return { ...e, id: e.id ?? eid(), rotation: e.rotation ?? 0, z: e.z ?? 0 } as SlideElement;
}

export interface TemplateDef {
  key: string;
  label: string;
  build: () => SlideData;
}

export const SLIDE_TEMPLATES: TemplateDef[] = [
  {
    key: "blank",
    label: "Bo'sh",
    build: () => ({ v: 2, background: { type: "color", value: WHITE }, elements: [] }),
  },
  {
    key: "title",
    label: "Sarlavha slayd",
    build: () => ({
      v: 2,
      background: { type: "color", value: CREAM },
      elements: [
        el({ type: "shape", shape: "rect", x: 0, y: 560, w: STAGE_W, h: 16, fill: PRIMARY, stroke: "transparent", strokeWidth: 0, z: 0 }),
        el({ type: "text", text: "Dars mavzusi", font: "Montserrat", size: 72, color: INK, bold: true, align: "center", valign: "middle", x: 140, y: 240, w: STAGE_W - 280, h: 160, z: 1 }),
        el({ type: "text", text: "Kichik izoh yoki ism", font: "Inter", size: 32, color: MUTED, align: "center", valign: "middle", x: 200, y: 410, w: STAGE_W - 400, h: 70, z: 1 }),
      ],
    }),
  },
  {
    key: "title-content",
    label: "Sarlavha + matn",
    build: () => ({
      v: 2,
      background: { type: "color", value: WHITE },
      elements: [
        el({ type: "text", text: "Sarlavha", font: "Montserrat", size: 52, color: INK, bold: true, align: "left", x: 90, y: 70, w: STAGE_W - 180, h: 90, z: 1 }),
        el({ type: "shape", shape: "rect", x: 90, y: 168, w: 120, h: 8, fill: PRIMARY, stroke: "transparent", strokeWidth: 0, z: 0 }),
        el({ type: "text", text: "• Birinchi fikr\n• Ikkinchi fikr\n• Uchinchi fikr", font: "Inter", size: 34, color: INK, align: "left", lineHeight: 1.6, x: 90, y: 220, w: STAGE_W - 180, h: 420, z: 1 }),
      ],
    }),
  },
  {
    key: "two-column",
    label: "Ikki ustun",
    build: () => ({
      v: 2,
      background: { type: "color", value: WHITE },
      elements: [
        el({ type: "text", text: "Sarlavha", font: "Montserrat", size: 48, color: INK, bold: true, align: "left", x: 90, y: 60, w: STAGE_W - 180, h: 80, z: 1 }),
        el({ type: "text", text: "Chap ustun matni", font: "Inter", size: 30, color: INK, align: "left", lineHeight: 1.5, x: 90, y: 190, w: 520, h: 440, z: 1 }),
        el({ type: "text", text: "O'ng ustun matni", font: "Inter", size: 30, color: INK, align: "left", lineHeight: 1.5, x: 670, y: 190, w: 520, h: 440, z: 1 }),
      ],
    }),
  },
  {
    key: "section",
    label: "Bo'lim sarlavhasi",
    build: () => ({
      v: 2,
      background: { type: "color", value: NAVY },
      elements: [
        el({ type: "text", text: "Yangi bo'lim", font: "Montserrat", size: 80, color: WHITE, bold: true, align: "center", valign: "middle", x: 120, y: 280, w: STAGE_W - 240, h: 160, z: 1 }),
        el({ type: "shape", shape: "rect", x: STAGE_W / 2 - 60, y: 470, w: 120, h: 8, fill: PRIMARY, stroke: "transparent", strokeWidth: 0, z: 0 }),
      ],
    }),
  },
  {
    key: "image-caption",
    label: "Rasm + izoh",
    build: () => ({
      v: 2,
      background: { type: "color", value: WHITE },
      elements: [
        el({ type: "shape", shape: "rect", x: 90, y: 90, w: 700, h: STAGE_H - 180, fill: "#ece9d4", stroke: "#e6dccb", strokeWidth: 2, radius: 16, z: 0 }),
        el({ type: "text", text: "🖼️ Rasmni shu yerga qo'ying", font: "Inter", size: 24, color: MUTED, align: "center", valign: "middle", x: 90, y: 90, w: 700, h: STAGE_H - 180, z: 1 }),
        el({ type: "text", text: "Izoh sarlavhasi", font: "Montserrat", size: 44, color: INK, bold: true, align: "left", x: 840, y: 200, w: 350, h: 120, z: 1 }),
        el({ type: "text", text: "Rasm haqida qisqacha tushuntirish.", font: "Inter", size: 28, color: INK, align: "left", lineHeight: 1.5, x: 840, y: 340, w: 350, h: 220, z: 1 }),
      ],
    }),
  },
];

export function buildTemplateData(key: string): SlideData {
  const t = SLIDE_TEMPLATES.find((x) => x.key === key) ?? SLIDE_TEMPLATES[0];
  return t.build();
}

export function newContentSlideFromTemplate(key: string): Slide {
  return {
    kind: "CONTENT",
    type: null,
    data: buildTemplateData(key),
    timeLimit: 20,
    points: 0,
    notes: "",
  };
}
