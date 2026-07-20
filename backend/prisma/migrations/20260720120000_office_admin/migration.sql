-- Ofis/qabul administratori roli (additiv — ma'lumot yo'qotmaydi)
ALTER TABLE "Teacher" ADD COLUMN "officeAdmin" BOOLEAN NOT NULL DEFAULT false;
