import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import Shell from "../components/Shell";
import type { QuizListItem, Quiz, FolderItem } from "../types";

const EMOJIS = ["🚀", "🌍", "📐", "🔬", "🎨", "📚", "🧮", "🌟", "🦋", "🎯"];

// O'quv rejaga ommaviy joylash uchun (faqat admin)
const BULK_SUBJECTS = [
  { key: "ROBOTEXNIKA", label: "Robotexnika" },
  { key: "DASTURLASH", label: "Dasturlash" },
];
const BULK_AGES = [
  { key: "MIDDLE", label: "Middle" },
  { key: "SENIOR", label: "Senior" },
];
const BULK_SECTIONS = [
  { key: "DESIGN", label: "Design" },
  { key: "PROGRAMMING", label: "Programming" },
  { key: "ROBOTICS", label: "Robotics" },
];

// Papka filtri: barchasi | papkasiz | aniq papka id
type FolderFilter = "ALL" | "NONE" | string;

export default function Library() {
  const navigate = useNavigate();
  const { teacher } = useAuth();
  const [searchParams] = useSearchParams();
  const isAdmin = teacher?.isAdmin === true;
  const canCreate = !!(teacher?.isAdmin || teacher?.canCreate); // "slayd qilish" ruxsati
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulk, setShowBulk] = useState(false);
  const [showMove, setShowMove] = useState(false);

  // Papka filtri — URL'dagi ?folder=... bo'lsa o'shani ochamiz (ommaviy importdan keyin)
  const [folderFilter, setFolderFilter] = useState<FolderFilter>(searchParams.get("folder") || "ALL");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [showFolderMove, setShowFolderMove] = useState(false); // papkani boshqa papkaga ko'chirish modali

  function toggleSelect(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function load() {
    try {
      const [qr, fr] = await Promise.all([
        api<{ quizzes: QuizListItem[] }>("/quizzes"),
        api<{ folders: FolderItem[] }>("/folders"),
      ]);
      setQuizzes(qr.quizzes);
      setFolders(fr.folders);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function createQuiz() {
    const r = await api<{ quiz: Quiz }>("/quizzes", {
      method: "POST",
      body: JSON.stringify({ title: "Yangi loyiha", slides: [] }),
    });
    // Papka ichida turgan bo'lsak — yangi loyiha o'sha papkaga tushadi
    if (folderFilter !== "ALL" && folderFilter !== "NONE") {
      await api("/quizzes/move", {
        method: "POST",
        body: JSON.stringify({ ids: [r.quiz.id], folderId: folderFilter }),
      }).catch(() => {});
    }
    navigate(`/quiz/${r.quiz.id}`);
  }

  async function remove(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Loyihani o'chirishni tasdiqlaysizmi?")) return;
    await api(`/quizzes/${id}`, { method: "DELETE" });
    setQuizzes((qs) => qs.filter((x) => x.id !== id));
  }

  // Joriy joylashuv: papka ichida bo'lsak — o'sha papka id, aks holda null (ildiz)
  const currentFolderId = folderFilter !== "ALL" && folderFilter !== "NONE" ? folderFilter : null;

  // Yangi papka yaratish — joriy papka ichida bo'lsak, uning ichiga (parentId) tushadi
  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    const r = await api<{ folder: FolderItem }>("/folders", {
      method: "POST",
      body: JSON.stringify({ name, parentId: currentFolderId }),
    });
    setFolders((fs) => [{ ...r.folder, count: 0, mine: true, parentId: currentFolderId }, ...fs]);
    setNewFolderName("");
    setCreatingFolder(false);
    setFolderFilter(r.folder.id);
  }

  // Papkani boshqa papka ichiga (yoki ildizga: parentId=null) ko'chirish
  async function moveFolderTo(parentId: string | null) {
    if (!currentFolderId) return;
    await api(`/folders/${currentFolderId}/parent`, {
      method: "PATCH",
      body: JSON.stringify({ parentId }),
    });
    setFolders((fs) => fs.map((f) => (f.id === currentFolderId ? { ...f, parentId } : f)));
    setShowFolderMove(false);
    // Ko'chirilgandan keyin manzil papkaga o'tamiz (yo'q bo'lsa ildizga)
    setFolderFilter(parentId ?? "ALL");
  }

  // Joriy papka nomini o'zgartirish
  async function renameFolder(id: string) {
    const cur = folders.find((f) => f.id === id);
    const name = prompt("Papka nomi:", cur?.name ?? "")?.trim();
    if (!name || name === cur?.name) return;
    await api(`/folders/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
    setFolders((fs) => fs.map((f) => (f.id === id ? { ...f, name } : f)));
  }

  // Papkani o'chirish (ichidagi loyihalar saqlanadi, papkasiz bo'lib qoladi)
  async function deleteFolder(id: string) {
    if (!confirm("Papkani o'chirasizmi? Ichidagi loyihalar o'chmaydi, papkadan chiqariladi.")) return;
    await api(`/folders/${id}`, { method: "DELETE" });
    // Ichki papkalar o'chmaydi — ildizga chiqadi (backend FK SetNull)
    setFolders((fs) => fs.filter((f) => f.id !== id).map((f) => (f.parentId === id ? { ...f, parentId: null } : f)));
    setQuizzes((qs) => qs.map((x) => (x.folderId === id ? { ...x, folderId: null } : x)));
    setFolderFilter("ALL");
  }

  // Bir nechta loyihani papkaga ko'chirish (yoki papkadan chiqarish: folderId=null)
  async function moveSelected(folderId: string | null) {
    const ids = [...selected];
    if (ids.length === 0) return;
    await api("/quizzes/move", { method: "POST", body: JSON.stringify({ ids, folderId }) });
    setQuizzes((qs) => qs.map((x) => (selected.has(x.id) ? { ...x, folderId } : x)));
    setSelected(new Set());
    setShowMove(false);
  }

  const needle = q.toLowerCase();
  const matchesSearch = (x: QuizListItem) =>
    x.title.toLowerCase().includes(needle) ||
    (isAdmin && (x.owner?.name.toLowerCase().includes(needle) || x.owner?.email.toLowerCase().includes(needle)));

  // Papka bo'yicha sonlarni mahalliy hisoblaymiz (ko'chirgandan keyin ham aniq turadi)
  const noFolderCount = useMemo(() => quizzes.filter((x) => !x.folderId).length, [quizzes]);
  const folderCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of quizzes) if (x.folderId) m.set(x.folderId, (m.get(x.folderId) ?? 0) + 1);
    return m;
  }, [quizzes]);

  const filtered = quizzes.filter((x) => {
    if (!matchesSearch(x)) return false;
    if (folderFilter === "ALL") return true;
    if (folderFilter === "NONE") return !x.folderId;
    return x.folderId === folderFilter;
  });

  const activeFolderObj = folders.find((f) => f.id === folderFilter);

  // Joriy darajadagi papkalar: joriy papkaning bevosita ichki papkalari
  // (ildizda — parentId yo'q papkalar). Ichma-ich navigatsiya shu bilan ishlaydi.
  const visibleFolders = useMemo(
    () => folders.filter((f) => (f.parentId ?? null) === currentFolderId),
    [folders, currentFolderId],
  );

  // Har bir papkaning bevosita ichki papkalari soni (chipda 📁 sifatida ko'rsatamiz)
  const childCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of folders) if (f.parentId) m.set(f.parentId, (m.get(f.parentId) ?? 0) + 1);
    return m;
  }, [folders]);

  // Breadcrumb: joriy papkadan ildizgacha yo'l (Kutubxona > A > B)
  const folderPath = useMemo(() => {
    const path: FolderItem[] = [];
    let cur = activeFolderObj;
    let guard = 0;
    while (cur && guard++ < 50) {
      path.unshift(cur);
      cur = cur.parentId ? folders.find((f) => f.id === cur!.parentId) : undefined;
    }
    return path;
  }, [activeFolderObj, folders]);

  // Joriy papkaning barcha avlodlari (o'ziga ko'chirish taqiqlash uchun)
  const currentDescendants = useMemo(() => {
    const set = new Set<string>();
    if (!currentFolderId) return set;
    const stack = [currentFolderId];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const f of folders) {
        if (f.parentId === cur && !set.has(f.id)) {
          set.add(f.id);
          stack.push(f.id);
        }
      }
    }
    return set;
  }, [currentFolderId, folders]);

  return (
    <Shell>
      <div className="between">
        <h1 style={{ fontSize: 28 }}>{isAdmin ? "Barcha loyihalar" : "Kutubxonam"}</h1>
        <div className="row" style={{ gap: 8 }}>
          {canCreate && (
            <button
              className="btn btn-ghost"
              disabled={selected.size === 0}
              onClick={() => setShowMove(true)}
              title="Tanlangan loyihalarni papkaga ko'chirish"
            >
              <span className="material-symbols-outlined">drive_file_move</span>
              Papkaga ko'chirish{selected.size > 0 ? ` (${selected.size})` : ""}
            </button>
          )}
          {isAdmin && (
            <button
              className="btn btn-ghost"
              disabled={selected.size === 0}
              onClick={() => setShowBulk(true)}
              title="Tanlangan darslarni o'quv rejaga qo'shish"
            >
              <span className="material-symbols-outlined">playlist_add</span>
              O'quv rejaga qo'shish{selected.size > 0 ? ` (${selected.size})` : ""}
            </button>
          )}
          {canCreate && <button className="btn" onClick={createQuiz}>+ Yangi loyiha</button>}
        </div>
      </div>
      {isAdmin && (
        <p className="muted" style={{ marginTop: 4 }}>
          Admin sifatida barcha o'qituvchilarning loyihalarini ko'rasiz.
        </p>
      )}

      {/* Breadcrumb — ichma-ich papkada joylashuvni ko'rsatadi (Kutubxona > A > B) */}
      {folderPath.length > 0 && (
        <div className="row" style={{ gap: 4, flexWrap: "wrap", marginTop: 12, alignItems: "center", fontSize: 14 }}>
          <button
            type="button"
            onClick={() => setFolderFilter("ALL")}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--primary)", fontWeight: 600, padding: 0 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: "middle" }}>home</span> Kutubxona
          </button>
          {folderPath.map((f, i) => (
            <span key={f.id} className="row" style={{ gap: 4, alignItems: "center" }}>
              <span className="muted">/</span>
              <button
                type="button"
                onClick={() => setFolderFilter(f.id)}
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: 0,
                  color: i === folderPath.length - 1 ? "var(--ink)" : "var(--primary)",
                  fontWeight: i === folderPath.length - 1 ? 700 : 600,
                }}
              >
                📁 {f.name}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Papkalar paneli — joriy darajadagi papkalar */}
      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
        <FolderChip
          label="Hammasi"
          icon="apps"
          count={quizzes.length}
          active={folderFilter === "ALL"}
          onClick={() => setFolderFilter("ALL")}
        />
        {visibleFolders.map((f) => (
          <FolderChip
            key={f.id}
            label={f.name}
            icon="folder"
            count={folderCounts.get(f.id) ?? f.count}
            childCount={childCounts.get(f.id) ?? 0}
            active={folderFilter === f.id}
            onClick={() => setFolderFilter(f.id)}
          />
        ))}
        {currentFolderId === null && noFolderCount > 0 && (
          <FolderChip
            label="Papkasiz"
            icon="folder_off"
            count={noFolderCount}
            active={folderFilter === "NONE"}
            onClick={() => setFolderFilter("NONE")}
          />
        )}
        {canCreate &&
          (creatingFolder ? (
            <div className="row" style={{ gap: 6 }}>
              <input
                autoFocus
                placeholder="Papka nomi…"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createFolder();
                  if (e.key === "Escape") setCreatingFolder(false);
                }}
                style={{ marginBottom: 0, width: 160, padding: "6px 10px" }}
              />
              <button className="btn" style={{ padding: "6px 12px" }} onClick={createFolder} disabled={!newFolderName.trim()}>
                Saqlash
              </button>
              <button className="btn btn-ghost" style={{ padding: "6px 10px" }} onClick={() => setCreatingFolder(false)}>
                ✕
              </button>
            </div>
          ) : (
            <button
              className="btn btn-ghost"
              style={{ padding: "6px 12px", fontSize: 13 }}
              onClick={() => setCreatingFolder(true)}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>create_new_folder</span>
              Yangi papka
            </button>
          ))}
      </div>

      {/* Joriy papka boshqaruvi (nomini o'zgartirish / o'chirish) */}
      {activeFolderObj && (
        <div className="row" style={{ gap: 8, marginTop: 8, alignItems: "center" }}>
          <span className="muted text-sm">
            📁 <b>{activeFolderObj.name}</b>
            {isAdmin && activeFolderObj.owner && !activeFolderObj.mine && <> · 👤 {activeFolderObj.owner.name}</>}
          </span>
          {(activeFolderObj.mine || isAdmin) && (
            <>
              <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 12 }} onClick={() => renameFolder(activeFolderObj.id)}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span> Nomi
              </button>
              <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 12 }} onClick={() => setShowFolderMove(true)}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>drive_file_move</span> Boshqa papkaga
              </button>
              <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 12, color: "var(--error)" }} onClick={() => deleteFolder(activeFolderObj.id)}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span> O'chirish
              </button>
            </>
          )}
        </div>
      )}

      <input
        placeholder={isAdmin ? "🔍 Nomi yoki o'qituvchi bo'yicha qidirish…" : "🔍 Nomi bo'yicha qidirish…"}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginTop: 12 }}
      />

      {canCreate && !loading && filtered.length > 0 && (
        <div className="row" style={{ gap: 10, marginTop: 4, marginBottom: 4 }}>
          <button
            className="btn btn-ghost"
            style={{ padding: "4px 10px", fontSize: 13 }}
            onClick={() => setSelected(new Set(filtered.map((x) => x.id)))}
          >
            Hammasini belgilash
          </button>
          {selected.size > 0 && (
            <button
              className="btn btn-ghost"
              style={{ padding: "4px 10px", fontSize: 13 }}
              onClick={() => setSelected(new Set())}
            >
              Bekor qilish ({selected.size})
            </button>
          )}
        </div>
      )}

      {loading ? (
        <p className="muted">Yuklanmoqda…</p>
      ) : filtered.length === 0 ? (
        <div className="card">
          <p className="muted">{quizzes.length === 0 ? "Hali loyiha yo'q." : "Topilmadi."}</p>
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          {filtered.map((item, i) => (
            <div key={item.id} className="lib-row" style={{ cursor: "pointer" }} onClick={() => navigate(`/activity/${item.id}`)}>
              <div className="lib-thumb">{EMOJIS[i % EMOJIS.length]}</div>
              <div style={{ flex: 1, overflow: "hidden" }}>
                <strong className="font-head">{item.title}</strong>
                <div className="muted text-sm">
                  {item._count.slides} ta slayd
                  {isAdmin && item.owner && !item.mine && <> · 👤 {item.owner.name}</>}
                  {isAdmin && item.mine && <> · 👤 Siz</>}
                </div>
              </div>
              {canCreate && (
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleSelect(item.id)}
                  title="Tanlash (papkaga ko'chirish / o'quv rejaga qo'shish)"
                  style={{ width: 22, height: 22, margin: 0, flexShrink: 0, cursor: "pointer" }}
                />
              )}
              <button
                className="btn btn-secondary"
                disabled={item._count.slides === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/host/${item.id}`);
                }}
              >
                ▶ Boshlash
              </button>
              {canCreate && (
                <>
                  <button
                    className="w-11 h-11 rounded-xl flex items-center justify-center"
                    style={{ background: "#cae6ff", color: "#004f75" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/quiz/${item.id}`);
                    }}
                    title="Tahrirlash"
                  >
                    <span className="material-symbols-outlined">edit</span>
                  </button>
                  <button
                    className="w-11 h-11 rounded-xl flex items-center justify-center"
                    style={{ background: "#ffdad6", color: "#ba1a1a" }}
                    onClick={(e) => remove(item.id, e)}
                    title="O'chirish"
                  >
                    <span className="material-symbols-outlined">delete</span>
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {showBulk && (
        <BulkPlaceModal
          quizzes={filtered.filter((x) => selected.has(x.id))}
          onClose={() => setShowBulk(false)}
          onDone={(n) => {
            setShowBulk(false);
            setSelected(new Set());
            alert(`✅ ${n} ta dars o'quv rejaga qo'shildi`);
          }}
        />
      )}

      {showMove && (
        <MoveModal
          count={selected.size}
          folders={folders}
          onClose={() => setShowMove(false)}
          onCreate={createFolder}
          onPick={moveSelected}
          newFolderName={newFolderName}
          setNewFolderName={setNewFolderName}
        />
      )}

      {showFolderMove && activeFolderObj && (
        <FolderMoveModal
          folderName={activeFolderObj.name}
          // O'ziga va o'z avlodlariga ko'chirib bo'lmaydi
          options={folders.filter(
            (f) => f.id !== currentFolderId && !currentDescendants.has(f.id) && (f.mine || isAdmin),
          )}
          onClose={() => setShowFolderMove(false)}
          onPick={moveFolderTo}
        />
      )}
    </Shell>
  );
}

/* ============ Papka chipi ============ */
function FolderChip({
  label, icon, count, active, onClick, childCount = 0,
}: { label: string; icon: string; count: number; active: boolean; onClick: () => void; childCount?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "6px 14px", borderRadius: 999, border: "2px solid",
        borderColor: active ? "var(--primary)" : "var(--border)",
        background: active ? "var(--primary-soft)" : "transparent",
        color: active ? "var(--primary)" : "var(--ink)",
        fontWeight: 600, fontSize: 14, cursor: "pointer", whiteSpace: "nowrap",
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{icon}</span>
      {label}
      <span style={{ opacity: 0.7, fontWeight: 700 }}>{count}</span>
      {childCount > 0 && (
        <span style={{ opacity: 0.7, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 2 }}>
          · <span className="material-symbols-outlined" style={{ fontSize: 15 }}>folder</span>{childCount}
        </span>
      )}
    </button>
  );
}

/* ============ Papkaga ko'chirish modali ============ */
// Tanlangan loyihalarni bitta papkaga ko'chiradi (yoki papkadan chiqaradi).
function MoveModal({
  count, folders, onClose, onPick, onCreate, newFolderName, setNewFolderName,
}: {
  count: number;
  folders: FolderItem[];
  onClose: () => void;
  onPick: (folderId: string | null) => void;
  onCreate: () => Promise<void>;
  newFolderName: string;
  setNewFolderName: (s: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card card-narrow" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "82vh", overflowY: "auto" }}>
        <div className="between">
          <h3 style={{ margin: 0 }}>📁 Papkaga ko'chirish</h3>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          {count} ta loyiha tanlandi. Qaysi papkaga ko'chiramiz?
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          <button className="btn btn-ghost" style={{ justifyContent: "flex-start" }} onClick={() => onPick(null)}>
            <span className="material-symbols-outlined">folder_off</span> Papkasiz (papkadan chiqarish)
          </button>
          {folders.map((f) => (
            <button key={f.id} className="btn btn-ghost" style={{ justifyContent: "flex-start" }} onClick={() => onPick(f.id)}>
              <span className="material-symbols-outlined">folder</span> {f.name}
              <span className="muted" style={{ marginLeft: "auto" }}>{f.count}</span>
            </button>
          ))}
        </div>

        {creating ? (
          <div className="row" style={{ gap: 6, marginTop: 10 }}>
            <input
              autoFocus
              placeholder="Yangi papka nomi…"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onCreate()}
              style={{ marginBottom: 0, flex: 1, padding: "8px 10px" }}
            />
            <button className="btn" onClick={onCreate} disabled={!newFolderName.trim()}>Yaratish</button>
          </div>
        ) : (
          <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => setCreating(true)}>
            <span className="material-symbols-outlined">create_new_folder</span> Yangi papka yaratish
          </button>
        )}
      </div>
    </div>
  );
}

/* ============ Papkani boshqa papka ichiga ko'chirish ============ */
// Joriy papkani boshqa papka ichiga (yoki ildizga) ko'chiradi. O'ziga va
// o'z ichki papkalariga ko'chirish ro'yxatda ko'rsatilmaydi (sikl bo'lmasin).
function FolderMoveModal({
  folderName, options, onClose, onPick,
}: {
  folderName: string;
  options: FolderItem[];
  onClose: () => void;
  onPick: (parentId: string | null) => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card card-narrow" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "82vh", overflowY: "auto" }}>
        <div className="between">
          <h3 style={{ margin: 0 }}>📂 "{folderName}" papkasini ko'chirish</h3>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          Qaysi papka ichiga joylaymiz?
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          <button className="btn btn-ghost" style={{ justifyContent: "flex-start" }} onClick={() => onPick(null)}>
            <span className="material-symbols-outlined">home</span> Asosiy (ildizga chiqarish)
          </button>
          {options.map((f) => (
            <button key={f.id} className="btn btn-ghost" style={{ justifyContent: "flex-start" }} onClick={() => onPick(f.id)}>
              <span className="material-symbols-outlined">folder</span> {f.name}
            </button>
          ))}
          {options.length === 0 && (
            <p className="muted" style={{ fontSize: 13 }}>Boshqa mos papka yo'q.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============ O'quv rejaga ommaviy joylash (faqat admin) ============ */
// Tanlangan darslarni BITTA yo'nalish/yosh toifa/yil/bo'limga, ketma-ket tartib
// raqamlari bilan joylaydi (mas: Scratch 1–15 → Dasturlash 1-yil, #1…#15).
// Har bir dars uchun alohida muharrirga kirish shart emas.
function BulkPlaceModal({
  quizzes,
  onClose,
  onDone,
}: {
  quizzes: QuizListItem[];
  onClose: () => void;
  onDone: (n: number) => void;
}) {
  const [subject, setSubject] = useState("DASTURLASH");
  const [section, setSection] = useState("DESIGN");
  const [ageGroup, setAgeGroup] = useState("MIDDLE");
  const [year, setYear] = useState(1);
  const [startOrder, setStartOrder] = useState(1);
  const [isDemo, setIsDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState("");

  async function apply() {
    if (quizzes.length === 0) return;
    setBusy(true);
    setErr("");
    setProgress(0);
    let ok = 0;
    try {
      for (let i = 0; i < quizzes.length; i++) {
        await api("/curriculum", {
          method: "POST",
          body: JSON.stringify({
            subject,
            ageGroup,
            year,
            section: subject === "ROBOTEXNIKA" ? section : null,
            order: startOrder - 1 + i,
            title: quizzes[i].title,
            author: null,
            isDemo,
            quizId: quizzes[i].id,
          }),
        });
        ok++;
        setProgress(ok);
      }
      onDone(ok);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Xatolik. Birozdan keyin urinib ko'ring.");
    } finally {
      setBusy(false);
    }
  }

  const chip = (active: boolean): React.CSSProperties => ({
    padding: "6px 14px",
    borderRadius: 8,
    border: "2px solid",
    borderColor: active ? "var(--primary)" : "var(--border)",
    background: active ? "var(--primary-soft)" : "transparent",
    color: active ? "var(--primary)" : "var(--ink)",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
  });

  return (
    <div className="modal-overlay" onClick={busy ? undefined : onClose}>
      <div className="card card-narrow" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "88vh", overflowY: "auto" }}>
        <div className="between">
          <h3 style={{ margin: 0 }}>📚 O'quv rejaga qo'shish</h3>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>✕</button>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          {quizzes.length} ta dars tanlandi. Hammasi quyidagi joyga, ketma-ket tartib raqamlari bilan qo'shiladi.
        </p>

        <div className="muted text-sm" style={{ fontWeight: 700, marginBottom: 6 }}>Yo'nalish</div>
        <div className="row" style={{ gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {BULK_SUBJECTS.map((s) => (
            <button key={s.key} type="button" style={chip(subject === s.key)} onClick={() => setSubject(s.key)}>
              {s.label}
            </button>
          ))}
        </div>

        {subject === "ROBOTEXNIKA" && (
          <>
            <div className="muted text-sm" style={{ fontWeight: 700, marginBottom: 6 }}>Bo'lim</div>
            <div className="row" style={{ gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
              {BULK_SECTIONS.map((s) => (
                <button key={s.key} type="button" style={chip(section === s.key)} onClick={() => setSection(s.key)}>
                  {s.label}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="muted text-sm" style={{ fontWeight: 700, marginBottom: 6 }}>Yosh toifa</div>
        <div className="row" style={{ gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {BULK_AGES.map((a) => (
            <button key={a.key} type="button" style={chip(ageGroup === a.key)} onClick={() => setAgeGroup(a.key)}>
              {a.label}
            </button>
          ))}
        </div>

        <div className="muted text-sm" style={{ fontWeight: 700, marginBottom: 6 }}>O'quv yili</div>
        <div className="row" style={{ gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {[1, 2].map((y) => (
            <button key={y} type="button" style={chip(year === y)} onClick={() => setYear(y)}>
              {y}-yil
            </button>
          ))}
        </div>

        <div className="row" style={{ gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ width: 130 }}>
            <div className="muted text-sm" style={{ fontWeight: 700, marginBottom: 6 }}>Boshlang'ich #</div>
            <input
              type="number"
              min={1}
              value={startOrder}
              onChange={(e) => setStartOrder(Number(e.target.value) || 1)}
              style={{ textAlign: "center", marginBottom: 0 }}
            />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 8, cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
            <input type="checkbox" checked={isDemo} onChange={(e) => setIsDemo(e.target.checked)} />
            Demo Day
          </label>
        </div>

        {/* Tartib oldindan ko'rinishi */}
        <div style={{ marginTop: 14, maxHeight: 180, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 10, padding: 8 }}>
          {quizzes.map((qz, i) => (
            <div key={qz.id} style={{ display: "flex", gap: 8, fontSize: 13, padding: "3px 4px" }}>
              <span style={{ fontWeight: 700, color: "var(--primary)", minWidth: 34 }}>#{startOrder + i}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{qz.title}</span>
            </div>
          ))}
        </div>

        {err && <div className="error" style={{ marginTop: 12 }}>{err}</div>}

        <button className="btn btn-block" style={{ marginTop: 14 }} onClick={apply} disabled={busy || quizzes.length === 0}>
          {busy ? `Qo'shilmoqda… (${progress}/${quizzes.length})` : `${quizzes.length} ta darsni qo'shish`}
        </button>
        <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
          Tartib raqamlarini keyin "O'quv dastur" sahifasida yoki har quiz sozlamalarida o'zgartirsa bo'ladi.
        </p>
      </div>
    </div>
  );
}
