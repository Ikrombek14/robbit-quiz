import { useEffect, useRef, useState, type CSSProperties } from "react";
import { STAGE_W, STAGE_H } from "../types";
import type { SlideData, SlideBackground, SlideElement, ShapeElement, TextElement, ImageElement, DrawElement } from "../types";

/* ============================================================
   SlideScene — kanvas slaydni faqat o'qish (read-only) chizadi.
   Bitta manba: muharrir, Host, Join, Preview, thumbnail hammasi
   shu komponentdan (va ElementVisual'dan) foydalanadi → ko'rinish
   hamma joyda bir xil. Sahna 1280×720; kenglikka qarab scale.
   ============================================================ */

function isCanvas(data: SlideData): boolean {
  return Array.isArray(data.elements);
}

// Eski formatni (title/body/imageUrl) kanvas elementlariga aylantiramiz.
function legacyToElements(data: SlideData): { background: SlideData["background"]; elements: SlideElement[] } {
  const elements: SlideElement[] = [];
  if (data.imageUrl) {
    elements.push({ id: "legacy-img", type: "image", url: data.imageUrl, fit: "contain", x: 0, y: 0, w: STAGE_W, h: STAGE_H, rotation: 0, z: 0 });
  } else {
    if (data.title) {
      elements.push({ id: "legacy-title", type: "text", text: data.title, font: "Inter", size: 56, color: "#1d1c0f", bold: true, align: "center", valign: "middle", x: 120, y: 200, w: STAGE_W - 240, h: 160, rotation: 0, z: 1 });
    }
    if (data.body) {
      elements.push({ id: "legacy-body", type: "text", text: data.body, font: "Inter", size: 30, color: "#3c3633", align: "center", valign: "middle", x: 160, y: 380, w: STAGE_W - 320, h: 220, rotation: 0, z: 0 });
    }
  }
  return { background: { type: "color", value: "#ffffff" }, elements };
}

// Har qanday slayd data'sini kanvas modeliga keltiradi (legacy ham).
export function normalizeToCanvas(data: SlideData): { background: SlideBackground; elements: SlideElement[] } {
  if (isCanvas(data)) {
    return {
      background: data.background ?? { type: "color", value: "#ffffff" },
      elements: data.elements ?? [],
    };
  }
  const leg = legacyToElements(data);
  return { background: leg.background ?? { type: "color", value: "#ffffff" }, elements: leg.elements };
}

export function bgStyle(bg: SlideData["background"]): CSSProperties {
  if (!bg) return { background: "#ffffff" };
  if (bg.type === "image") return { backgroundImage: `url(${bg.value})`, backgroundSize: "cover", backgroundPosition: "center" };
  return { background: bg.value };
}

/* Element ichki vizuali — qutini 100% to'ldiradi (joylashuvsiz).
   Ham SlideScene, ham muharrir shu komponentni ishlatadi. */
export function ElementVisual({ el }: { el: SlideElement }) {
  if (el.type === "text") {
    const t = el as TextElement;
    const valign = t.valign ?? "top";
    return (
      <div
        style={{
          width: "100%", height: "100%",
          display: "flex", flexDirection: "column",
          justifyContent: valign === "middle" ? "center" : valign === "bottom" ? "flex-end" : "flex-start",
          background: t.bg || "transparent",
          color: t.color,
          fontFamily: `${t.font}, Inter, sans-serif`,
          fontSize: t.size,
          fontWeight: t.bold ? 700 : 400,
          fontStyle: t.italic ? "italic" : "normal",
          textDecoration: t.underline ? "underline" : "none",
          textAlign: t.align,
          lineHeight: t.lineHeight ?? 1.25,
          whiteSpace: "pre-wrap", wordBreak: "break-word", overflow: "hidden",
          padding: 6, borderRadius: t.bg ? 8 : 0, boxSizing: "border-box",
        }}
      >
        {t.text}
      </div>
    );
  }

  if (el.type === "image") {
    const im = el as ImageElement;
    return <img src={im.url} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: im.fit, borderRadius: im.radius ?? 0, display: "block" }} />;
  }

  if (el.type === "shape") {
    const s = el as ShapeElement;
    const { fill, stroke, strokeWidth } = s;
    if (s.shape === "rect") {
      return <div style={{ width: "100%", height: "100%", background: fill, border: strokeWidth ? `${strokeWidth}px solid ${stroke}` : undefined, borderRadius: s.radius ?? 0, boxSizing: "border-box" }} />;
    }
    if (s.shape === "ellipse") {
      return <div style={{ width: "100%", height: "100%", background: fill, border: strokeWidth ? `${strokeWidth}px solid ${stroke}` : undefined, borderRadius: "50%", boxSizing: "border-box" }} />;
    }
    if (s.shape === "triangle") {
      return (
        <svg width="100%" height="100%" viewBox={`0 0 ${s.w} ${s.h}`} preserveAspectRatio="none" style={{ overflow: "visible" }}>
          <polygon points={`${s.w / 2},0 ${s.w},${s.h} 0,${s.h}`} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        </svg>
      );
    }
    if (s.shape === "line") {
      return (
        <svg width="100%" height="100%" viewBox={`0 0 ${s.w} ${s.h}`} preserveAspectRatio="none" style={{ overflow: "visible" }}>
          <line x1={0} y1={s.h / 2} x2={s.w} y2={s.h / 2} stroke={stroke || fill} strokeWidth={Math.max(strokeWidth, 2)} strokeLinecap="round" />
        </svg>
      );
    }
    // arrow
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${s.w} ${s.h}`} preserveAspectRatio="none" style={{ overflow: "visible" }}>
        <line x1={0} y1={s.h / 2} x2={s.w - 14} y2={s.h / 2} stroke={stroke || fill} strokeWidth={Math.max(strokeWidth, 2)} strokeLinecap="round" />
        <polygon points={`${s.w},${s.h / 2} ${s.w - 18},${s.h / 2 - 10} ${s.w - 18},${s.h / 2 + 10}`} fill={stroke || fill} />
      </svg>
    );
  }

  if (el.type === "draw") {
    const d = el as DrawElement;
    const pts = d.points.map((p) => p.join(",")).join(" ");
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${d.w} ${d.h}`} preserveAspectRatio="none" style={{ overflow: "visible" }}>
        <polyline points={pts} fill="none" stroke={d.color} strokeWidth={d.width} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return null;
}

function PositionedElement({ el }: { el: SlideElement }) {
  return (
    <div
      style={{
        position: "absolute", left: el.x, top: el.y, width: el.w, height: el.h,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined, transformOrigin: "center center",
      }}
    >
      <ElementVisual el={el} />
    </div>
  );
}

/**
 * width berilsa — shu kenglikka scale. Berilmasa — ota konteynerga moslashadi.
 */
export default function SlideScene({
  data,
  width,
  className,
  rounded = 14,
}: {
  data: SlideData;
  width?: number;
  className?: string;
  rounded?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [autoW, setAutoW] = useState(width ?? STAGE_W);

  useEffect(() => {
    if (width) {
      setAutoW(width);
      return;
    }
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setAutoW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  const scale = autoW / STAGE_W;
  const canvas = isCanvas(data)
    ? { background: data.background, elements: data.elements ?? [] }
    : legacyToElements(data);

  const ordered = [...canvas.elements].sort((a, b) => a.z - b.z);

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{ width: width ?? "100%", height: (width ?? autoW) * (STAGE_H / STAGE_W), position: "relative", overflow: "hidden", borderRadius: rounded }}
    >
      <div
        style={{
          position: "absolute", top: 0, left: 0, width: STAGE_W, height: STAGE_H,
          transform: `scale(${scale})`, transformOrigin: "top left", ...bgStyle(canvas.background),
        }}
      >
        {ordered.map((el) => (
          <PositionedElement key={el.id} el={el} />
        ))}
      </div>
    </div>
  );
}
