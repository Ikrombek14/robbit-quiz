import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { STAGE_W, STAGE_H } from "../types";
import type {
  SlideData, SlideElement, TextElement, ShapeElement, ImageElement, ShapeKind, TextAlign,
} from "../types";
import { ElementVisual, bgStyle, normalizeToCanvas } from "./SlideScene";
import { uploadBlob } from "../api";

/* ============================================================
   SlideCanvasEditor — Google Slides uslubidagi kanvas muharriri.
   DOM + scene graph: har element joylashtirilgan div/SVG.
   Kutubxonasiz — sudrash/o'lcham/burish pointer event delta bilan.
   value/onChange — boshqariladigan (controlled). Undo/redo ichkarida.
   ============================================================ */

const FONTS = ["Inter", "Montserrat", "Roboto", "Georgia", "Caveat", "Lobster"];
const SWATCHES = ["#3c3633", "#ffffff", "#e8772e", "#2f6df0", "#1faa4b", "#e0a800", "#ec4899", "#2c2f3d"];
const SHAPES: { kind: ShapeKind; label: string; icon: string }[] = [
  { kind: "rect", label: "To'rtburchak", icon: "rectangle" },
  { kind: "ellipse", label: "Doira", icon: "circle" },
  { kind: "triangle", label: "Uchburchak", icon: "change_history" },
  { kind: "line", label: "Chiziq", icon: "horizontal_rule" },
  { kind: "arrow", label: "Strelka", icon: "arrow_forward" },
];

let _seq = 0;
function eid(): string {
  _seq += 1;
  return `e${Date.now().toString(36)}${_seq}`;
}

type Dir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export default function SlideCanvasEditor({
  value,
  onChange,
}: {
  value: SlideData;
  onChange: (d: SlideData) => void;
}) {
  const norm = normalizeToCanvas(value);
  const elements = norm.elements;
  const background = norm.background;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [shapeMenu, setShapeMenu] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  // value'ning eng so'nggi nusxasi (gesture'lar uchun)
  const valueRef = useRef(value);
  valueRef.current = value;

  // ---- Undo / redo ----
  const pastRef = useRef<SlideData[]>([]);
  const futureRef = useRef<SlideData[]>([]);
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  const pushUndo = useCallback((snapshot: SlideData) => {
    pastRef.current.push(snapshot);
    if (pastRef.current.length > 60) pastRef.current.shift();
    futureRef.current = [];
  }, []);

  // Kanvas formatidagi to'liq data'ni qaytaramiz (legacy maydonlarni tashlab)
  const writeCanvas = useCallback(
    (els: SlideElement[], bg = background) => {
      onChange({ ...valueRef.current, v: 2, background: bg, elements: els, title: undefined, body: undefined, imageUrl: undefined });
    },
    [background, onChange],
  );

  // Diskret o'zgarish (undo'ga yoziladi)
  const commit = useCallback(
    (els: SlideElement[], bg = background) => {
      pushUndo(valueRef.current);
      writeCanvas(els, bg);
    },
    [background, pushUndo, writeCanvas],
  );

  const undo = useCallback(() => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push(valueRef.current);
    onChange(prev);
    setSelectedId(null);
    setEditingId(null);
    rerender();
  }, [onChange]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(valueRef.current);
    onChange(next);
    setSelectedId(null);
    setEditingId(null);
    rerender();
  }, [onChange]);

  // ---- Scale o'lchash ----
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setScale(el.clientWidth / STAGE_W);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const selected = elements.find((e) => e.id === selectedId) ?? null;

  // ---- Elementlarni o'zgartirish yordamchilari ----
  function updateEl(id: string, patch: Partial<SlideElement>, undoable = true) {
    const els = valueRef.current.elements ?? elements;
    const next = els.map((e) => (e.id === id ? ({ ...e, ...patch } as SlideElement) : e));
    if (undoable) commit(next);
    else writeCanvas(next);
  }

  function addElement(el: SlideElement) {
    const els = valueRef.current.elements ?? elements;
    const maxZ = els.reduce((m, e) => Math.max(m, e.z), 0);
    commit([...els, { ...el, z: maxZ + 1 }]);
    setSelectedId(el.id);
  }

  function removeEl(id: string) {
    commit((valueRef.current.elements ?? elements).filter((e) => e.id !== id));
    setSelectedId(null);
    setEditingId(null);
  }

  function duplicateEl(id: string) {
    const src = (valueRef.current.elements ?? elements).find((e) => e.id === id);
    if (!src) return;
    const copy = { ...src, id: eid(), x: src.x + 24, y: src.y + 24 } as SlideElement;
    addElement(copy);
  }

  function setZ(id: string, dir: "front" | "back") {
    const els = valueRef.current.elements ?? elements;
    const zs = els.map((e) => e.z);
    const target = dir === "front" ? Math.max(...zs) + 1 : Math.min(...zs) - 1;
    updateEl(id, { z: target });
  }

  // ---- Element qo'shish ----
  function addText() {
    addElement({
      id: eid(), type: "text", text: "Matn", font: "Inter", size: 40, color: "#3c3633",
      align: "left", valign: "top", x: STAGE_W / 2 - 200, y: STAGE_H / 2 - 40, w: 400, h: 90, rotation: 0, z: 0,
    });
  }

  function addShape(kind: ShapeKind) {
    setShapeMenu(false);
    const isLine = kind === "line" || kind === "arrow";
    addElement({
      id: eid(), type: "shape", shape: kind, fill: kind === "line" || kind === "arrow" ? "transparent" : "#e8772e",
      stroke: "#2c2f3d", strokeWidth: isLine ? 4 : 0,
      x: STAGE_W / 2 - 160, y: STAGE_H / 2 - (isLine ? 10 : 110), w: 320, h: isLine ? 20 : 220, rotation: 0, z: 0,
    } as ShapeElement);
  }

  const fileRef = useRef<HTMLInputElement>(null);
  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!f) return;
    try {
      const url = await uploadBlob(f, f.name);
      const img = new Image();
      img.onload = () => {
        const ratio = img.width / img.height || 1.5;
        let w = 520, h = w / ratio;
        if (h > 560) { h = 560; w = h * ratio; }
        addElement({ id: eid(), type: "image", url, fit: "contain", x: STAGE_W / 2 - w / 2, y: STAGE_H / 2 - h / 2, w, h, rotation: 0, z: 0 });
      };
      img.onerror = () => addElement({ id: eid(), type: "image", url, fit: "contain", x: 340, y: 160, w: 600, h: 400, rotation: 0, z: 0 });
      img.src = url;
    } catch {
      /* yuklash xatosi — jim o'tamiz */
    }
  }

  function setBackground(value: string) {
    commit(valueRef.current.elements ?? elements, { type: "color", value });
  }

  // ---- Pointer: ko'chirish / o'lcham / burish ----
  const gestureSnap = useRef<SlideData | null>(null);

  function beginGesture() {
    gestureSnap.current = valueRef.current;
  }
  function endGesture() {
    // Faqat haqiqatan o'zgargan bo'lsa undo'ga yozamiz (havola almashgani = onChange chaqirilgan)
    if (gestureSnap.current && gestureSnap.current !== valueRef.current) {
      pushUndo(gestureSnap.current);
    }
    gestureSnap.current = null;
  }

  function startMove(e: React.PointerEvent, el: SlideElement) {
    if (editingId === el.id) return;
    e.stopPropagation();
    setSelectedId(el.id);
    const startX = e.clientX, startY = e.clientY;
    const ox = el.x, oy = el.y;
    beginGesture();
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      updateEl(el.id, { x: Math.round(ox + dx), y: Math.round(oy + dy) }, false);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      endGesture();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function startResize(e: React.PointerEvent, el: SlideElement, dir: Dir) {
    e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    const o = { x: el.x, y: el.y, w: el.w, h: el.h };
    beginGesture();
    const move = (ev: PointerEvent) => {
      let dx = (ev.clientX - startX) / scale;
      let dy = (ev.clientY - startY) / scale;
      let { x, y, w, h } = o;
      if (dir.includes("e")) w = Math.max(20, o.w + dx);
      if (dir.includes("s")) h = Math.max(20, o.h + dy);
      if (dir.includes("w")) { w = Math.max(20, o.w - dx); x = o.x + (o.w - w); }
      if (dir.includes("n")) { h = Math.max(20, o.h - dy); y = o.y + (o.h - h); }
      updateEl(el.id, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }, false);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      endGesture();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function startRotate(e: React.PointerEvent, el: SlideElement) {
    e.stopPropagation();
    const rect = wrapRef.current!.getBoundingClientRect();
    const cx = rect.left + (el.x + el.w / 2) * scale;
    const cy = rect.top + (el.y + el.h / 2) * scale;
    beginGesture();
    const move = (ev: PointerEvent) => {
      const ang = Math.atan2(ev.clientY - cy, ev.clientX - cx) * (180 / Math.PI) + 90;
      updateEl(el.id, { rotation: Math.round(ang) }, false);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      endGesture();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ---- Klaviatura ----
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || editingId;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
      if (typing) return;
      if (!selectedId) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") { e.preventDefault(); duplicateEl(selectedId); return; }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeEl(selectedId); return; }
      const step = e.shiftKey ? 10 : 1;
      const cur = (valueRef.current.elements ?? elements).find((x) => x.id === selectedId);
      if (!cur) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); updateEl(selectedId, { x: cur.x - step }); }
      if (e.key === "ArrowRight") { e.preventDefault(); updateEl(selectedId, { x: cur.x + step }); }
      if (e.key === "ArrowUp") { e.preventDefault(); updateEl(selectedId, { y: cur.y - step }); }
      if (e.key === "ArrowDown") { e.preventDefault(); updateEl(selectedId, { y: cur.y + step }); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, editingId, undo, redo]);

  const ordered = [...elements].sort((a, b) => a.z - b.z);
  const handles: Dir[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

  return (
    <div className="sce">
      {/* ---- Toolbar ---- */}
      <div className="sce-toolbar">
        <button className="sce-tool" onClick={addText} title="Matn qo'shish">
          <span className="material-symbols-outlined">title</span> Matn
        </button>
        <button className="sce-tool" onClick={() => fileRef.current?.click()} title="Rasm qo'shish">
          <span className="material-symbols-outlined">image</span> Rasm
        </button>
        <div style={{ position: "relative" }}>
          <button className="sce-tool" onClick={() => setShapeMenu((o) => !o)} title="Shakl qo'shish">
            <span className="material-symbols-outlined">category</span> Shakl
          </button>
          {shapeMenu && (
            <div className="sce-menu">
              {SHAPES.map((s) => (
                <button key={s.kind} className="sce-menu-item" onClick={() => addShape(s.kind)}>
                  <span className="material-symbols-outlined">{s.icon}</span> {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <label className="sce-tool" title="Fon rangi" style={{ cursor: "pointer" }}>
          <span className="material-symbols-outlined">format_color_fill</span> Fon
          <input type="color" value={background.type === "color" ? background.value : "#ffffff"} onChange={(e) => setBackground(e.target.value)} style={{ width: 0, height: 0, opacity: 0, position: "absolute" }} />
        </label>
        <div className="sce-spacer" />
        <button className="sce-icon" onClick={undo} disabled={pastRef.current.length === 0} title="Orqaga (Ctrl+Z)">
          <span className="material-symbols-outlined">undo</span>
        </button>
        <button className="sce-icon" onClick={redo} disabled={futureRef.current.length === 0} title="Oldinga (Ctrl+Y)">
          <span className="material-symbols-outlined">redo</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={onPickImage} style={{ display: "none" }} />
      </div>

      {/* ---- Kontekst paneli (tanlangan element) ---- */}
      {selected && (
        <InspectorBar
          el={selected}
          onPatch={(p) => updateEl(selected.id, p)}
          onDelete={() => removeEl(selected.id)}
          onDuplicate={() => duplicateEl(selected.id)}
          onZ={(d) => setZ(selected.id, d)}
        />
      )}

      {/* ---- Sahna ---- */}
      <div className="sce-stage-wrap">
        <div
          ref={wrapRef}
          className="sce-stage-box"
          style={{ aspectRatio: `${STAGE_W} / ${STAGE_H}` }}
          onPointerDown={() => { setSelectedId(null); setEditingId(null); }}
        >
          <div className="sce-stage" style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})`, transformOrigin: "top left", ...bgStyle(background) }}>
            {ordered.map((el) => {
              const isSel = el.id === selectedId;
              const isEditing = editingId === el.id && el.type === "text";
              return (
                <div
                  key={el.id}
                  className={`sce-el ${isSel ? "sel" : ""}`}
                  style={{ position: "absolute", left: el.x, top: el.y, width: el.w, height: el.h, transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined, transformOrigin: "center center" }}
                  onPointerDown={(e) => startMove(e, el)}
                  onDoubleClick={(e) => { e.stopPropagation(); if (el.type === "text") { setSelectedId(el.id); setEditingId(el.id); } }}
                >
                  {isEditing ? (
                    <TextEditBox el={el as TextElement} onChange={(text) => updateEl(el.id, { text }, false)} onCommit={() => { endGesture(); setEditingId(null); }} onStart={() => beginGesture()} />
                  ) : (
                    <ElementVisual el={el} />
                  )}

                  {isSel && !isEditing && (
                    <>
                      <div className="sce-rotate" onPointerDown={(e) => startRotate(e, el)} title="Burish">
                        <span className="material-symbols-outlined">refresh</span>
                      </div>
                      {handles.map((d) => (
                        <span key={d} className={`sce-handle h-${d}`} onPointerDown={(e) => startResize(e, el, d)} />
                      ))}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {elements.length === 0 && (
          <div className="sce-empty">Bo'sh slayd — yuqoridan matn, rasm yoki shakl qo'shing.</div>
        )}
      </div>
    </div>
  );
}

/* ---- Matnni joyida tahrirlash ---- */
function TextEditBox({
  el, onChange, onCommit, onStart,
}: {
  el: TextElement; onChange: (text: string) => void; onCommit: () => void; onStart: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    onStart();
    ref.current?.focus();
    ref.current?.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <textarea
      ref={ref}
      value={el.text}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => { if (e.key === "Escape") onCommit(); }}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        width: "100%", height: "100%", margin: 0, padding: 6, border: "none", resize: "none", outline: "none",
        background: el.bg || "transparent", color: el.color,
        fontFamily: `${el.font}, Inter, sans-serif`, fontSize: el.size, fontWeight: el.bold ? 700 : 400,
        fontStyle: el.italic ? "italic" : "normal", textDecoration: el.underline ? "underline" : "none",
        textAlign: el.align, lineHeight: el.lineHeight ?? 1.25, boxSizing: "border-box", overflow: "hidden",
      }}
    />
  );
}

/* ---- Kontekst paneli (tanlangan element xususiyatlari) ---- */
function InspectorBar({
  el, onPatch, onDelete, onDuplicate, onZ,
}: {
  el: SlideElement;
  onPatch: (p: Partial<SlideElement>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onZ: (d: "front" | "back") => void;
}) {
  return (
    <div className="sce-inspector">
      {el.type === "text" && <TextControls el={el as TextElement} onPatch={onPatch} />}
      {el.type === "shape" && <ShapeControls el={el as ShapeElement} onPatch={onPatch} />}
      {el.type === "image" && <ImageControls el={el as ImageElement} onPatch={onPatch} />}

      <div className="sce-spacer" />
      <button className="sce-icon" title="Oldinga" onClick={() => onZ("front")}><span className="material-symbols-outlined">flip_to_front</span></button>
      <button className="sce-icon" title="Orqaga" onClick={() => onZ("back")}><span className="material-symbols-outlined">flip_to_back</span></button>
      <button className="sce-icon" title="Nusxalash (Ctrl+D)" onClick={onDuplicate}><span className="material-symbols-outlined">content_copy</span></button>
      <button className="sce-icon danger" title="O'chirish (Delete)" onClick={onDelete}><span className="material-symbols-outlined">delete</span></button>
    </div>
  );
}

function ColorPick({ value, onChange, title }: { value: string; onChange: (v: string) => void; title: string }) {
  return (
    <label className="sce-color" title={title} style={{ background: value === "transparent" ? "#fff" : value }}>
      <input type="color" value={value === "transparent" ? "#ffffff" : value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function TextControls({ el, onPatch }: { el: TextElement; onPatch: (p: Partial<TextElement>) => void }) {
  const aligns: TextAlign[] = ["left", "center", "right"];
  const alignIcon: Record<TextAlign, string> = { left: "format_align_left", center: "format_align_center", right: "format_align_right" };
  return (
    <>
      <select className="sce-select" value={el.font} onChange={(e) => onPatch({ font: e.target.value })} style={{ fontFamily: el.font }}>
        {FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
      </select>
      <input className="sce-num" type="number" min={8} max={200} value={el.size} onChange={(e) => onPatch({ size: Number(e.target.value) || 12 })} title="O'lcham" />
      <button className={`sce-icon ${el.bold ? "on" : ""}`} title="Qalin" onClick={() => onPatch({ bold: !el.bold })}><span className="material-symbols-outlined">format_bold</span></button>
      <button className={`sce-icon ${el.italic ? "on" : ""}`} title="Qiya" onClick={() => onPatch({ italic: !el.italic })}><span className="material-symbols-outlined">format_italic</span></button>
      <button className={`sce-icon ${el.underline ? "on" : ""}`} title="Tagchiziq" onClick={() => onPatch({ underline: !el.underline })}><span className="material-symbols-outlined">format_underlined</span></button>
      {aligns.map((a) => (
        <button key={a} className={`sce-icon ${el.align === a ? "on" : ""}`} title="Tekislash" onClick={() => onPatch({ align: a })}>
          <span className="material-symbols-outlined">{alignIcon[a]}</span>
        </button>
      ))}
      <ColorPick value={el.color} onChange={(v) => onPatch({ color: v })} title="Matn rangi" />
      <div className="sce-swatches">
        {SWATCHES.map((c) => <button key={c} className="sce-swatch" style={{ background: c }} onClick={() => onPatch({ color: c })} />)}
      </div>
    </>
  );
}

function ShapeControls({ el, onPatch }: { el: ShapeElement; onPatch: (p: Partial<ShapeElement>) => void }) {
  const isLine = el.shape === "line" || el.shape === "arrow";
  return (
    <>
      {!isLine && (
        <span className="sce-field"><span className="sce-lbl">To'ldirish</span><ColorPick value={el.fill} onChange={(v) => onPatch({ fill: v })} title="To'ldirish rangi" /></span>
      )}
      <span className="sce-field"><span className="sce-lbl">Chiziq</span><ColorPick value={el.stroke} onChange={(v) => onPatch({ stroke: v })} title="Chiziq rangi" /></span>
      <input className="sce-num" type="number" min={0} max={40} value={el.strokeWidth} onChange={(e) => onPatch({ strokeWidth: Number(e.target.value) || 0 })} title="Chiziq qalinligi" />
      {el.shape === "rect" && (
        <input className="sce-num" type="number" min={0} max={200} value={el.radius ?? 0} onChange={(e) => onPatch({ radius: Number(e.target.value) || 0 })} title="Burchak radiusi" />
      )}
    </>
  );
}

function ImageControls({ el, onPatch }: { el: ImageElement; onPatch: (p: Partial<ImageElement>) => void }) {
  return (
    <>
      <button className={`sce-tool ${el.fit === "contain" ? "on" : ""}`} onClick={() => onPatch({ fit: "contain" })}>To'liq</button>
      <button className={`sce-tool ${el.fit === "cover" ? "on" : ""}`} onClick={() => onPatch({ fit: "cover" })}>To'ldirish</button>
      <input className="sce-num" type="number" min={0} max={400} value={el.radius ?? 0} onChange={(e) => onPatch({ radius: Number(e.target.value) || 0 })} title="Burchak radiusi" />
    </>
  );
}
