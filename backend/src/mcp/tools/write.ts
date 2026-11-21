import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { slideInputShape, slideChangesShape, slideInputSchema, LIMITS } from "../../lib/slideValidate.js";
import { guard, ok, run, McpToolError, type McpContext } from "../context.js";
import {
  proposeCreateQuiz,
  proposeAddSlide,
  proposeUpdateSlide,
  confirmAction,
  cancelAction,
  writeRateLimited,
} from "../actions.js";

// ---- Yozuvchi tool'lar (2-bosqich). Hech biri birinchi chaqiruvda SAQLAMAYDI. ----
// O'chirish tool'i ATAYLAB yo'q: slayd va quizni faqat platformaning o'zida o'chirish mumkin.

const CONFIRM_RULE =
  "MUHIM: bu tool HECH NARSANI SAQLAMAYDI — faqat taklif yaratadi. Natijadagi preview'ni foydalanuvchiga " +
  "to'liq ko'rsating va uning ANIQ roziligini (masalan \"ha\", \"tasdiqlayman\") olmaguningizcha confirm_action'ni chaqirmang. " +
  "Foydalanuvchi rad etsa — cancel_action.";
const READ_FIRST = "O'zgartirishdan oldin get_quiz / get_slide bilan joriy holatni va quiz versiyasini (version) o'qing.";

const PROPOSE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;

function limitProposals(ctx: McpContext): void {
  if (writeRateLimited(`propose:${ctx.grantId}`)) throw new McpToolError("Juda ko'p taklif. Bir daqiqadan keyin qayta urinib ko'ring.");
}

export function registerWriteTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    "create_quiz",
    {
      title: "Yangi quiz yaratish (tasdiq bilan)",
      description:
        "Yangi quiz yaratishni TAKLIF qiladi: nomi, ixtiyoriy papka (list_folders'dagi id) va ixtiyoriy slaydlar ro'yxati " +
        `(ko'pi bilan ${LIMITS.maxSlidesPerCreate} ta). Slayd formati add_slide'dagi bilan bir xil. ` +
        CONFIRM_RULE,
      inputSchema: {
        title: z.string().min(1).max(200).describe("Quiz nomi"),
        description: z.string().max(1000).optional().describe("Qisqa tavsif"),
        folderId: z.string().max(100).optional().describe("Papka id (ixtiyoriy)"),
        slides: z.array(slideInputSchema).max(LIMITS.maxSlidesPerCreate).optional(),
      },
      annotations: PROPOSE,
    },
    (args) =>
      run(async () => {
        const me = await guard(ctx, "quiz:write");
        limitProposals(ctx);
        return ok(await proposeCreateQuiz(ctx, me, args));
      }),
  );

  server.registerTool(
    "add_slide",
    {
      title: "Slayd qo'shish (tasdiq bilan)",
      description:
        "Quizga bitta slayd qo'shishni TAKLIF qiladi. kind=QUESTION + type (SINGLE, MULTIPLE, TRUE_FALSE, DROPDOWN, POLL, OPEN, " +
        "FILL_BLANK, MATCH, REORDER) yoki kind=CONTENT (title, body, imageUrl). position — 1 dan boshlab o'rin " +
        "(berilmasa — oxiriga). Qoidalar: SINGLE/DROPDOWN — aynan 1 ta to'g'ri, MULTIPLE — kamida 1 ta, POLL — to'g'ri javobsiz, " +
        "variantlar 2–8 ta; TRUE_FALSE — statementIsTrue; FILL_BLANK — matndagi har bir ___ uchun blanks'da javoblar; " +
        "MATCH — 2–10 juftlik; REORDER — 2–10 element to'g'ri tartibda. " +
        READ_FIRST + " " + CONFIRM_RULE,
      inputSchema: {
        quizId: z.string().min(1).max(100),
        quizVersion: z.number().int().min(1).describe("get_quiz'dagi version"),
        position: z.number().int().min(1).max(LIMITS.maxSlidesPerQuiz + 1).optional(),
        slide: z.object(slideInputShape),
      },
      annotations: PROPOSE,
    },
    (args) =>
      run(async () => {
        const me = await guard(ctx, "quiz:write");
        limitProposals(ctx);
        return ok(await proposeAddSlide(ctx, me, args));
      }),
  );

  server.registerTool(
    "update_slide",
    {
      title: "Slaydni qisman tahrirlash (tasdiq bilan)",
      description:
        "Bitta slaydning FAQAT yuborilgan maydonlarini o'zgartirishni TAKLIF qiladi (qolganlari tegilmaydi). " +
        "null — maydonni tozalash (imageUrl, notes, body). Faqat shu slayd turiga tegishli maydonlar qabul qilinadi. " +
        "To'g'ri javobni almashtirish: correct — variantlar tartib raqamlari (0 dan). Kanvas kontent slaydda: elements[{id, text, x, y, w, h}]. " +
        "Natija to'liq tekshiriladi (masalan bitta javobli savolda aynan bitta to'g'ri javob). " +
        READ_FIRST + " " + CONFIRM_RULE,
      inputSchema: {
        quizId: z.string().min(1).max(100),
        quizVersion: z.number().int().min(1).describe("get_quiz / get_slide'dagi version"),
        slideId: z.string().min(1).max(100),
        changes: z.object(slideChangesShape),
      },
      annotations: PROPOSE,
    },
    (args) =>
      run(async () => {
        const me = await guard(ctx, "quiz:write");
        limitProposals(ctx);
        return ok(await proposeUpdateSlide(ctx, me, args));
      }),
  );

  server.registerTool(
    "confirm_action",
    {
      title: "Tasdiqlangan amalni bajarish",
      description:
        "Foydalanuvchi suhbatda ANIQ rozilik bergan taklifni bajaradi. Faqat actionId qabul qiladi — parametrlar " +
        "taklif paytida serverda saqlangan, o'zgartirib bo'lmaydi. Foydalanuvchi rozi bo'lmagan bo'lsa CHAQIRMANG. " +
        "Taklifdan keyin quiz boshqa joyda o'zgargan bo'lsa amal bajarilmaydi — qaytadan get_quiz va yangi taklif.",
      inputSchema: { actionId: z.string().min(10).max(200) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (args) =>
      run(async () => {
        const me = await guard(ctx, "quiz:write");
        if (writeRateLimited(`confirm:${ctx.grantId}`)) throw new McpToolError("Juda ko'p tasdiq. Bir daqiqadan keyin qayta urinib ko'ring.");
        return ok(await confirmAction(ctx, me, args.actionId));
      }),
  );

  server.registerTool(
    "cancel_action",
    {
      title: "Taklifni bekor qilish",
      description: "Foydalanuvchi rad etgan (yoki keraksiz bo'lib qolgan) taklifni bekor qiladi.",
      inputSchema: { actionId: z.string().min(10).max(200) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (args) =>
      run(async () => {
        await guard(ctx, "quiz:read");
        return ok(await cancelAction(ctx, args.actionId));
      }),
  );
}
