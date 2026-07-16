import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import Shell from "../components/Shell";
import SearchBar, { type LessonHit } from "../components/SearchBar";
import QuizPicker from "../components/QuizPicker";
import type { QuizListItem, FolderItem } from "../types";

// Darslar biriktirilgan slayd PAPKASI bo'yicha ranglanadi: bir papkadagi darslar bir xil
// tusda, boshqa papkadagilar boshqa rangda. Papkasi (yoki slaydi) yo'q darslar neytral.
// Ranglar brend pastel palitrasidan; alfa past bo'lgani uchun light/dark mavzuda ham o'qiladi.
const LESSON_TINTS: { bg: string; accent: string }[] = [
  { bg: "rgba(76, 141, 255, 0.09)", accent: "#4c8dff" }, // ko'k
  { bg: "rgba(34, 201, 147, 0.09)", accent: "#22c993" }, // yashil-mint
  { bg: "rgba(245, 166, 35, 0.10)", accent: "#f5a623" }, // sariq
  { bg: "rgba(160, 108, 255, 0.09)", accent: "#a06cff" }, // binafsha
  { bg: "rgba(255, 107, 138, 0.09)", accent: "#ff6b8a" }, // pushti
  { bg: "rgba(43, 184, 214, 0.10)", accent: "#2bb8d6" }, // moviy
];

// Dars sarlavhasi boshidagi tartib prefiksini tozalaydi ("1-dars. ", "12. ", "3) ")
function cleanTitle(raw: string): string {
  const t = String(raw ?? "").trim();
  const stripped = t.replace(/^\s*\d+\s*[-.)]?\s*(dars\s*[.:]?)?\s*/i, "").trim();
  return stripped || t;
}

type Subject = "ROBOTEXNIKA" | "DASTURLASH";
type AgeGroup = "MIDDLE" | "SENIOR";

interface LinkedQuiz {
  id: string;
  title: string;
  folderId: string | null;
  folder: { name: string } | null;
  _count: { slides: number };
}

interface LessonPlan {
  id: string;
  subject: Subject;
  ageGroup: AgeGroup;
  year: number;
  section: string | null;
  order: number;
  title: string;
  author: string | null;
  isDemo: boolean;
  quizId: string | null;
  quiz: LinkedQuiz | null;
}

// Guruh bo'yicha hisob — filtr tugmalarida son ko'rsatish uchun (/curriculum/counts)
interface CountGroup {
  subject: Subject;
  ageGroup: AgeGroup;
  year: number;
  section: string | null;
  total: number;
  withQuiz: number;
}

const AGE_GROUPS: { key: AgeGroup; label: string }[] = [
  { key: "MIDDLE", label: "Middle (9–11 yosh)" },
  { key: "SENIOR", label: "Senior (12–15 yosh)" },
];

const SECTIONS = [
  { key: "DESIGN", label: "Design" },
  { key: "PROGRAMMING", label: "Programming" },
  { key: "ROBOTICS", label: "Robotics" },
];

interface EditState {
  title: string;
  author: string;
  isDemo: boolean;
  quizId: string;
  order: number;
}

// Oxirgi tanlangan filtrlar — sahifa qayta ochilganda tiklanadi
const STORAGE_KEY = "robbit_curriculum_filters";
interface SavedFilters {
  subject?: Subject;
  ageGroup?: AgeGroup | null;
  year?: number | null;
  section?: string;
}
function loadSaved(): SavedFilters {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as SavedFilters;
  } catch {
    return {};
  }
}

export default function Curriculum() {
  const { teacher } = useAuth();
  const navigate = useNavigate();
  const isAdmin = teacher?.isAdmin === true;
  const canCreate = !!(teacher?.isAdmin || teacher?.canCreate); // "slayd qilish" ruxsati (quizni biriktira oladi)

  const saved = useRef(loadSaved()).current;
  const [subject, setSubject] = useState<Subject>(saved.subject === "DASTURLASH" ? "DASTURLASH" : "ROBOTEXNIKA");
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(saved.ageGroup ?? null);
  const [year, setYear] = useState<number | null>(saved.year ?? null);
  const [section, setSection] = useState<string>(saved.section ?? "DESIGN");
  const [lessons, setLessons] = useState<LessonPlan[]>([]);
  const [counts, setCounts] = useState<CountGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const [quizList, setQuizList] = useState<QuizListItem[]>([]);

  // Toast — brauzer alert() o'rniga
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  // Qo'shish
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newAuthor, setNewAuthor] = useState("");
  const [newIsDemo, setNewIsDemo] = useState(false);
  const [newQuizId, setNewQuizId] = useState<string>("");
  const [newOrder, setNewOrder] = useState<number>(1);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // Ommaviy qo'shish — papkadan
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [showFolderAdd, setShowFolderAdd] = useState(false);
  const [folderPickId, setFolderPickId] = useState<string>("");
  const [stripPrefix, setStripPrefix] = useState(true);

  // Ommaviy qo'shish — mavzular ro'yxatidan
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [bulkText, setBulkText] = useState("");

  // Tahrirlash
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ title: "", author: "", isDemo: false, quizId: "", order: 0 });
  const [editSaving, setEditSaving] = useState(false);

  // Drag&drop bilan tartibni o'zgartirish (faqat admin)
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Belgilash rejimi — bir nechta darsni tanlab ommaviy o'chirish (faqat admin)
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  function toggleSelect(id: string) {
    setSelectedIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }
  async function removeSelected() {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size} ta darsni o'chirishni tasdiqlaysizmi?`)) return;
    try {
      const r = await api<{ deleted: number }>("/curriculum/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
      // Server qolgan raqamlarni zichlaydi — qayta yuklaymiz
      await loadLessons();
      loadCounts();
      exitSelectMode();
      showToast(`🗑️ ${r.deleted} ta dars o'chirildi.`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Xatolik");
    }
  }

  const allFiltersSet = ageGroup !== null && year !== null;

  // Filtrlar o'zgarganda localStorage'ga saqlaymiz
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ subject, ageGroup, year, section }));
    } catch {
      /* ignore */
    }
  }, [subject, ageGroup, year, section]);

  // Guruh hisoblari — tanlashdan oldin qaysi bo'limda nechta dars borligini ko'rsatadi
  const loadCounts = useCallback(() => {
    api<{ groups: CountGroup[] }>("/curriculum/counts")
      .then((r) => setCounts(r.groups))
      .catch(() => {});
  }, []);
  useEffect(() => { loadCounts(); }, [loadCounts]);

  function countAge(ag: AgeGroup): number {
    return counts.filter((g) => g.subject === subject && g.ageGroup === ag).reduce((a, g) => a + g.total, 0);
  }
  function countYear(y: number): number {
    return counts
      .filter((g) => g.subject === subject && g.ageGroup === ageGroup && g.year === y)
      .reduce((a, g) => a + g.total, 0);
  }
  function countSection(sec: string): number {
    return counts
      .filter((g) => g.subject === subject && g.ageGroup === ageGroup && g.year === year && g.section === sec)
      .reduce((a, g) => a + g.total, 0);
  }

  // Qidiruvdan dars tanlanganda — filtrlarni o'rnatib, darsni belgilash uchun id saqlaymiz
  function pickLesson(l: LessonHit) {
    setSubject(l.subject);
    setAgeGroup(l.ageGroup);
    setYear(l.year);
    setSection(l.section ?? "DESIGN");
    setShowAdd(false);
    setEditingId(null);
    setHighlightId(l.id);
  }

  // Topilgan darsni ko'rinishga keltirib, qisqa belgilab qo'yamiz
  useEffect(() => {
    if (!highlightId || lessons.length === 0) return;
    if (!lessons.some((l) => l.id === highlightId)) return;
    const el = document.getElementById(`lesson-${highlightId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.style.transition = "box-shadow 0.3s";
      el.style.boxShadow = "0 0 0 3px var(--primary)";
      setTimeout(() => { el.style.boxShadow = ""; }, 1600);
    }
    setHighlightId(null);
  }, [lessons, highlightId]);

  useEffect(() => {
    if (!canCreate) return;
    api<{ quizzes: QuizListItem[] }>("/quizzes")
      .then((r) => setQuizList(r.quizzes))
      .catch(() => {});
  }, [canCreate]);

  // Papkalar (faqat admin — papkadan ommaviy dars yaratish uchun)
  useEffect(() => {
    if (!isAdmin) return;
    api<{ folders: FolderItem[] }>("/folders")
      .then((r) => setFolders(r.folders.filter((f) => f.mine)))
      .catch(() => {});
  }, [isAdmin]);

  const loadLessons = useCallback(async () => {
    if (!allFiltersSet) { setLessons([]); return; }
    setLoading(true);
    const params = new URLSearchParams({ subject, ageGroup: ageGroup!, year: String(year) });
    if (subject === "ROBOTEXNIKA") params.set("section", section);
    try {
      const r = await api<{ lessons: LessonPlan[] }>(`/curriculum?${params}`);
      setLessons(r.lessons);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [subject, ageGroup, year, section, allFiltersSet]);

  useEffect(() => { loadLessons(); }, [loadLessons]);

  // Yo'nalish almashganda yosh/yil tanlovi SAQLANADI (reset qilinmaydi)
  function changeSubject(s: Subject) {
    setSubject(s);
    setShowAdd(false); setEditingId(null);
  }
  function changeAgeGroup(ag: AgeGroup) {
    setAgeGroup(ag); setShowAdd(false); setEditingId(null);
  }

  function openAdd() {
    setNewOrder(lessons.length + 1);
    setNewTitle(""); setNewAuthor(""); setNewIsDemo(false); setNewQuizId("");
    setShowAdd(true); setEditingId(null); setShowFolderAdd(false); setShowBulkAdd(false);
  }

  function openFolderAdd() {
    setFolderPickId(""); setStripPrefix(true);
    setShowFolderAdd(true); setShowAdd(false); setShowBulkAdd(false); setEditingId(null);
  }

  function openBulkAdd() {
    setBulkText("");
    setShowBulkAdd(true); setShowAdd(false); setShowFolderAdd(false); setEditingId(null);
  }

  function openEdit(l: LessonPlan) {
    setEditingId(l.id);
    setEditState({ title: l.title, author: l.author ?? "", isDemo: l.isDemo, quizId: l.quizId ?? "", order: l.order + 1 });
    setShowAdd(false);
  }

  function quizForId(id: string): LinkedQuiz | null {
    const q = quizList.find((q) => q.id === id);
    if (!q) return null;
    const fid = q.folderId ?? null;
    const fname = fid ? (folders.find((f) => f.id === fid)?.name ?? null) : null;
    return { id: q.id, title: q.title, folderId: fid, folder: fname ? { name: fname } : null, _count: q._count };
  }

  async function addLesson() {
    if (!newTitle.trim() || !allFiltersSet) return;
    setSaving(true);
    try {
      const body = {
        subject, ageGroup, year,
        section: subject === "ROBOTEXNIKA" ? section : null,
        order: newOrder - 1,
        title: newTitle.trim(),
        author: newAuthor.trim() || null,
        isDemo: newIsDemo,
        quizId: newQuizId || null,
      };
      await api<{ lesson: LessonPlan }>("/curriculum", {
        method: "POST",
        body: JSON.stringify(body),
      });
      // Server butun guruhni qayta raqamlashi mumkin — ro'yxatni qayta yuklaymiz
      await loadLessons();
      loadCounts();
      // Forma ochiq qoladi — ketma-ket tez kiritish (tartib +1, fokus mavzuga)
      setNewTitle(""); setNewAuthor(""); setNewIsDemo(false); setNewQuizId("");
      setNewOrder((o) => o + 1);
      titleRef.current?.focus();
    } finally { setSaving(false); }
  }

  // Ommaviy: papkadagi har quizdan dars yaratadi (quiz avtomatik biriktiriladi)
  async function addFromFolder() {
    if (!folderPickId || !allFiltersSet) return;
    setSaving(true);
    try {
      const r = await api<{ created: number; skipped: number }>("/curriculum/from-folder", {
        method: "POST",
        body: JSON.stringify({
          subject, ageGroup, year,
          section: subject === "ROBOTEXNIKA" ? section : null,
          folderId: folderPickId, stripPrefix,
        }),
      });
      await loadLessons();
      loadCounts();
      setShowFolderAdd(false);
      showToast(`✅ ${r.created} ta dars qo'shildi${r.skipped ? `, ${r.skipped} ta allaqachon mavjud edi` : ""}.`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Xatolik");
    } finally { setSaving(false); }
  }

  // Ommaviy: mavzular ro'yxatidan bo'sh darslar yaratadi (quiz keyin biriktiriladi)
  async function addBulkTitles() {
    const titles = bulkText.split("\n").map((s) => s.trim()).filter(Boolean);
    if (titles.length === 0 || !allFiltersSet) return;
    setSaving(true);
    try {
      const r = await api<{ created: number }>("/curriculum/bulk-titles", {
        method: "POST",
        body: JSON.stringify({
          subject, ageGroup, year,
          section: subject === "ROBOTEXNIKA" ? section : null,
          titles,
        }),
      });
      await loadLessons();
      loadCounts();
      setShowBulkAdd(false); setBulkText("");
      showToast(`✅ ${r.created} ta dars qo'shildi.`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Xatolik");
    } finally { setSaving(false); }
  }

  // AI: NOM + TARTIB — guruhdagi har darsning BARCHA slaydlari serverda AI'ga
  // o'rgatiladi (Claude asosiy, Gemini zaxira): toza mavzu nomi + modul + ichki
  // o'rin aniqlanadi, keyin guruh o'quv reja bo'yicha avtomatik tartiblanadi.
  // Jarayon fonda ketadi — holatini 3 soniyada bir so'rab turamiz.
  interface AiJobInfo {
    total: number; done: number; renamed: number; failed: number;
    lowConfidence: string[]; running: boolean; error?: string;
  }
  const [aiJob, setAiJob] = useState<AiJobInfo | null>(null);
  const extracting = !!aiJob?.running;

  async function pollAiStatus(): Promise<AiJobInfo | null> {
    const params = new URLSearchParams({
      subject, ageGroup: String(ageGroup ?? ""), year: String(year ?? ""),
      ...(subject === "ROBOTEXNIKA" && section ? { section } : {}),
    });
    const r = await api<{ job: AiJobInfo | null }>(`/curriculum/ai-status?${params}`);
    setAiJob(r.job);
    return r.job;
  }

  // Filtr o'zgarganda: shu guruhda fonda AI ketayotgan bo'lsa (masalan importdan
  // keyin avto-boshlangan) — progressni ko'rsatib kuzatamiz
  useEffect(() => {
    if (!allFiltersSet || !isAdmin) { setAiJob(null); return; }
    let stop = false;
    const tick = async () => {
      try {
        const job = await pollAiStatus();
        if (stop) return;
        if (job?.running) setTimeout(tick, 3000);
        else if (job && !job.running) await loadLessons();
      } catch { /* holat so'rovi muvaffaqiyatsiz — jim */ }
    };
    tick();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, ageGroup, year, section, allFiltersSet, isAdmin]);

  async function extractTitles() {
    if (!allFiltersSet || extracting) return;
    if (!confirm(
      "AI har darsning slaydlarini to'liq o'rganib: nomini tuzatadi (ishonch yuqori bo'lsa), " +
      "modulini aniqlaydi va o'quv reja bo'yicha tartiblaydi. Jarayon fonda ketadi. Davom etasizmi?",
    )) return;
    try {
      const r = await api<{ started: boolean; total: number }>("/curriculum/ai-organize", {
        method: "POST",
        body: JSON.stringify({
          subject, ageGroup, year,
          section: subject === "ROBOTEXNIKA" ? section : null,
          force: true,
        }),
      });
      if (r.total === 0) {
        showToast("Bu bo'limda quiz biriktirilgan dars yo'q.");
        return;
      }
      showToast(`🤖 AI ${r.total} ta darsni o'rganishni boshladi…`);
      // Progress kuzatuvi
      const watch = async () => {
        try {
          const job = await pollAiStatus();
          if (job?.running) { setTimeout(watch, 3000); return; }
          await loadLessons();
          if (job) {
            showToast(
              `🤖 Tayyor: ${job.total} ta darsdan ${job.renamed} ta nom yangilandi` +
              `${job.lowConfidence.length ? `, ${job.lowConfidence.length} ta past ishonch (nomi qoldi)` : ""}` +
              `${job.failed ? `, ${job.failed} ta o'qilmadi` : ""}. Tartib yangilandi.`,
            );
          }
        } catch { /* keyingi poll'da tuzalar */ setTimeout(watch, 5000); }
      };
      watch();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Xatolik");
    }
  }

  // O'quv reja bo'yicha avtomatik tartiblash — mavjud darslarni rasmiy reja
  // ketma-ketligiga soladi (faqat admin ko'radigan tugma orqali)
  async function autoSort() {
    if (!allFiltersSet) return;
    setSaving(true);
    try {
      const r = await api<{ moved: number }>("/curriculum/auto-sort", {
        method: "POST",
        body: JSON.stringify({
          subject, ageGroup, year,
          section: subject === "ROBOTEXNIKA" ? section : null,
        }),
      });
      await loadLessons();
      showToast(r.moved > 0
        ? `🪄 ${r.moved} ta dars o'quv reja tartibiga tushirildi.`
        : "✅ Darslar allaqachon o'quv reja tartibida.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Xatolik");
    } finally { setSaving(false); }
  }

  async function saveEdit(l: LessonPlan) {
    if (!editState.title.trim()) return;
    setEditSaving(true);
    try {
      const body = {
        subject: l.subject, ageGroup: l.ageGroup, year: l.year, section: l.section,
        order: editState.order - 1,
        title: editState.title.trim(),
        author: editState.author.trim() || null,
        isDemo: editState.isDemo,
        quizId: editState.quizId || null,
      };
      await api(`/curriculum/${l.id}`, { method: "PUT", body: JSON.stringify(body) });
      // Tartib o'zgarganda server BUTUN guruhni qayta raqamlaydi (unik 1..n) —
      // shuning uchun ro'yxatni serverdan qayta yuklaymiz
      await loadLessons();
      loadCounts();
      setEditingId(null);
    } finally { setEditSaving(false); }
  }

  async function removeLesson(id: string) {
    if (!confirm("Darsni o'chirishni tasdiqlaysizmi?")) return;
    await api(`/curriculum/${id}`, { method: "DELETE" });
    // Server qolgan raqamlarni zichlaydi — qayta yuklaymiz
    await loadLessons();
    loadCounts();
  }

  // Drag&drop: sudralgan darsni nishon dars o'rniga qo'yamiz, tartibni 0..n-1
  // qilib qayta hisoblab, serverga saqlaymiz. Xato bo'lsa ro'yxatni qaytaramiz.
  async function dropOnLesson(targetId: string) {
    const from = lessons.findIndex((l) => l.id === dragId);
    const to = lessons.findIndex((l) => l.id === targetId);
    setDragId(null);
    setDragOverId(null);
    if (from < 0 || to < 0 || from === to) return;
    const prev = lessons;
    const next = [...lessons];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const reIndexed = next.map((l, i) => ({ ...l, order: i }));
    setLessons(reIndexed);
    try {
      await api("/curriculum/reorder", {
        method: "PATCH",
        body: JSON.stringify({ ids: reIndexed.map((l) => l.id) }),
      });
    } catch {
      setLessons(prev); // saqlanmasa — eski holatga qaytaramiz
    }
  }

  // canCreate ustoz (admin emas) darsga o'z quizini biriktiradi — faqat quizId o'zgaradi
  async function attachQuiz(l: LessonPlan, quizId: string) {
    await api(`/curriculum/${l.id}/quiz`, { method: "PATCH", body: JSON.stringify({ quizId: quizId || null }) });
    setLessons((ls) =>
      ls.map((x) => (x.id === l.id ? { ...x, quizId: quizId || null, quiz: quizId ? quizForId(quizId) : null } : x)),
    );
    loadCounts();
  }

  const withQuizCount = lessons.filter((l) => l.quiz).length;
  const progressPct = lessons.length > 0 ? Math.round((withQuizCount / lessons.length) * 100) : 0;

  // Papka -> rang indeksi: ro'yxatda papka birinchi uchragan tartibda raqamlanadi,
  // shunda yonma-yon turgan har xil papkalar (odatda) har xil rang oladi.
  const folderOrder = new Map<string, number>();
  for (const l of lessons) {
    const fid = l.quiz?.folderId;
    if (fid && !folderOrder.has(fid)) folderOrder.set(fid, folderOrder.size);
  }
  const folderColorIndex = (fid: string) => folderOrder.get(fid) ?? 0;

  return (
    <Shell>
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 28, marginBottom: 4 }}>O'quv dastur</h1>
          <p className="muted" style={{ margin: 0, fontSize: 15 }}>
            Yosh toifasi va yo'nalish bo'yicha dars rejalar
          </p>
        </div>
        <SearchBar scope="lessons" onPick={(item) => pickLesson(item as LessonHit)} placeholder="Dars qidirish…" />
      </div>

      {/* Yo'nalish (subject) */}
      <div className="cur-seg" style={{ marginBottom: 20 }}>
        {(["ROBOTEXNIKA", "DASTURLASH"] as Subject[]).map((s) => (
          <button key={s} className={subject === s ? "active" : ""} onClick={() => changeSubject(s)}>
            {s === "ROBOTEXNIKA" ? "Robotexnika" : "Dasturlash"}
          </button>
        ))}
      </div>

      {/* Yosh toifasi + o'quv yili — bitta ixcham qator, har birida dars soni */}
      <div className="cur-filters">
        <div className="cur-filter-group">
          <span className="cur-filter-label">Yosh toifasi</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {AGE_GROUPS.map((ag) => {
              const n = countAge(ag.key);
              return (
                <button key={ag.key} className={`cur-chip ${ageGroup === ag.key ? "active" : ""}`} onClick={() => changeAgeGroup(ag.key)}>
                  {ag.label}
                  {n > 0 && <span className="cur-count">{n}</span>}
                </button>
              );
            })}
          </div>
        </div>
        {ageGroup && (
          <div className="cur-filter-group">
            <span className="cur-filter-label">O'quv yili</span>
            <div style={{ display: "flex", gap: 8 }}>
              {[1, 2].map((y) => {
                const n = countYear(y);
                return (
                  <button key={y} className={`cur-chip ${year === y ? "active" : ""}`} onClick={() => setYear(y)}>
                    {y}-yil
                    {n > 0 && <span className="cur-count">{n}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Section tablar (faqat Robotexnika) — har tabda dars soni */}
      {subject === "ROBOTEXNIKA" && allFiltersSet && (
        <div className="cur-tabs">
          {SECTIONS.map((s) => {
            const n = countSection(s.key);
            return (
              <button key={s.key} className={`cur-tab ${section === s.key ? "active" : ""}`} onClick={() => setSection(s.key)}>
                {s.label}
                {n > 0 && <span className="cur-count">{n}</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Kontent */}
      {!allFiltersSet ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px", marginTop: 8 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 48, color: "var(--muted)", display: "block", marginBottom: 12 }}>menu_book</span>
          <p className="muted" style={{ margin: 0, fontSize: 16 }}>{!ageGroup ? "Yosh toifasini tanlang" : "O'quv yilini tanlang"}</p>
        </div>
      ) : loading ? (
        <div>
          <div className="cur-skel" />
          <div className="cur-skel" />
          <div className="cur-skel" />
          <div className="cur-skel" />
        </div>
      ) : (
        <div>
          {lessons.length === 0 && !showAdd && (
            <div className="card" style={{ padding: "32px 24px", textAlign: "center" }}>
              <p className="muted" style={{ margin: 0 }}>
                Bu bo'lim uchun hali dars qo'shilmagan.
                {isAdmin && " Pastdagi tugmalar bilan dars qo'shing."}
              </p>
            </div>
          )}

          {/* Progress: nechta darsga slayd biriktirilgan */}
          {lessons.length > 0 && (
            <div className="cur-progress">
              <span style={{ whiteSpace: "nowrap" }}>
                📊 {withQuizCount}/{lessons.length} darsga slayd biriktirilgan
              </span>
              <div className="bar"><div className="bar-fill" style={{ width: `${progressPct}%` }} /></div>
              <span className="muted" style={{ whiteSpace: "nowrap" }}>{progressPct}%</span>
              {isAdmin && !selectMode && (
                <button className="cur-mini-btn edit" style={{ marginLeft: "auto" }}
                  onClick={() => setSelectMode(true)} title="Bir nechta darsni belgilab o'chirish">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>checklist</span>
                  Belgilash
                </button>
              )}
            </div>
          )}

          {/* Belgilash rejimi paneli */}
          {isAdmin && selectMode && (
            <div className="cur-select-bar">
              <span style={{ fontWeight: 700 }}>{selectedIds.size} ta tanlandi</span>
              <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 13 }}
                onClick={() => setSelectedIds(selectedIds.size === lessons.length ? new Set() : new Set(lessons.map((l) => l.id)))}>
                {selectedIds.size === lessons.length ? "Bekor qilish" : "Hammasini tanlash"}
              </button>
              <div style={{ flex: 1 }} />
              <button className="cur-mini-btn del" onClick={removeSelected} disabled={selectedIds.size === 0}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                O'chirish ({selectedIds.size})
              </button>
              <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 13 }} onClick={exitSelectMode}>Yopish</button>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {lessons.map((l) => {
              const hasQuiz = Boolean(l.quiz);
              const isEditing = editingId === l.id;
              // Papka bo'yicha rang: har papkaga (ro'yxatda birinchi uchragani tartibida)
              // palitradan bitta tus biriktiriladi; shu papkadagi barcha darslar shu tusda.
              const folderId = l.quiz?.folderId ?? null;
              const tint = folderId ? LESSON_TINTS[folderColorIndex(folderId) % LESSON_TINTS.length] : null;

              if (isEditing && isAdmin) {
                // ---- EDIT REJIMI ----
                return (
                  <div key={l.id} className="cur-form editing" style={{ marginTop: 0 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                      {/* Tartib raqami */}
                      <div style={{ width: 72 }}>
                        <label className="f-label">#</label>
                        <input type="number" min={1} value={editState.order}
                          onChange={(e) => setEditState((s) => ({ ...s, order: Number(e.target.value) }))}
                          style={{ textAlign: "center" }}
                        />
                      </div>
                      {/* Mavzu */}
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <label className="f-label">Dars mavzusi *</label>
                        <input value={editState.title} autoFocus
                          onChange={(e) => setEditState((s) => ({ ...s, title: e.target.value }))}
                          onKeyDown={(e) => e.key === "Enter" && saveEdit(l)}
                        />
                      </div>
                      {/* Muallif */}
                      <div style={{ width: 150 }}>
                        <label className="f-label">Muallif</label>
                        <input value={editState.author}
                          onChange={(e) => setEditState((s) => ({ ...s, author: e.target.value }))}
                          placeholder="Ixtiyoriy"
                        />
                      </div>
                      {/* Quiz — yozib qidiriladigan */}
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <label className="f-label">Slayd biriktirish</label>
                        <QuizPicker quizzes={quizList} value={editState.quizId}
                          onChange={(id) => setEditState((s) => ({ ...s, quizId: id }))} />
                      </div>
                      {/* Demo Day */}
                      <label style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 10, cursor: "pointer", fontWeight: 600, fontSize: 14, whiteSpace: "nowrap" }}>
                        <input type="checkbox" checked={editState.isDemo}
                          onChange={(e) => setEditState((s) => ({ ...s, isDemo: e.target.checked }))} />
                        Demo Day
                      </label>
                      {/* Tugmalar */}
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn" onClick={() => saveEdit(l)} disabled={editSaving || !editState.title.trim()}>
                          {editSaving ? "…" : "Saqlash"}
                        </button>
                        <button className="btn btn-ghost" onClick={() => setEditingId(null)}>Bekor</button>
                      </div>
                    </div>
                  </div>
                );
              }

              // ---- KO'RISH REJIMI ----
              return (
                <div key={l.id} id={`lesson-${l.id}`}
                  draggable={isAdmin && !selectMode}
                  onDragStart={isAdmin ? () => setDragId(l.id) : undefined}
                  onDragEnd={isAdmin ? () => { setDragId(null); setDragOverId(null); } : undefined}
                  onDragOver={isAdmin ? (e) => { e.preventDefault(); if (dragId && dragId !== l.id) setDragOverId(l.id); } : undefined}
                  onDragLeave={isAdmin ? () => setDragOverId((cur) => (cur === l.id ? null : cur)) : undefined}
                  onDrop={isAdmin ? (e) => { e.preventDefault(); dropOnLesson(l.id); } : undefined}
                  className={`cur-row ${dragOverId === l.id ? "drag-over" : ""} ${dragId === l.id ? "dragging" : ""} ${selectMode && selectedIds.has(l.id) ? "selected" : ""}`}
                  onClick={selectMode ? () => toggleSelect(l.id) : undefined}
                  style={{
                    // Papka tusi — yumshoq fon + chap aksent chiziq (CSS o'zgaruvchilari orqali,
                    // shunda .selected / .drag-over holatlari baribir ustun bo'ladi).
                    // Papkasiz dars — neytral (o'zgaruvchi berilmaydi, oddiy sirt fonida qoladi).
                    ...(tint ? { ["--row-tint" as string]: tint.bg, ["--row-accent" as string]: tint.accent } : {}),
                    ...(selectMode ? { cursor: "pointer" } : {}),
                  }}
                >
                  {/* Belgilash rejimida — checkbox; oddiy rejimda — sudrash dastagi */}
                  {isAdmin && selectMode && (
                    <input type="checkbox" checked={selectedIds.has(l.id)} readOnly
                      style={{ width: 18, height: 18, flexShrink: 0, cursor: "pointer" }} />
                  )}
                  {isAdmin && !selectMode && (
                    <span className="material-symbols-outlined" title="Sudrab tartibini o'zgartiring"
                      style={{ color: "var(--muted)", fontSize: 20, cursor: "grab", flexShrink: 0 }}>drag_indicator</span>
                  )}
                  {/* Holat belgisi */}
                  {hasQuiz ? (
                    <span className="material-symbols-outlined" title="Slayd biriktirilgan — dars tayyor"
                      style={{ color: "var(--success)", fontSize: 22, flexShrink: 0 }}>task_alt</span>
                  ) : (
                    <span className="material-symbols-outlined" title="Slayd hali biriktirilmagan"
                      style={{ color: "var(--warn)", fontSize: 22, flexShrink: 0 }}>schedule</span>
                  )}

                  {/* Mavzu va biriktirilgan quiz */}
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div
                      style={{
                        fontWeight: 600, fontSize: 15,
                        cursor: isAdmin && hasQuiz ? "pointer" : "default",
                        color: isAdmin && hasQuiz ? "var(--primary)" : undefined,
                      }}
                      // Faqat admin: mavzu nomiga bosilganda biriktirilgan slaydni tahrirlash uchun ochiladi
                      onClick={(e) => { if (selectMode) return; if (isAdmin && hasQuiz) { e.stopPropagation(); navigate(`/quiz/${l.quiz!.id}`); } }}
                      title={isAdmin && hasQuiz ? "Slaydni tahrirlash" : undefined}
                    >
                      {l.order + 1}. {l.title}
                      {isAdmin && hasQuiz && (
                        <span className="material-symbols-outlined" style={{ fontSize: 15, marginLeft: 5, verticalAlign: "middle", opacity: 0.7 }}>edit_note</span>
                      )}
                      {l.isDemo && (
                        <span className="cur-badge-demo" title="Demo Day darsi">Demo Day</span>
                      )}
                    </div>
                    {l.quiz && (
                      <div style={{ marginTop: 3, fontSize: 13, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {/* Quiz nomi dars mavzusi bilan bir xil bo'lsa takrorlamaymiz — faqat slayd soni */}
                        <span>
                          📑 {cleanTitle(l.quiz.title).toLowerCase() === cleanTitle(l.title).toLowerCase()
                            ? `${l.quiz._count.slides} ta slayd`
                            : `${l.quiz.title} · ${l.quiz._count.slides} ta slayd`}
                        </span>
                        {/* Papka yorlig'i — karta tusi qaysi papkadanligini bildiradi */}
                        {l.quiz.folder && tint && (
                          <span title={`Papka: ${l.quiz.folder.name}`}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 700,
                              padding: "1px 8px", borderRadius: 999, whiteSpace: "nowrap",
                              background: tint.bg, color: tint.accent, border: `1px solid ${tint.accent}`,
                            }}>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: tint.accent }} />
                            {l.quiz.folder.name}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {l.author && (
                    <span className="muted text-sm" style={{ flexShrink: 0 }}>
                      Muallif: <strong>{l.author}</strong>
                    </span>
                  )}

                  {/* Ko'rish (preview) + Boshlash — faqat quiz biriktirilganda */}
                  {hasQuiz && !selectMode && (
                    <>
                      <button className="cur-mini-btn view" onClick={() => navigate(`/activity/${l.quiz!.id}`)}
                        title="Slaydlarni oldindan ko'rish">
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>visibility</span>
                        Ko'rish
                      </button>
                      <button className="cur-mini-btn play" onClick={() => navigate(`/host/${l.quiz!.id}`)}
                        title="O'yinni boshlash">
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>play_arrow</span>
                        Boshlash
                      </button>
                    </>
                  )}

                  {/* canCreate ustoz (admin emas) — o'z slaydini biriktirish (yozib qidiriladigan) */}
                  {!isAdmin && canCreate && !selectMode && (
                    <div className="cur-picker" style={{ flexShrink: 0, width: 200 }} title="Darsga o'z slaydingizni biriktirish">
                      <QuizPicker quizzes={quizList} value={l.quizId ?? ""}
                        onChange={(id) => attachQuiz(l, id)} placeholder="Slayd biriktirish…" />
                    </div>
                  )}

                  {/* Admin tugmalari */}
                  {isAdmin && !selectMode && (
                    <>
                      <button className="cur-mini-btn edit" onClick={() => openEdit(l)} title="Tahrirlash">
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                      </button>
                      <button className="cur-mini-btn del" onClick={() => removeLesson(l.id)} title="O'chirish">
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Admin — qo'shish (bitta / papkadan / ro'yxatdan) */}
          {isAdmin && (
            <>
            {showAdd && (
              <div className="cur-form">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                  {/* Tartib raqami */}
                  <div style={{ width: 72 }}>
                    <label className="f-label">#</label>
                    <input type="number" min={1} value={newOrder}
                      onChange={(e) => setNewOrder(Number(e.target.value))}
                      style={{ textAlign: "center" }}
                    />
                  </div>
                  {/* Mavzu */}
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <label className="f-label">Dars mavzusi *</label>
                    <input ref={titleRef} value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Masalan: Google Docs bilan ishlash"
                      autoFocus onKeyDown={(e) => e.key === "Enter" && addLesson()}
                    />
                  </div>
                  {/* Muallif */}
                  <div style={{ width: 160 }}>
                    <label className="f-label">Muallif</label>
                    <input value={newAuthor} onChange={(e) => setNewAuthor(e.target.value)} placeholder="Ixtiyoriy" />
                  </div>
                  {/* Quiz — yozib qidiriladigan; tanlanganda mavzu bo'sh bo'lsa avtomatik to'ladi */}
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <label className="f-label">Slayd biriktirish</label>
                    <QuizPicker quizzes={quizList} value={newQuizId}
                      placeholder="— Ixtiyoriy —"
                      onChange={(id) => {
                        setNewQuizId(id);
                        if (id && !newTitle.trim()) {
                          const q = quizList.find((x) => x.id === id);
                          if (q) setNewTitle(cleanTitle(q.title));
                        }
                      }} />
                  </div>
                  {/* Demo Day */}
                  <label style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 10, cursor: "pointer", fontWeight: 600, fontSize: 14, whiteSpace: "nowrap" }}>
                    <input type="checkbox" checked={newIsDemo} onChange={(e) => setNewIsDemo(e.target.checked)} />
                    Demo Day
                  </label>
                  {/* Tugmalar */}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn" onClick={addLesson} disabled={saving || !newTitle.trim()}>
                      {saving ? "Saqlanmoqda…" : "Qo'shish"}
                    </button>
                    <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>Yopish</button>
                  </div>
                </div>
              </div>
            )}

            {/* Papkadan ommaviy dars yaratish */}
            {showFolderAdd && (
              <div className="cur-form">
                <div style={{ fontWeight: 700, marginBottom: 4 }}>📁 Papkadan darslar yaratish</div>
                <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                  Tanlangan papkadagi <b>har quizdan avtomatik dars</b> yaratiladi (kutubxona tartibida,
                  quiz biriktirilgan holda). Bu bo'limda allaqachon bo'lgan quizlar o'tkazib yuboriladi.
                </p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <select value={folderPickId} onChange={(e) => setFolderPickId(e.target.value)}
                    style={{ flex: 1, minWidth: 240, padding: "8px 12px", borderRadius: 8, border: "2px solid var(--border)", background: "var(--surface)", fontSize: 14, color: "var(--ink)" }}>
                    <option value="">— Papkani tanlang —</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>📁 {f.name} ({f.count})</option>
                    ))}
                  </select>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontWeight: 600, fontSize: 14, whiteSpace: "nowrap" }}>
                    <input type="checkbox" checked={stripPrefix} onChange={(e) => setStripPrefix(e.target.checked)} />
                    "1-dars." prefiksini olib tashlash
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn" onClick={addFromFolder} disabled={saving || !folderPickId}>
                      {saving ? "Yaratilmoqda…" : "Yaratish"}
                    </button>
                    <button className="btn btn-ghost" onClick={() => setShowFolderAdd(false)}>Bekor</button>
                  </div>
                </div>
              </div>
            )}

            {/* Mavzular ro'yxatidan ommaviy qo'shish */}
            {showBulkAdd && (
              <div className="cur-form">
                <div style={{ fontWeight: 700, marginBottom: 4 }}>📋 Ro'yxatdan darslar qo'shish</div>
                <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                  Har qatorga bitta dars mavzusi. Quizni keyinroq biriktirasiz. Boshidagi "1." kabi raqamlar avtomatik olib tashlanadi.
                </p>
                <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={8}
                  placeholder={"1. Komputerning ichki va tashqi qurilmalari\n2. Google Docs bilan ishlash\n3. Google Sheets bilan tanishuv"}
                  style={{ fontSize: 14, width: "100%" }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                  <span className="muted" style={{ fontSize: 13 }}>
                    {bulkText.split("\n").map((s) => s.trim()).filter(Boolean).length} ta mavzu
                  </span>
                  <div style={{ flex: 1 }} />
                  <button className="btn" onClick={addBulkTitles} disabled={saving || !bulkText.trim()}>
                    {saving ? "Qo'shilmoqda…" : "Qo'shish"}
                  </button>
                  <button className="btn btn-ghost" onClick={() => { setShowBulkAdd(false); setBulkText(""); }}>Bekor</button>
                </div>
              </div>
            )}

            {/* Qo'shish tugmalari */}
            {!showAdd && !showFolderAdd && !showBulkAdd && (
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button className="btn btn-ghost" onClick={openAdd}>+ Dars qo'shish</button>
                <button className="btn btn-ghost" onClick={openFolderAdd}>📁 Papkadan qo'shish</button>
                <button className="btn btn-ghost" onClick={openBulkAdd}>📋 Ro'yxatdan qo'shish</button>
                <button className="btn btn-ghost" onClick={autoSort} disabled={saving || lessons.length < 2}
                  title="Darslarni rasmiy o'quv reja ketma-ketligi bo'yicha avtomatik tartiblaydi">
                  🪄 Avto tartiblash
                </button>
                <button className="btn btn-ghost" onClick={extractTitles} disabled={extracting || saving || lessons.length === 0}
                  title="AI har darsning slaydlarini to'liq o'rganadi: nom + modul + o'quv reja tartibi">
                  {extracting && aiJob
                    ? `🤖 AI o'rganmoqda… ${aiJob.done}/${aiJob.total}`
                    : "🤖 AI: nom + tartib (slayddan)"}
                </button>
              </div>
            )}
            </>
          )}
        </div>
      )}

      {toast && <div className="cur-toast">{toast}</div>}
    </div>
    </Shell>
  );
}
