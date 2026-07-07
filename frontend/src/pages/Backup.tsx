import { useRef, useState } from "react";
import { api } from "../api";
import Shell from "../components/Shell";
import PdfSlide from "../components/PdfSlide";
import type { Slide } from "../types";

// Offline zaxira sahifasi (faqat admin).
// ZIP tarkibi: manifest.json + README.md + data/backup.json (butun baza) +
// uploads/ (slaydlardagi rasmlar) + pdf/ (darslar slaydlari, odam o'qiydigan ko'rinishda).
// Xuddi shu ZIP'ni pastdagi "Tiklash" bo'limiga yuklasa — yo'q yozuvlar qayta yaratiladi.

interface BSlide {
  id: string;
  order: number;
  kind: string;
  type: string | null;
  data: unknown;
  notes?: string | null;
  timeLimit: number;
  points: number;
}
interface BQuiz {
  id: string;
  title: string;
  teacherId: string;
  slides: BSlide[];
}
interface BLesson {
  id: string;
  subject: string;
  ageGroup: string;
  year: number;
  section: string | null;
  order: number;
  title: string;
  quizId: string | null;
}
interface BackupData {
  format: string;
  version: number;
  exportedAt: string;
  counts: Record<string, number>;
  teachers: { id: string; name: string }[];
  quizzes: BQuiz[];
  lessonPlans: BLesson[];
  [k: string]: unknown;
}

type PdfScope = "lessons" | "all" | "none";

// Fayl/papka nomi uchun xavfsiz matn
function safeName(s: string): string {
  return (
    String(s ?? "")
      .replace(/[^\p{L}\p{N}\-_ ]/gu, "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 60) || "nomsiz"
  );
}

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
}

// Konteynerdagi rasmlar yuklanishini kutish (ko'pi bilan 10 soniya)
async function waitImages(el: HTMLElement): Promise<void> {
  const imgs = Array.from(el.querySelectorAll("img"));
  const all = Promise.all(
    imgs.map((img) =>
      img.complete ? Promise.resolve() : new Promise<void>((r) => { img.onload = img.onerror = () => r(); }),
    ),
  );
  await Promise.race([all, new Promise((r) => setTimeout(r, 10000))]);
}

// ZIP ichiga qo'yiladigan README — kelajakda ZIP'ni ochgan odam (yoki Claude)
// nima qayerdaligini shu fayldan bilib oladi.
function readmeText(data: BackupData): string {
  return `# Robbit Quiz — To'liq Offline Zaxira (Backup)

Bu ZIP robbitquiz.uz platformasining to'liq ma'lumot zaxirasi.
Yaratilgan: ${data.exportedAt}
Format: robbit-quiz-backup, versiya ${data.version}

## Tuzilma

- manifest.json        — format, sana va yozuvlar soni (mashina o'qiydi)
- README.md            — shu fayl
- data/backup.json     — ASOSIY MANBA: butun baza bitta JSON'da:
    - teachers[]       — foydalanuvchi accountlari (DIQQAT: parol hash'lari bor — maxfiy!)
    - folders[]        — kutubxona papkalari (ichma-ich, parentId bilan)
    - quizzes[]        — barcha loyihalar; har birida slides[]:
        - kind: CONTENT (taqdimot slaydi) yoki QUESTION (savol)
        - type (QUESTION uchun): SINGLE | MULTIPLE | TRUE_FALSE | DROPDOWN |
          POLL | OPEN | FILL_BLANK | MATCH | REORDER
        - data: savol matni, variantlar, TO'G'RI JAVOBLAR, kanvas elementlari.
          Rasmlar "/uploads/<fayl>" ko'rinishida shu arxivning uploads/ papkasiga ishora qiladi.
    - lessonPlans[]    — o'quv dastur darslari (subject/ageGroup/year/section, quizId bilan loyihaga bog'langan)
    - guideSections[]  — ustozlar yo'riqnomasi bo'limlari (markdown)
    - roster[]         — rasmiy ustozlar ro'yxati (nameKey bilan)
    - gameRecords[]    — o'ynalgan o'yinlar tarixi va o'quvchi natijalari (players[])
- uploads/             — slaydlarda ishlatilgan barcha rasm fayllari
- pdf/                 — slaydlarning PDF ko'rinishi (faqat odam o'qishi uchun; tiklashda ishlatilmaydi):
    - pdf/oquv-dastur/<fan>/<guruh-yil>/<NN-dars nomi>.pdf
    - pdf/loyihalar/<ustoz>/<loyiha>.pdf (agar "barcha loyihalar" tanlangan bo'lsa)

## Qanday tiklanadi

1-usul (tavsiya): robbitquiz.uz → admin bilan kirish → Zaxira sahifasi → "ZIP'dan tiklash"
ga shu faylni yuklash. Bazadagi BOR yozuvlarga tegilmaydi, faqat yo'qlari qayta yaratiladi
(id bo'yicha solishtiriladi) — xavfsiz, bir necha marta yuklasa ham dublikat bo'lmaydi.

2-usul (API): POST /api/backup/restore (multipart, "file" maydonida ZIP, admin JWT bilan).

3-usul (qo'lda / Claude uchun): data/backup.json ni o'qing — Prisma modellariga
(Teacher, Folder, Quiz, Slide, LessonPlan, GuideSection, RosterTeacher, GameRecord,
GamePlayerRecord) birma-bir mos keladi. Slide.data DB'da JSON-string sifatida saqlanadi,
bu faylda esa o'qish oson bo'lishi uchun object holatida. uploads/ dagi fayllar
serverdagi backend/uploads/ papkasiga ko'chiriladi.

## Sonlar

${Object.entries(data.counts).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

⚠️ MAXFIY: teachers ichida parol hash'lari va emaillar bor — bu ZIP'ni faqat
ishonchli joyda saqlang.
`;
}

export default function Backup() {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [pdfScope, setPdfScope] = useState<PdfScope>("lessons");
  const [pdfQuiz, setPdfQuiz] = useState<BQuiz | null>(null);
  const pdfRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(false);

  // Tiklash holati
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreResult, setRestoreResult] = useState<{ restored: Record<string, number>; skipped: Record<string, number> } | null>(null);

  // Bitta quiz slaydlarini PDF blob'ga aylantirish (yashirin konteyner orqali)
  async function quizToPdf(q: BQuiz): Promise<Blob | null> {
    setPdfQuiz(q);
    await nextFrame();
    const container = pdfRef.current;
    if (!container) return null;
    await waitImages(container);
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
    const nodes = Array.from(container.querySelectorAll<HTMLElement>("[data-pdf-slide]"));
    if (nodes.length === 0) return null;
    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [1280, 720] });
    for (let i = 0; i < nodes.length; i++) {
      if (cancelRef.current) return null;
      const canvas = await html2canvas(nodes[i], { scale: 1.5, useCORS: true, backgroundColor: "#ffffff", logging: false });
      const img = canvas.toDataURL("image/jpeg", 0.9);
      if (i > 0) pdf.addPage([1280, 720], "landscape");
      pdf.addImage(img, "JPEG", 0, 0, 1280, 720);
    }
    return pdf.output("blob");
  }

  async function buildBackup() {
    if (busy) return;
    setBusy(true);
    setError("");
    cancelRef.current = false;
    try {
      setProgress("Ma'lumotlar serverdan olinmoqda…");
      const data = await api<BackupData>("/backup/export");

      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      zip.file("manifest.json", JSON.stringify({
        format: data.format, version: data.version, exportedAt: data.exportedAt,
        site: "robbitquiz.uz", counts: data.counts,
        files: {
          "data/backup.json": "butun baza (asosiy manba, tiklash uchun)",
          "uploads/": "slayd rasmlari",
          "pdf/": "slaydlarning PDF ko'rinishi (faqat o'qish uchun)",
        },
      }, null, 2));
      zip.file("README.md", readmeText(data));
      zip.file("data/backup.json", JSON.stringify(data, null, 1));

      // ---- Slaydlardagi rasmlar (uploads/) ----
      const urls = [...new Set(JSON.stringify(data.quizzes).match(/\/uploads\/[\w.\-]+/g) ?? [])];
      let done = 0;
      let failed = 0;
      for (const url of urls) {
        if (cancelRef.current) throw new Error("Bekor qilindi");
        setProgress(`Rasmlar: ${++done}/${urls.length}`);
        try {
          const r = await fetch(url);
          if (!r.ok) throw new Error();
          zip.file(`uploads/${url.split("/").pop()}`, await r.blob());
        } catch {
          failed++;
        }
      }

      // ---- PDF'lar ----
      if (pdfScope !== "none") {
        const quizById = new Map(data.quizzes.map((q) => [q.id, q]));
        const teacherById = new Map(data.teachers.map((t) => [t.id, t.name]));
        // [zip ichidagi yo'l, quiz] juftliklari
        const jobs: [string, BQuiz][] = [];
        if (pdfScope === "lessons") {
          const seen = new Set<string>();
          for (const l of data.lessonPlans) {
            if (!l.quizId || seen.has(l.quizId)) continue;
            const q = quizById.get(l.quizId);
            if (!q) continue;
            seen.add(l.quizId);
            const dir = `pdf/oquv-dastur/${safeName(l.subject)}/${safeName(l.ageGroup)}-${l.year}${l.section ? "-" + safeName(l.section) : ""}`;
            jobs.push([`${dir}/${String(l.order).padStart(2, "0")}-${safeName(l.title)}.pdf`, q]);
          }
        } else {
          for (const q of data.quizzes) {
            const dir = `pdf/loyihalar/${safeName(teacherById.get(q.teacherId) ?? "nomalum")}`;
            jobs.push([`${dir}/${safeName(q.title)}-${q.id.slice(-6)}.pdf`, q]);
          }
        }
        for (let i = 0; i < jobs.length; i++) {
          if (cancelRef.current) throw new Error("Bekor qilindi");
          const [pathInZip, q] = jobs[i];
          setProgress(`PDF ${i + 1}/${jobs.length}: ${q.title}`);
          try {
            const blob = await quizToPdf(q);
            if (blob) zip.file(pathInZip, blob);
          } catch {
            failed++; // bitta PDF xatosi butun zaxirani to'xtatmasin
          }
        }
        setPdfQuiz(null);
      }

      // ---- ZIP'ni yig'ish va yuklab berish ----
      setProgress("ZIP siqilmoqda…");
      const blob = await zip.generateAsync(
        { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
        (m) => setProgress(`ZIP siqilmoqda… ${Math.round(m.percent)}%`),
      );
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `robbit-backup-${data.exportedAt.slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      setProgress(`✅ Tayyor (${(blob.size / 1024 / 1024).toFixed(1)} MB)${failed ? ` · ${failed} ta fayl o'tkazib yuborildi` : ""}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Zaxira yaratishda xatolik");
      setProgress("");
      setPdfQuiz(null);
    } finally {
      setBusy(false);
    }
  }

  async function restoreZip(file: File) {
    if (restoreBusy) return;
    setRestoreBusy(true);
    setError("");
    setRestoreResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api<{ ok: boolean; restored: Record<string, number>; skipped: Record<string, number> }>(
        "/backup/restore",
        { method: "POST", body: fd },
      );
      setRestoreResult({ restored: r.restored, skipped: r.skipped });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tiklashda xatolik");
    } finally {
      setRestoreBusy(false);
    }
  }

  return (
    <Shell>
      <h1 style={{ fontSize: 28, marginBottom: 2 }}>Offline zaxira</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Butun bazani (darslar, slaydlar, savollar, rasmlar, natijalar) ZIP qilib saqlash va kerak bo'lsa qaytarish
      </p>

      {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}

      {/* ---- Zaxira olish ---- */}
      <div className="card" style={{ marginTop: 14 }}>
        <h3 style={{ marginTop: 0 }}>📦 Zaxira olish (ZIP)</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          ZIP ichida: to'liq baza (JSON), slayd rasmlari va slaydlarning PDF ko'rinishi.
          README bilan — 5 yildan keyin ochsangiz ham nima qayerdaligi tushunarli bo'ladi.
        </p>
        <label>Slaydlarni PDF qilish</label>
        <select value={pdfScope} onChange={(e) => setPdfScope(e.target.value as PdfScope)} disabled={busy}>
          <option value="lessons">O'quv dastur darslari (tavsiya)</option>
          <option value="all">Barcha loyihalar (sekin)</option>
          <option value="none">PDF'siz — faqat ma'lumot (tez)</option>
        </select>
        <div className="row" style={{ gap: 8, marginTop: 10 }}>
          <button className="btn" disabled={busy} onClick={buildBackup}>
            {busy ? "⏳ Tayyorlanmoqda…" : "📥 Zaxira ZIP yuklab olish"}
          </button>
          {busy && (
            <button className="btn btn-ghost" onClick={() => { cancelRef.current = true; }}>To'xtatish</button>
          )}
        </div>
        {progress && <div className="import-progress" style={{ marginTop: 10 }}>{progress}</div>}
        <p className="muted text-sm" style={{ marginBottom: 0, marginTop: 10 }}>
          ⚠️ ZIP ichida foydalanuvchi emaillari va parol hash'lari bor — faqat ishonchli joyda saqlang.
          PDF tayyorlash vaqtida bu sahifani yopmang.
        </p>
      </div>

      {/* ---- Tiklash ---- */}
      <div className="card" style={{ marginTop: 14 }}>
        <h3 style={{ marginTop: 0 }}>♻️ ZIP'dan tiklash</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Yuqorida olingan ZIP'ni yuklang. Bazadagi mavjud yozuvlarga <b>tegilmaydi</b> —
          faqat yo'qolganlari qayta yaratiladi (bir necha marta yuklasa ham dublikat bo'lmaydi).
        </p>
        <input
          type="file"
          accept=".zip,application/zip"
          disabled={restoreBusy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) restoreZip(f);
            e.target.value = "";
          }}
        />
        {restoreBusy && <div className="import-progress" style={{ marginTop: 10 }}>⏳ Tiklanmoqda… (katta fayl bir necha daqiqa olishi mumkin)</div>}
        {restoreResult && (
          <div className="import-progress" style={{ marginTop: 10 }}>
            ✅ Tiklandi: {Object.entries(restoreResult.restored).map(([k, v]) => `${k}: ${v}`).join(", ") || "yangi yozuv yo'q"}
            <br />
            O'tkazib yuborildi (allaqachon bor): {Object.entries(restoreResult.skipped).map(([k, v]) => `${k}: ${v}`).join(", ") || "—"}
          </div>
        )}
      </div>

      {/* PDF render uchun yashirin konteyner (ekrandan tashqarida) */}
      {pdfQuiz && (
        <div ref={pdfRef} aria-hidden style={{ position: "fixed", left: -100000, top: 0, pointerEvents: "none", opacity: 0 }}>
          {pdfQuiz.slides.map((s, i) => (
            <div data-pdf-slide key={s.id ?? i}>
              <PdfSlide slide={s as unknown as Slide} showAnswers />
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
