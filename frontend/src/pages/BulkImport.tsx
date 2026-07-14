import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import Shell from "../components/Shell";
import type { FolderItem } from "../types";

// Ommaviy Wayground import: ko'p havolani birdan joylab, har biridan
// avtomatik quiz yaratadi (kontent slaydlar + savollar birga ko'chiriladi).
// Har bir havola alohida saqlanadi — bittasi xato bo'lsa qolganlari to'xtamaydi.
// Havola bo'lmagan qator ODDIY MAVZU NOMI hisoblanadi — undan bo'sh quiz
// yaratiladi (slaydlar keyin to'ldiriladi). Xohlasa import oxirida butun papka
// o'quv dasturga darslar sifatida qo'shiladi (avto-tartiblash bilan).

interface ParsedRow {
  kind: "link" | "title"; // link — Wayground havolasi, title — oddiy mavzu nomi
  value: string;
}

interface RowResult {
  kind: "link" | "title";
  url: string;
  status: "pending" | "running" | "ok" | "error";
  title?: string;
  count?: number;
  quizId?: string;
  error?: string;
  existed?: boolean; // avval mavjud bo'lgan → qayta import qilinmadi, papkaga ko'chirildi
}

const CONCURRENCY = 3; // Wayground'ni ortiqcha yuklamaslik uchun bir vaqtda 3 ta

// Bugungi sana — YYYY-MM-DD
function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function BulkImport() {
  const { teacher } = useAuth();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<RowResult[]>([]);
  const [running, setRunning] = useState(false);
  // Ixtiyoriy Wayground login cookie — private quizlarni import qilish uchun (saqlanmaydi)
  const [wgCookie, setWgCookie] = useState("");

  // Qaysi papkaga joylash:
  //   "NEW"  → yangi "<ism> — <sana>" papkasi yaratiladi
  //   "NONE" → papkasiz
  //   <id>   → mavjud papka
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [dest, setDest] = useState<string>("NEW");
  const newFolderName = `${teacher?.name ?? "Import"} — ${todayStr()}`;
  const [folderId, setFolderId] = useState<string | null>(null); // yakunda ochish uchun
  const [folderLabel, setFolderLabel] = useState<string>(""); // ochish havolasi matni

  // O'quv dasturga qo'shish (faqat admin) — import oxirida butun papka
  // /curriculum/from-folder orqali darslarga aylanadi (dedup + avto-tartib)
  const isAdmin = teacher?.isAdmin === true;
  const [addToCurriculum, setAddToCurriculum] = useState(false);
  const [curSubject, setCurSubject] = useState<"ROBOTEXNIKA" | "DASTURLASH">("ROBOTEXNIKA");
  const [curAge, setCurAge] = useState<"MIDDLE" | "SENIOR">("MIDDLE");
  const [curYear, setCurYear] = useState(1);
  const [curSection, setCurSection] = useState("DESIGN");
  const [curResult, setCurResult] = useState<string | null>(null);

  // Mavjud papkalarni yuklaymiz (faqat o'ziniki — backend shunday qaytaradi)
  useEffect(() => {
    api<{ folders: FolderItem[] }>("/folders")
      .then((r) => setFolders(r.folders.filter((f) => f.mine)))
      .catch(() => {});
  }, []);

  // Qatorma-qator tahlil: 24-belgili quiz ID bor qator — Wayground havolasi,
  // qolgan bo'sh bo'lmagan qatorlar — oddiy mavzu nomi. Takrorlar olib tashlanadi.
  const parsed = useMemo(() => {
    const seenIds = new Set<string>();
    const seenTitles = new Set<string>();
    const out: ParsedRow[] = [];
    for (const line of text.split(/\n/)) {
      const s = line.trim().replace(/^[,;]+|[,;]+$/g, "").trim();
      if (!s) continue;
      const m = s.match(/[a-f0-9]{24}/i);
      if (m) {
        const id = m[0].toLowerCase();
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        out.push({ kind: "link", value: s });
      } else {
        const key = s.toLowerCase();
        if (seenTitles.has(key)) continue;
        seenTitles.add(key);
        out.push({ kind: "title", value: s });
      }
    }
    return out;
  }, [text]);
  const linkCount = parsed.filter((p) => p.kind === "link").length;
  const titleCount = parsed.length - linkCount;

  const done = rows.filter((r) => r.status === "ok" || r.status === "error").length;
  const okCount = rows.filter((r) => r.status === "ok").length;
  const movedCount = rows.filter((r) => r.status === "ok" && r.existed).length; // mavjud → papkaga ko'chirildi
  const newCount = okCount - movedCount; // haqiqatan yangi yaratilgan
  const errCount = rows.filter((r) => r.status === "error").length;
  const totalSlides = rows.reduce((a, r) => a + (r.existed ? 0 : r.count ?? 0), 0);

  async function start() {
    if (parsed.length === 0 || running) return;
    const initial: RowResult[] = parsed.map((p) => ({ kind: p.kind, url: p.value, status: "pending" }));
    setRows(initial);
    setRunning(true);
    setCurResult(null);

    // Manzil papkasini aniqlaymiz
    let targetFolderId: string | null = null;
    let targetLabel = "";
    if (dest === "NEW") {
      // Yangi "<ism> — <sana>" papkasini yaratamiz
      try {
        const fr = await api<{ folder: { id: string } }>("/folders", {
          method: "POST",
          body: JSON.stringify({ name: newFolderName }),
        });
        targetFolderId = fr.folder.id;
        targetLabel = newFolderName;
      } catch {
        // Papka yaratilmasa ham import to'xtamaydi — slaydlar papkasiz tushadi
      }
    } else if (dest !== "NONE") {
      // Mavjud papka tanlandi
      targetFolderId = dest;
      targetLabel = folders.find((f) => f.id === dest)?.name ?? "";
    }
    setFolderId(targetFolderId);
    setFolderLabel(targetLabel);

    // Papkada havolalar kiritilgan tartibda tursin: kutubxona `updatedAt desc`
    // bo'yicha saralaydi, shuning uchun 1-havolaga eng katta (eng yangi) vaqt
    // tamg'asini beramiz. Parallel import ham tartibni buzmaydi.
    const baseTs = Date.now();
    let idx = 0;
    async function worker() {
      while (idx < parsed.length) {
        const myIdx = idx++;
        const row = parsed[myIdx];
        const sortTs = baseTs - myIdx * 1000; // myIdx=0 → eng yangi → papkada birinchi
        setRows((rs) => rs.map((x, i) => (i === myIdx ? { ...x, status: "running" } : x)));
        try {
          // Havola → Wayground import; oddiy mavzu nomi → bo'sh quiz yaratish
          const r = row.kind === "link"
            ? await api<{ quizId: string; title: string; summary: { total: number }; existed?: boolean }>(
                "/import/wayground/save",
                { method: "POST", body: JSON.stringify({ url: row.value, folderId: targetFolderId, sortTs, cookie: wgCookie.trim() || undefined }) },
              )
            : await api<{ quizId: string; title: string; summary: { total: number }; existed?: boolean }>(
                "/import/title/save",
                { method: "POST", body: JSON.stringify({ title: row.value, folderId: targetFolderId, sortTs }) },
              );
          setRows((rs) =>
            rs.map((x, i) =>
              i === myIdx ? { ...x, status: "ok", title: r.title, count: r.summary.total, quizId: r.quizId, existed: r.existed } : x,
            ),
          );
        } catch (e) {
          setRows((rs) =>
            rs.map((x, i) => (i === myIdx ? { ...x, status: "error", error: e instanceof Error ? e.message : "Xatolik" } : x)),
          );
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, parsed.length) }, worker));

    // Import tugadi — xohlansa butun papka o'quv dasturga dars sifatida qo'shiladi
    // (from-folder: dedup + o'quv reja bo'yicha avto-tartiblash backendda ishlaydi)
    if (addToCurriculum && targetFolderId) {
      try {
        const cr = await api<{ created: number; skipped: number }>("/curriculum/from-folder", {
          method: "POST",
          body: JSON.stringify({
            subject: curSubject,
            ageGroup: curAge,
            year: curYear,
            section: curSubject === "ROBOTEXNIKA" ? curSection : null,
            folderId: targetFolderId,
            stripPrefix: true,
          }),
        });
        setCurResult(
          `📚 O'quv dasturga ${cr.created} ta dars qo'shildi${cr.skipped ? `, ${cr.skipped} ta allaqachon bor edi` : ""} — avtomatik tartiblandi.`,
        );
      } catch (e) {
        setCurResult(`⚠️ O'quv dasturga qo'shib bo'lmadi: ${e instanceof Error ? e.message : "xatolik"}`);
      }
    }
    setRunning(false);
  }

  return (
    <Shell>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, marginBottom: 4 }}>Ommaviy import</h1>
        <p className="muted" style={{ marginTop: 0, fontSize: 15 }}>
          Wayground (Quizizz) quiz havolalarini joylang — har biridan avtomatik quiz yaratiladi
          (dars slaydlari va savollar birga ko'chiriladi). Public quizlar shundoq ishlaydi;
          <b> private (maxfiy) quizlar</b> uchun pastdagi "Wayground login" bo'limini to'ldiring.
          <br />
          <b>Oddiy mavzu nomi ham bo'ladi:</b> havola bo'lmagan qator mavzu nomi hisoblanadi —
          undan bo'sh quiz yaratiladi (slaydlari keyin to'ldiriladi) va papkaga qo'shiladi.
          <br />
          <b>Takror import bo'lmaydi:</b> avval import qilingan dars qayta yaratilmaydi — mavjudi
          tanlangan papkaga ko'chiriladi. Xohlagancha qayta ishga tushiraverishingiz mumkin.
        </p>

        <label style={{ fontWeight: 700 }}>Havolalar yoki mavzu nomlari (har bir qatorga bittadan)</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          disabled={running}
          placeholder={"https://wayground.com/admin/quiz/...\nArduino 3-dars: RGB chiroq\nhttps://wayground.com/admin/quiz/...\nFigma 2-qism: shakllar bilan ishlash\n..."}
          style={{ fontFamily: "monospace", fontSize: 13 }}
        />
        {/* Papkaga joylash — qaysi papkaga tushishini tanlash */}
        <div
          style={{
            display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap",
            padding: "10px 12px", background: "var(--surface-low)", borderRadius: 10,
            border: "1px solid var(--border)", fontSize: 14,
          }}
        >
          <span className="material-symbols-outlined" style={{ color: "var(--primary)" }}>folder</span>
          <span style={{ fontWeight: 600 }}>Papka:</span>
          <select
            value={dest}
            disabled={running}
            onChange={(e) => setDest(e.target.value)}
            style={{
              flex: 1, minWidth: 220, padding: "8px 12px", borderRadius: 8,
              border: "2px solid var(--border)", background: "var(--surface)", fontSize: 14, color: "var(--ink)",
            }}
          >
            <option value="NEW">🆕 Yangi papka: {newFolderName}</option>
            {folders.length > 0 && (
              <optgroup label="Mavjud papkalar">
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>📁 {f.name} ({f.count})</option>
                ))}
              </optgroup>
            )}
            <option value="NONE">— Papkasiz —</option>
          </select>
        </div>

        {/* O'quv dasturga qo'shish — import oxirida papka darslarga aylanadi (faqat admin) */}
        {isAdmin && (
          <div
            style={{
              marginTop: 10, padding: "10px 12px", background: "var(--surface-low)",
              borderRadius: 10, border: "1px solid var(--border)", fontSize: 14,
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: dest === "NONE" ? "not-allowed" : "pointer", fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={addToCurriculum && dest !== "NONE"}
                disabled={running || dest === "NONE"}
                onChange={(e) => setAddToCurriculum(e.target.checked)}
              />
              📚 Import oxirida o'quv dasturga ham qo'shilsin
              {dest === "NONE" && <span className="muted" style={{ fontWeight: 400 }}>(papka tanlanishi kerak)</span>}
            </label>
            {addToCurriculum && dest !== "NONE" && (
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <select value={curSubject} disabled={running} onChange={(e) => setCurSubject(e.target.value as "ROBOTEXNIKA" | "DASTURLASH")}
                  style={{ padding: "6px 10px", borderRadius: 8, border: "2px solid var(--border)", background: "var(--surface)", color: "var(--ink)" }}>
                  <option value="ROBOTEXNIKA">Robotexnika</option>
                  <option value="DASTURLASH">Dasturlash</option>
                </select>
                <select value={curAge} disabled={running} onChange={(e) => setCurAge(e.target.value as "MIDDLE" | "SENIOR")}
                  style={{ padding: "6px 10px", borderRadius: 8, border: "2px solid var(--border)", background: "var(--surface)", color: "var(--ink)" }}>
                  <option value="MIDDLE">Middle (9–11)</option>
                  <option value="SENIOR">Senior (12–15)</option>
                </select>
                <select value={curYear} disabled={running} onChange={(e) => setCurYear(Number(e.target.value))}
                  style={{ padding: "6px 10px", borderRadius: 8, border: "2px solid var(--border)", background: "var(--surface)", color: "var(--ink)" }}>
                  {[1, 2, 3, 4].map((y) => <option key={y} value={y}>{y}-yil</option>)}
                </select>
                {curSubject === "ROBOTEXNIKA" && (
                  <select value={curSection} disabled={running} onChange={(e) => setCurSection(e.target.value)}
                    style={{ padding: "6px 10px", borderRadius: 8, border: "2px solid var(--border)", background: "var(--surface)", color: "var(--ink)" }}>
                    <option value="DESIGN">Design</option>
                    <option value="PROGRAMMING">Programming</option>
                    <option value="ROBOTICS">Robotics</option>
                  </select>
                )}
              </div>
            )}
          </div>
        )}

        {/* Private quizlar uchun ixtiyoriy Wayground login cookie (saqlanmaydi) */}
        <details style={{ marginTop: 10, padding: "10px 12px", background: "var(--surface-low)", borderRadius: 10, border: "1px solid var(--border)" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
            🔒 Maxfiy (private) quizlar uchun — Wayground login {wgCookie.trim() ? "✅" : "(ixtiyoriy)"}
          </summary>
          <p className="muted" style={{ fontSize: 13, margin: "8px 0" }}>
            Quizlaringiz private bo'lsa, Wayground login cookie'ingizni qo'ying. Olish: wayground.com ga
            kirgan holatda <b>F12 → Network</b> → istalgan so'rov → <b>Request Headers → Cookie</b> qatorini
            to'liq nusxalab, shu yerga joylang. <b>Cookie saqlanmaydi</b> — faqat shu import uchun ishlatiladi.
          </p>
          <textarea
            value={wgCookie}
            onChange={(e) => setWgCookie(e.target.value)}
            rows={3}
            disabled={running}
            placeholder="quizizz_uid=…; _sid=…; x-csrf-token=…"
            style={{ fontFamily: "monospace", fontSize: 12, width: "100%" }}
          />
        </details>

        <div className="between" style={{ alignItems: "center", marginTop: 10 }}>
          <span className="muted" style={{ fontSize: 13 }}>
            {linkCount} ta havola{titleCount > 0 && <> + {titleCount} ta mavzu nomi</>} aniqlandi
          </span>
          <button className="btn" onClick={start} disabled={running || parsed.length === 0}>
            <span className="material-symbols-outlined">cloud_download</span>
            {running ? `Import qilinmoqda… (${done}/${rows.length})` : `Import qilish (${parsed.length})`}
          </button>
        </div>

        {/* Jarayon progressi */}
        {rows.length > 0 && (
          <>
            <div style={{ height: 8, background: "var(--surface-high)", borderRadius: 999, overflow: "hidden", marginTop: 16 }}>
              <div style={{
                width: `${rows.length ? (done / rows.length) * 100 : 0}%`,
                height: "100%", background: "var(--primary)", transition: "width 0.3s",
              }} />
            </div>
            <div className="muted" style={{ fontSize: 13, margin: "8px 0 12px" }}>
              {done}/{rows.length} tugadi · ✅ {newCount} yangi
              {movedCount > 0 && <> · ♻️ {movedCount} mavjud (papkaga ko'chirildi)</>}
              {errCount > 0 && <> · ❌ {errCount}</>} · jami {totalSlides} slayd
              {!running && done === rows.length && (
                <> — <Link to={folderId ? `/library?folder=${folderId}` : "/library"} style={{ color: "var(--primary)", fontWeight: 600 }}>
                  {folderId ? `"${folderLabel}" papkasini ochish →` : "Kutubxonaga o'tish →"}
                </Link></>
              )}
            </div>

            {/* O'quv dasturga qo'shish natijasi */}
            {curResult && (
              <div style={{
                padding: "8px 12px", marginBottom: 12, borderRadius: 8, fontSize: 14,
                background: "var(--surface-low)", border: "1px solid var(--border)",
              }}>
                {curResult}{" "}
                <Link to="/curriculum" style={{ color: "var(--primary)", fontWeight: 600 }}>O'quv dasturni ochish →</Link>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {rows.map((r, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                  background: "var(--surface-low)", borderRadius: 8, border: "1px solid var(--border)",
                }}>
                  <span style={{ fontSize: 16, width: 20, textAlign: "center", flexShrink: 0 }}>
                    {r.status === "ok" ? (r.existed ? "♻️" : "✅") : r.status === "error" ? "❌" : r.status === "running" ? "⏳" : "•"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.kind === "title" && <span title="Oddiy mavzu nomi — bo'sh quiz yaratiladi">📝 </span>}
                      {r.title || r.url}
                    </div>
                    {r.status === "ok" && (
                      <div className="muted" style={{ fontSize: 12 }}>
                        {r.existed
                          ? "Avval mavjud — papkaga ko'chirildi (qayta yaratilmadi)"
                          : r.kind === "title"
                            ? "Bo'sh quiz yaratildi — slaydlari keyin to'ldiriladi"
                            : `${r.count} ta slayd qo'shildi`}
                      </div>
                    )}
                    {r.status === "error" && <div style={{ fontSize: 12, color: "var(--error)" }}>{r.error}</div>}
                  </div>
                  {r.status === "ok" && r.quizId && (
                    <Link to={`/quiz/${r.quizId}`} className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 13, flexShrink: 0 }}>
                      Ochish
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}
