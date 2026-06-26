import SlideScene from "./SlideScene";
import type { SlideData } from "../types";

// Eski API'ni saqlab qolish uchun ingichka o'ram — endi SlideScene'ga delegatsiya qiladi.
// Yangi kod to'g'ridan-to'g'ri <SlideScene data={...} /> ishlatishi kerak.
export default function SlideCanvas({
  title,
  body,
  imageUrl,
  data,
  className,
}: {
  title?: string;
  body?: string;
  imageUrl?: string;
  data?: SlideData;
  className?: string;
}) {
  const d: SlideData = data ?? { title, body, imageUrl };
  return <SlideScene data={d} className={className} />;
}
