import { useState } from "react";
import { api, uploadBlob } from "../api";
import Shell from "../components/Shell";

// SINOV SAHIFASI: rasm ichidagi matnni AI (Gemini Nano Banana) bilan tahrirlash.
// Maqsad — PDF slayd rasmlaridagi imloviy xatolarni tuzatish sifatini baholash.
// Manzil: /image-test (menyuda ko'rinmaydi, to'g'ridan ochiladi).
// Sinov muvaffaqiyatli bo'lsa, bu imkoniyat quiz muharririga to'liq integratsiya qilinadi.

export default function ImageEditTest() {
  const [imageUrl, setImageUrl] = useState("");
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [error, setError] = useState("");

  async function onFile(f: File | null) {
    if (!f) return;
    setError("");
    try {
      setProgress("Rasm yuklanmoqda...");
      const url = await uploadBlob(f, f.name);
      setImageUrl(url);
      setResultUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yuklash xatosi");
    } finally {
      setProgress("");
    }
  }

  async function run() {
    if (busy) return;
    const img = imageUrl.trim();
    if (!img) {
      setError("Avval rasm yuklang yoki URL kiriting");
      return;
    }
    if (instruction.trim().length < 3) {
      setError("Tahrir buyrug'ini yozing (masalan: 'malumot' so'zini 'ma'lumot'ga almashtir)");
      return;
    }
    setBusy(true);
    setError("");
    setResultUrl("");
    setProgress("AI rasmni tahrirlayapti — odatda 10-30 soniya...");
    try {
      const { jobId } = await api<{ jobId: string }>("/pdf/edit-image", {
        method: "POST",
        body: JSON.stringify({ image: img, instruction: instruction.trim() }),
      });
      const deadline = Date.now() + 3 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        const st = await api<{ status: string; url?: string; error?: string }>(`/pdf/edit-image/${jobId}`);
        if (st.status === "done") {
          setResultUrl(st.url ?? "");
          setProgress("");
          setBusy(false);
          return;
        }
        if (st.status === "error") throw new Error(st.error || "AI xatoligi");
      }
      throw new Error("AI javobi juda uzoq kutildi. Qayta urinib ko'ring.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI xatoligi");
      setProgress("");
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="font-head text-2xl font-bold text-ink">🧪 Rasm tahriri (sinov)</h1>
        <p className="mt-2 text-ink/70">
          Slayd rasmidagi imloviy xatoni AI bilan tuzatish sinovi. Rasm yuklang, nimani
          o'zgartirish kerakligini yozing — AI rasmni qayta chizib beradi. Asl rasm o'zgarmaydi.
        </p>

        <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <label className="block font-semibold text-ink">1. Slayd rasmi</label>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
            <span className="text-sm text-ink/50">yoki URL:</span>
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => {
                setImageUrl(e.target.value);
                setResultUrl("");
              }}
              placeholder="/uploads/... yoki https://..."
              className="min-w-[260px] flex-1 rounded-xl border border-ink/15 px-3 py-2 text-sm"
            />
          </div>

          <label className="mt-5 block font-semibold text-ink">2. Nimani tuzatish kerak?</label>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={2}
            placeholder={`Masalan: "malumot" so'zini "ma'lumot" ga almashtir`}
            className="mt-2 w-full rounded-xl border border-ink/15 px-3 py-2 text-sm"
          />

          <button
            onClick={run}
            disabled={busy}
            className="mt-4 rounded-xl bg-primary px-6 py-3 font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "⏳ Tahrirlanmoqda..." : "✨ Tahrirlash"}
          </button>

          {progress && <p className="mt-3 text-sm text-ink/60">{progress}</p>}
          {error && (
            <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
          )}
        </div>

        {(imageUrl || resultUrl) && (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {imageUrl && (
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="mb-2 font-semibold text-ink">Asl rasm</div>
                <img src={imageUrl} alt="Asl" className="w-full rounded-xl border border-ink/10" />
              </div>
            )}
            {resultUrl && (
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="mb-2 font-semibold text-ink">✅ Tahrirlangan</div>
                <img src={resultUrl} alt="Natija" className="w-full rounded-xl border border-ink/10" />
                <a
                  href={resultUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-sm text-primary underline"
                >
                  Yangi oynada ochish
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}
