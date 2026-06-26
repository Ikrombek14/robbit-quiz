import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth } from "../auth.js";

export const searchRouter = Router();
searchRouter.use(requireAuth);

// Markdown belgilarini olib tashlab, qidiruv atrofidan qisqa parcha (snippet) yasaydi
function makeSnippet(body: string, ql: string): string {
  const plain = body
    .replace(/[#>*_`|]/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // havolalardan faqat matn
    .replace(/\s+/g, " ")
    .trim();
  const idx = plain.toLowerCase().indexOf(ql);
  if (idx === -1) return plain.slice(0, 120) + (plain.length > 120 ? "…" : "");
  const start = Math.max(0, idx - 40);
  const end = Math.min(plain.length, idx + ql.length + 80);
  return (start > 0 ? "…" : "") + plain.slice(start, end).trim() + (end < plain.length ? "…" : "");
}

// Global qidiruv: dars rejalari (mavzu) + yo'riqnoma (sarlavha va matn)
searchRouter.get("/", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) {
    res.json({ lessons: [], guide: [] });
    return;
  }
  const ql = q.toLowerCase();

  // Kichik ma'lumotlar to'plami — hammasini olib JS'da registrga sezgir bo'lmagan holda filterlaymiz
  const [allLessons, allGuide] = await Promise.all([
    prisma.lessonPlan.findMany({ orderBy: { order: "asc" } }),
    prisma.guideSection.findMany({ orderBy: { order: "asc" } }),
  ]);

  const lessons = allLessons
    .filter((l) => l.title.toLowerCase().includes(ql))
    .slice(0, 10)
    .map((l) => ({
      id: l.id,
      title: l.title,
      subject: l.subject,
      ageGroup: l.ageGroup,
      year: l.year,
      section: l.section,
      order: l.order,
      hasQuiz: Boolean(l.quizId),
    }));

  const guide = allGuide
    .map((g) => {
      const inTitle = g.title.toLowerCase().includes(ql);
      const inBody = g.body.toLowerCase().includes(ql);
      if (!inTitle && !inBody) return null;
      return {
        id: g.id,
        title: g.title,
        snippet: inBody ? makeSnippet(g.body, ql) : "",
      };
    })
    .filter((x): x is { id: string; title: string; snippet: string } => x !== null)
    .slice(0, 10);

  res.json({ lessons, guide });
});
