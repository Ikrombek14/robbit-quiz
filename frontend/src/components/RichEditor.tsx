import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";

// Dars matni tahrirlagichi (Quill, "snow"). Alohida faylda — LessonNotes uni React.lazy
// bilan faqat tahrirlash ochilganda yuklaydi (boshqa sahifalar og'irlashmasin).
// Natija — semantik HTML; serverda ham, ko'rsatishda ham tozalanadi.

const modules = {
  toolbar: [
    [{ header: 1 }, { header: 2 }],
    [{ font: [] }],
    [{ size: ["small", false, "large", "huge"] }],
    ["bold", "italic", "underline", "strike", "blockquote", "code-block"],
    [{ list: "ordered" }, { list: "bullet" }, { indent: "-1" }, { indent: "+1" }],
    ["link"],
  ],
};

const formats = ["header", "font", "size", "bold", "italic", "underline", "strike", "blockquote", "code-block", "list", "indent", "link"];

export default function RichEditor({ value, onChange, placeholder }: { value: string; onChange: (html: string) => void; placeholder?: string }) {
  return (
    <div className="rich-editor">
      <ReactQuill theme="snow" value={value} onChange={onChange} modules={modules} formats={formats} placeholder={placeholder} />
    </div>
  );
}
