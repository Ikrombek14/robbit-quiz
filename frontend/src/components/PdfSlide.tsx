import { STAGE_W, STAGE_H } from "../types";
import type { Slide } from "../types";
import SlideScene from "./SlideScene";
import { SlideView } from "../pages/Preview";

/* PDF eksport uchun bitta slaydning 1280×720 (16:9) qat'iy o'lchamli ko'rinishi.
   html2canvas shu DOM tugunini rasmga oladi. */
export default function PdfSlide({ slide, showAnswers }: { slide: Slide; showAnswers: boolean }) {
  return (
    <div
      style={{
        width: STAGE_W,
        height: STAGE_H,
        background: "#ffffff",
        overflow: "hidden",
        position: "relative",
        boxSizing: "border-box",
      }}
    >
      {slide.kind === "CONTENT" ? (
        <SlideScene data={slide.data} width={STAGE_W} rounded={0} />
      ) : (
        <div style={{ padding: 64, height: "100%", boxSizing: "border-box", color: "#1d1c0f" }}>
          <SlideView slide={slide} showAnswers={showAnswers} />
        </div>
      )}
    </div>
  );
}
