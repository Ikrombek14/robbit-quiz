import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { slideInputShape, slideChangesShape, slideInputSchema, LIMITS, QTYPES } from "../../lib/slideValidate.js";
import { itemOpSchema, typeExtraShape, MAX_ITEM_OPS } from "../../lib/slideItems.js";
import { guard, ok, run, McpToolError, type McpContext } from "../context.js";
import { CATALOGS } from "../../lib/lessons.js";
import { config } from "../../config.js";
import { createUploadToken, UPLOAD_MAX_FILES, UPLOAD_MAX_BYTES } from "../upload.js";
import {
  proposeCreateQuiz,
  proposeAddSlide,
  proposeAddSlides,
  proposeAttach,
  proposeUpdateSlide,
  proposeEditItems,
  proposeChangeType,
  proposeReorder,
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
        "FILL_BLANK, MATCH, REORDER) yoki kind=CONTENT (title, body, imageUrl; yoki pageImageUrl — to'liq ekranli sahifa rasmi). " +
        "position — 1 dan boshlab o'rin " +
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
    "edit_slide_items",
    {
      title: "Variant/juftlik/elementlarni nuqtaviy tahrirlash (tasdiq bilan)",
      description:
        "Butun ro'yxatni qayta yozmasdan bitta yoki bir nechta variant (SINGLE/MULTIPLE/DROPDOWN/POLL), juftlik (MATCH), " +
        "tartib elementi (REORDER) yoki bo'sh joy (FILL_BLANK) ustida amallarni TAKLIF qiladi. Amallar: " +
        "add {text|left,right|answers, correct?, position?}, update {itemId, ...}, remove {itemId}, move {itemId, position}. " +
        "itemId'lar get_slide natijasidagi items[].itemId — ular FAQAT shu quizVersion uchun amal qiladi; barcha amallar " +
        "ASL ro'yxatdagi itemId'larga ishora qiladi (oldingi move keyingisini adashtirmaydi). REORDER'da ro'yxat tartibi = " +
        "to'g'ri javob tartibi. SINGLE/DROPDOWN'da bitta variantga correct:true bersangiz, qolganlari avtomatik noto'g'ri bo'ladi. " +
        "FILL_BLANK'da bo'sh joy qo'shsangiz/olib tashlasangiz, text bilan savol matnidagi ___ sonini ham moslang. " +
        `Hammasi atomar: bitta amal xato bo'lsa, hech biri saqlanmaydi. Ko'pi bilan ${MAX_ITEM_OPS} ta amal. ` +
        READ_FIRST + " " + CONFIRM_RULE,
      inputSchema: {
        quizId: z.string().min(1).max(100),
        quizVersion: z.number().int().min(1).describe("get_slide'dagi quizVersion"),
        slideId: z.string().min(1).max(100),
        operations: z.array(itemOpSchema).min(1).max(MAX_ITEM_OPS),
        text: z.string().max(LIMITS.text).optional().describe("Ixtiyoriy: savol matnini ham shu amal bilan o'zgartirish"),
      },
      annotations: PROPOSE,
    },
    (args) =>
      run(async () => {
        const me = await guard(ctx, "quiz:write");
        limitProposals(ctx);
        return ok(await proposeEditItems(ctx, me, args));
      }),
  );

  server.registerTool(
    "change_slide_type",
    {
      title: "Savol turini almashtirish (tasdiq bilan)",
      description:
        "Savol turini almashtirishni TAKLIF qiladi. Savol matni, rasm, vaqt, ball va izoh saqlanadi; variantli turlar o'zaro " +
        "almashtirilganda variant matnlari ham saqlanadi. Mos kelmaydigan ma'lumot (masalan juftliklar) preview'da " +
        "\"YO'QOLADI\" deb ko'rsatiladi — buni foydalanuvchiga albatta ayting. Yangi turga kerakli, eski slayddan olib " +
        "bo'lmaydigan maydonlar extra'da beriladi (TRUE_FALSE — statementIsTrue, MATCH — pairs, FILL_BLANK — blanks + text ___ bilan, " +
        "variantlarni to'liq almashtirish — options, saqlanadigan variantlardan to'g'rilari — correct). " +
        "Kontent slaydni savolga aylantirib bo'lmaydi. " + READ_FIRST + " " + CONFIRM_RULE,
      inputSchema: {
        quizId: z.string().min(1).max(100),
        quizVersion: z.number().int().min(1),
        slideId: z.string().min(1).max(100),
        newType: z.enum(QTYPES),
        extra: z.object(typeExtraShape).optional(),
      },
      annotations: { ...PROPOSE, destructiveHint: true },
    },
    (args) =>
      run(async () => {
        const me = await guard(ctx, "quiz:write");
        limitProposals(ctx);
        return ok(await proposeChangeType(ctx, me, args));
      }),
  );

  server.registerTool(
    "reorder_slides",
    {
      title: "Slaydlar tartibini o'zgartirish (tasdiq bilan)",
      description:
        "Slaydlar tartibini o'zgartirishni TAKLIF qiladi. Ikki usul (bittasini tanlang): " +
        "1) slideId + position — bitta slaydni shu o'ringa (1 dan) ko'chirish; " +
        "2) order — quizdagi BARCHA slayd id'lari yangi tartibda (har biri aynan bir marta). " +
        "Slayd id'lari o'zgarmaydi. " + READ_FIRST + " " + CONFIRM_RULE,
      inputSchema: {
        quizId: z.string().min(1).max(100),
        quizVersion: z.number().int().min(1),
        slideId: z.string().min(1).max(100).optional(),
        position: z.number().int().min(1).max(LIMITS.maxSlidesPerQuiz).optional(),
        order: z.array(z.string().min(1).max(100)).max(LIMITS.maxSlidesPerQuiz).optional(),
      },
      annotations: PROPOSE,
    },
    (args) =>
      run(async () => {
        const me = await guard(ctx, "quiz:write");
        limitProposals(ctx);
        return ok(await proposeReorder(ctx, me, args));
      }),
  );

  server.registerTool(
    "add_slides",
    {
      title: "Bir nechta slayd qo'shish (bitta tasdiq bilan)",
      description:
        `Quizga bir yo'la 1–${LIMITS.maxSlidesPerCreate} ta slayd qo'shishni TAKLIF qiladi — hammasi bitta preview va bitta ` +
        "confirm_action bilan, atomar (bittasi xato bo'lsa hech biri qo'shilmaydi). Slayd formati add_slide'dagi bilan bir xil. " +
        "position — birinchi slayd o'rni (1 dan; berilmasa — oxiriga), qolganlari ketma-ket. Dars uchun savollar to'plamini " +
        "yoki NotebookLM sahifalarini (CONTENT + pageImageUrl) qo'shishda shuni ishlating. " +
        READ_FIRST + " " + CONFIRM_RULE,
      inputSchema: {
        quizId: z.string().min(1).max(100),
        quizVersion: z.number().int().min(1).describe("get_quiz'dagi version"),
        position: z.number().int().min(1).max(LIMITS.maxSlidesPerQuiz + 1).optional(),
        slides: z.array(slideInputSchema).min(1).max(LIMITS.maxSlidesPerCreate),
      },
      annotations: PROPOSE,
    },
    (args) =>
      run(async () => {
        const me = await guard(ctx, "quiz:write");
        limitProposals(ctx);
        return ok(await proposeAddSlides(ctx, me, args));
      }),
  );

  server.registerTool(
    "attach_quiz_to_lesson",
    {
      title: "Quizni darsga biriktirish (tasdiq bilan)",
      description:
        "Quizni (slaydlar to'plamini) list_lessons'dagi darsga biriktirishni TAKLIF qiladi. Faqat quizi YO'Q darsga — " +
        "boshqa quiz biriktirilgan bo'lsa almashtirib bo'lmaydi (bu faqat platformada). Quiz o'zingiz tahrirlay oladigan bo'lishi kerak. " +
        CONFIRM_RULE,
      inputSchema: {
        catalog: z.enum(CATALOGS).describe("list_lessons'dagi catalog"),
        lessonId: z.string().min(1).max(100),
        quizId: z.string().min(1).max(100),
      },
      annotations: PROPOSE,
    },
    (args) =>
      run(async () => {
        const me = await guard(ctx, "quiz:write");
        limitProposals(ctx);
        return ok(await proposeAttach(ctx, me, args));
      }),
  );

  server.registerTool(
    "create_image_upload",
    {
      title: "Rasm yuklash havolasi",
      description:
        "Kompyuterdagi rasmlarni (PNG/JPEG/WebP, har biri 15MB gacha) Robbit'ga yuklash uchun 30 daqiqalik havola beradi " +
        `(ko'pi bilan ${UPLOAD_MAX_FILES} ta fayl). Har bir fayl alohida so'rov: curl -F "file=@slide-01.png" <uploadUrl> → ` +
        "{ url: \"/uploads/...\" }. Shu url'ni slaydda imageUrl yoki pageImageUrl sifatida ishlating. " +
        "Yuklashning o'zi hech qaysi quizni o'zgartirmaydi. Havolani boshqalarga bermang.",
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    () =>
      run(async () => {
        await guard(ctx, "quiz:write");
        if (writeRateLimited(`upload-link:${ctx.grantId}`, 10)) throw new McpToolError("Juda ko'p havola so'raldi. Bir daqiqadan keyin qayta urinib ko'ring.");
        const { token, expiresAt } = createUploadToken(ctx);
        const uploadUrl = `${config.mcp.issuerUrl}/mcp-upload/${token}`;
        return ok({
          uploadUrl,
          expiresAt: expiresAt.toISOString(),
          maxFiles: UPLOAD_MAX_FILES,
          maxFileBytes: UPLOAD_MAX_BYTES,
          field: "file",
          example: `curl -sS -F "file=@slide-01.png" "${uploadUrl}"`,
        });
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
