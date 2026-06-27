import { type ReactNode } from "react";

/* ============================================================
   Yengil markdown render — qo'shimcha kutubxonasiz.
   Qo'llab-quvvatlaydi: sarlavhalar (#, ##, ###), ro'yxatlar
   (- / * va 1.) ichma-ich, **qalin**, *kursiv*, `kod`,
   [matn](havola), > iqtibos, --- ajratuvchi, paragraflar.
   ============================================================ */

// Bitta qatordagi inline belgilarni React elementlarga aylantiradi
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // **qalin**, *kursiv*, `kod`, [matn](url) — birlashtirilgan regex
  const re = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const key = `${keyPrefix}-${i++}`;
    if (m[2] !== undefined) {
      nodes.push(<strong key={key}>{m[2]}</strong>);
    } else if (m[4] !== undefined) {
      nodes.push(<em key={key}>{m[4]}</em>);
    } else if (m[6] !== undefined) {
      nodes.push(
        <code key={key} style={{ background: "var(--surface-high)", padding: "1px 6px", borderRadius: 6, fontSize: "0.92em" }}>
          {m[6]}
        </code>
      );
    } else if (m[8] !== undefined) {
      const href = m[9];
      const external = /^https?:\/\//.test(href);
      nodes.push(
        <a key={key} href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}
           style={{ color: "var(--primary)", fontWeight: 600 }}>
          {m[8]}
        </a>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

interface ListItem {
  indent: number;
  ordered: boolean;
  text: string;
}

// Tekis ro'yxat elementlarini ichma-ich tuzilmaga yig'adi.
// depth === 0 (eng yuqori daraja) — har bir band alohida "kartochka" + rangli raqam.
// Ichki darajalar — oddiy <ul>/<ol>.
function buildList(items: ListItem[], start: number, indent: number, keyPrefix: string, depth: number): { node: ReactNode; next: number } {
  const ordered = items[start].ordered;
  const rows: { num: number; text: string; nested: ReactNode }[] = [];
  let i = start;
  let counter = 0;
  while (i < items.length && items[i].indent >= indent) {
    if (items[i].indent > indent) { i++; continue; } // xavfsizlik
    const li = items[i];
    counter++;
    let nested: ReactNode = null;
    if (i + 1 < items.length && items[i + 1].indent > indent) {
      const built = buildList(items, i + 1, items[i + 1].indent, `${keyPrefix}-${i}n`, depth + 1);
      nested = built.node;
      i = built.next;
    } else {
      i++;
    }
    rows.push({ num: counter, text: li.text, nested });
  }

  if (depth === 0) {
    // Kartochkalar — o'qishga qulay
    const node = (
      <div key={`${keyPrefix}-cards`} style={{ display: "flex", flexDirection: "column", gap: 10, margin: "10px 0" }}>
        {rows.map((r, idx) => (
          <div key={`${keyPrefix}-c-${idx}`} style={{
            display: "flex", gap: 12, alignItems: "flex-start",
            padding: "14px 16px", background: "var(--surface)",
            border: "1px solid var(--border)", borderRadius: 12,
          }}>
            <div style={{
              flexShrink: 0, width: 28, height: 28, borderRadius: ordered ? 8 : "50%",
              background: "var(--primary-soft)", color: "var(--primary)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: ordered ? 14 : 18, lineHeight: 1, marginTop: 1,
            }}>
              {ordered ? r.num : "•"}
            </div>
            <div style={{ flex: 1, minWidth: 0, lineHeight: 1.7, fontSize: 15 }}>
              {renderInline(r.text, `${keyPrefix}-t-${idx}`)}
              {r.nested}
            </div>
          </div>
        ))}
      </div>
    );
    return { node, next: i };
  }

  // Ichki daraja — oddiy ro'yxat
  const style: React.CSSProperties = { margin: "6px 0", paddingLeft: 22, lineHeight: 1.7 };
  const children = rows.map((r, idx) => (
    <li key={`${keyPrefix}-li-${idx}`} style={{ marginBottom: 6 }}>
      {renderInline(r.text, `${keyPrefix}-t-${idx}`)}
      {r.nested}
    </li>
  ));
  const node = ordered
    ? <ol key={`${keyPrefix}-ol`} style={style}>{children}</ol>
    : <ul key={`${keyPrefix}-ul`} style={style}>{children}</ul>;
  return { node, next: i };
}

export default function Markdown({ text }: { text: string }) {
  const lines = (text ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let para: string[] = [];
  let key = 0;

  function flushPara() {
    if (para.length) {
      const joined = para.join(" ");
      blocks.push(<p key={`p-${key++}`} style={{ margin: "8px 0", lineHeight: 1.7 }}>{renderInline(joined, `p${key}`)}</p>);
      para = [];
    }
  }

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "") { flushPara(); i++; continue; }

    // Ajratuvchi
    if (/^---+$/.test(trimmed)) {
      flushPara();
      blocks.push(<hr key={`hr-${key++}`} style={{ border: "none", borderTop: "1px solid var(--border)", margin: "16px 0" }} />);
      i++; continue;
    }

    // Sarlavhalar
    const h = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (h) {
      flushPara();
      const level = h[1].length;
      const sizes = [0, 22, 19, 17, 15];
      const Tag = (`h${Math.min(level + 1, 6)}`) as keyof JSX.IntrinsicElements;
      blocks.push(
        <Tag key={`h-${key++}`} style={{ fontSize: sizes[level], margin: "16px 0 6px", fontWeight: 700 }}>
          {renderInline(h[2], `h${key}`)}
        </Tag>
      );
      i++; continue;
    }

    // Jadval (GFM): | ... | ... |  va keyingi qatori ajratuvchi | --- | --- |
    if (trimmed.startsWith("|") && i + 1 < lines.length &&
        /^\s*\|?[\s|:-]*-[\s|:-]*\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      flushPara();
      const splitRow = (s: string): string[] => {
        let t = s.trim();
        if (t.startsWith("|")) t = t.slice(1);
        if (t.endsWith("|")) t = t.slice(0, -1);
        return t.split("|").map((c) => c.trim());
      };
      const header = splitRow(trimmed);
      i += 2; // sarlavha + ajratuvchi qatorni o'tkazamiz
      const bodyRows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        bodyRows.push(splitRow(lines[i].trim()));
        i++;
      }
      const cellStyle: React.CSSProperties = { padding: "10px 12px", border: "1px solid var(--border)", verticalAlign: "top", textAlign: "left", lineHeight: 1.6, fontSize: 14 };
      blocks.push(
        <div key={`tbl-${key++}`} style={{ overflowX: "auto", margin: "12px 0" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 420 }}>
            <thead>
              <tr>
                {header.map((h, hi) => (
                  <th key={hi} style={{ ...cellStyle, background: "var(--primary)", color: "#fff", fontWeight: 700 }}>
                    {renderInline(h, `th-${key}-${hi}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((r, ri) => (
                <tr key={ri} style={{ background: ri % 2 ? "var(--surface-low)" : "var(--surface)" }}>
                  {r.map((c, ci) => (
                    <td key={ci} style={cellStyle}>{renderInline(c, `td-${key}-${ri}-${ci}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Iqtibos
    if (/^>\s?/.test(trimmed)) {
      flushPara();
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quote.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote key={`q-${key++}`} style={{ margin: "10px 0", padding: "8px 14px", borderLeft: "3px solid var(--primary)", background: "var(--surface-low)", borderRadius: 8, color: "var(--muted)" }}>
          {renderInline(quote.join(" "), `q${key}`)}
        </blockquote>
      );
      continue;
    }

    // Ro'yxatlar (- * yoki 1.)
    const isList = /^(\s*)([-*]|\d+\.)\s+/.test(line);
    if (isList) {
      flushPara();
      const items: ListItem[] = [];
      while (i < lines.length) {
        const lm = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[i]);
        if (!lm) {
          if (lines[i].trim() === "") {
            // Bo'sh qator — keyingi bo'sh bo'lmagan qator hali ham ro'yxat elementi bo'lsa,
            // ro'yxatni uzmaymiz (loose list); aks holda ro'yxat tugadi.
            let j = i + 1;
            while (j < lines.length && lines[j].trim() === "") j++;
            if (j < lines.length && /^(\s*)([-*]|\d+\.)\s+/.test(lines[j])) { i = j; continue; }
            break;
          }
          // ro'yxat elementining davomi (qatori) — oldingisiga qo'shamiz
          if (items.length) { items[items.length - 1].text += " " + lines[i].trim(); i++; continue; }
          break;
        }
        items.push({
          indent: Math.floor(lm[1].replace(/\t/g, "  ").length / 2),
          ordered: /\d+\./.test(lm[2]),
          text: lm[3],
        });
        i++;
      }
      const minIndent = Math.min(...items.map((it) => it.indent));
      items.forEach((it) => (it.indent -= minIndent));
      const built = buildList(items, 0, 0, `list-${key++}`, 0);
      blocks.push(built.node);
      continue;
    }

    // Oddiy paragraf qatori
    para.push(trimmed);
    i++;
  }
  flushPara();

  return <div className="md-body">{blocks}</div>;
}
