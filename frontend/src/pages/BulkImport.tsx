import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import Shell from "../components/Shell";

// Ommaviy Wayground import: ko'p havolani birdan joylab, har biridan
// avtomatik quiz yaratadi (kontent slaydlar + savollar birga ko'chiriladi).
// Har bir havola alohida saqlanadi — bittasi xato bo'lsa qolganlari to'xtamaydi.

interface RowResult {
  url: string;
  status: "pending" | "running" | "ok" | "error";
  title?: string;
  count?: number;
  quizId?: string;
  error?: string;
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
  // Import qilingan slaydlar shu papkaga tushadi (egasi nomi + bugungi sana)
  const [intoFolder, setIntoFolder] = useState(true);
  const folderName = `${teacher?.name ?? "Import"} — ${todayStr()}`;
  const [folderId, setFolderId] = useState<string | null>(null);

  // Matndan 24-belgili quiz ID bor satrlarni ajratamiz, ID bo'yicha takrorni olib tashlaymiz
  const parsed = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const line of text.split(/[\s,]+/)) {
      const s = line.trim();
      const m = s.match(/[a-f0-9]{24}/i);
      if (!m) continue;
      const id = m[0].toLowerCase();
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(s);
    }
    return out;
  }, [text]);

  const done = rows.filter((r) => r.status === "ok" || r.status === "error").length;
  const okCount = rows.filter((r) => r.status === "ok").length;
  const errCount = rows.filter((r) => r.status === "error").length;
  const totalSlides = rows.reduce((a, r) => a + (r.count ?? 0), 0);

  async function start() {
    if (parsed.length === 0 || running) return;
    const initial: RowResult[] = parsed.map((u) => ({ url: u, status: "pending" }));
    setRows(initial);
    setRunning(true);

    // Tanlangan bo'lsa — avval bugungi sanali papka yaratamiz (ism + sana)
    let targetFolderId: string | null = null;
    if (intoFolder) {
      try {
        const fr = await api<{ folder: { id: string } }>("/folders", {
          method: "POST",
          body: JSON.stringify({ name: folderName }),
        });
        targetFolderId = fr.folder.id;
        setFolderId(targetFolderId);
      } catch {
        // Papka yaratilmasa ham import to'xtamaydi — slaydlar papkasiz tushadi
      }
    }

    let idx = 0;
    async function worker() {
      while (idx < parsed.length) {
        const myIdx = idx++;
        const url = parsed[myIdx];
        setRows((rs) => rs.map((x, i) => (i === myIdx ? { ...x, status: "running" } : x)));
        try {
          const r = await api<{ quizId: string; title: string; summary: { total: number } }>(
            "/import/wayground/save",
            { method: "POST", body: JSON.stringify({ url, folderId: targetFolderId }) },
          );
          setRows((rs) =>
            rs.map((x, i) =>
              i === myIdx ? { ...x, status: "ok", title: r.title, count: r.summary.total, quizId: r.quizId } : x,
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
    setRunning(false);
  }

  return (
    <Shell>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, marginBottom: 4 }}>Ommaviy import</h1>
        <p className="muted" style={{ marginTop: 0, fontSize: 15 }}>
          Wayground (Quizizz) ochiq quiz havolalarini joylang — har biridan avtomatik quiz yaratiladi
          (dars slaydlari va savollar birga ko'chiriladi). Havolalar <b>public/shared</b> bo'lishi shart.
        </p>

        <label style={{ fontWeight: 700 }}>Havolalar (har bir qatorga bittadan)</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          disabled={running}
          placeholder={"https://wayground.com/admin/quiz/...\nhttps://wayground.com/admin/quiz/...\n..."}
          style={{ fontFamily: "monospace", fontSize: 13 }}
        />
        {/* Papkaga joylash */}
        <label
          style={{
            display: "flex", alignItems: "center", gap: 8, marginTop: 10,
            padding: "10px 12px", background: "var(--surface-low)", borderRadius: 10,
            border: "1px solid var(--border)", cursor: running ? "default" : "pointer", fontSize: 14,
          }}
        >
          <input
            type="checkbox"
            checked={intoFolder}
            disabled={running}
            onChange={(e) => setIntoFolder(e.target.checked)}
            style={{ width: 18, height: 18, margin: 0 }}
          />
          <span>
            Alohida papkaga joylash:{" "}
            <b>{intoFolder ? folderName : "— (papkasiz)"}</b>
          </span>
        </label>

        <div className="between" style={{ alignItems: "center", marginTop: 10 }}>
          <span className="muted" style={{ fontSize: 13 }}>
            {parsed.length} ta yaroqli havola aniqlandi
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
              {done}/{rows.length} tugadi · ✅ {okCount} · ❌ {errCount} · jami {totalSlides} slayd
              {!running && done === rows.length && (
                <> — <Link to={folderId ? `/library?folder=${folderId}` : "/library"} style={{ color: "var(--primary)", fontWeight: 600 }}>
                  {folderId ? `"${folderName}" papkasini ochish →` : "Kutubxonaga o'tish →"}
                </Link></>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {rows.map((r, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                  background: "var(--surface-low)", borderRadius: 8, border: "1px solid var(--border)",
                }}>
                  <span style={{ fontSize: 16, width: 20, textAlign: "center", flexShrink: 0 }}>
                    {r.status === "ok" ? "✅" : r.status === "error" ? "❌" : r.status === "running" ? "⏳" : "•"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.title || r.url}
                    </div>
                    {r.status === "ok" && <div className="muted" style={{ fontSize: 12 }}>{r.count} ta slayd qo'shildi</div>}
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
