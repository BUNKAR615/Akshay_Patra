// ── Shared Excel / PDF / CSV exporters for the admin Reports sections ──
// Extracted from DetailedTables so every report view (detailed tables, by
// stage, by evaluator, answer sheet, …) produces the same themed, filter-aware
// download. Each exporter takes a normalized payload:
//   { fileBase, title, columns:[{key,label}], rows:[{...}], meta, subtitle, filterLine }
// `columns` drives which keys are exported, so hidden row fields (e.g. `_emp`)
// are never written out.

export function makeFileBase(title, quarterName) {
    const t = (title || "Report").replace(/[^A-Za-z0-9]+/g, "");
    const q = (quarterName || "quarter").replace(/[^A-Za-z0-9_-]+/g, "_");
    return `Report_${t || "Report"}_${q}_${new Date().toISOString().slice(0, 10)}`;
}

// Build the flat objects (with a leading S.No) used by Excel + CSV.
function tableObjects(columns, rows) {
    return rows.map((r, i) => {
        const o = { "S.No": i + 1 };
        columns.forEach(c => { o[c.label] = r[c.key] ?? ""; });
        return o;
    });
}

export async function exportExcel({ fileBase, title, columns, rows, meta = [] }) {
    const XLSX = await import("xlsx");
    const aoaRows = tableObjects(columns, rows);
    const ws = XLSX.utils.json_to_sheet(aoaRows);
    if (aoaRows.length) {
        ws["!cols"] = Object.keys(aoaRows[0]).map(k => ({
            wch: Math.max(k.length, ...aoaRows.map(r => String(r[k] ?? "").length)) + 2,
        }));
    }
    const wsMeta = XLSX.utils.json_to_sheet([
        { Field: "Report", Value: title },
        ...meta,
        { Field: "Rows", Value: rows.length },
        { Field: "Exported At", Value: new Date().toISOString() },
    ]);
    wsMeta["!cols"] = [{ wch: 18 }, { wch: 50 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsMeta, "Info");
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, `${fileBase}.xlsx`);
}

export async function exportCSV({ fileBase, columns, rows }) {
    const Papa = (await import("papaparse")).default;
    const csv = Papa.unparse(tableObjects(columns, rows));
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `${fileBase}.csv`; link.click();
    URL.revokeObjectURL(url);
}

// ── Chart image export (SVG → PNG) ──
// Recharts renders inline-styled SVG, so we can clone it, rasterize through a
// canvas and download — no extra dependencies. Recharts draws its legend as
// HTML (outside the SVG), so the caller can pass `title` + `legend` swatches to
// bake them onto the image, keeping the PNG self-explanatory.
export async function exportChartPNG(svgEl, fileBase, { scale = 2, background = "#ffffff", title = "", legend = null } = {}) {
    if (!svgEl) throw new Error("No chart available to download");

    const rect = svgEl.getBoundingClientRect();
    const width = Math.ceil(rect.width) || Number(svgEl.getAttribute("width")) || 800;
    const chartHeight = Math.ceil(rect.height) || Number(svgEl.getAttribute("height")) || 400;

    const clone = svgEl.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(chartHeight));

    const xml = new XMLSerializer().serializeToString(clone);
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    const img = new Image();
    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("Failed to render chart image"));
        img.src = svgUrl;
    });

    const titleH = title ? 30 : 0;
    const legendH = legend?.length ? 30 : 0;
    const height = chartHeight + titleH + legendH;

    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    if (title) {
        ctx.fillStyle = "#003087";
        ctx.font = "bold 14px Arial, Helvetica, sans-serif";
        ctx.textBaseline = "middle";
        ctx.fillText(title, 14, titleH / 2);
    }
    ctx.drawImage(img, 0, titleH, width, chartHeight);

    if (legend?.length) {
        let x = 14;
        const y = titleH + chartHeight + legendH / 2;
        ctx.font = "12px Arial, Helvetica, sans-serif";
        ctx.textBaseline = "middle";
        for (const item of legend) {
            ctx.fillStyle = item.color || "#888888";
            ctx.fillRect(x, y - 6, 12, 12);
            x += 18;
            ctx.fillStyle = "#444444";
            ctx.fillText(item.label, x, y);
            x += ctx.measureText(item.label).width + 18;
        }
    }

    await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) return reject(new Error("PNG encoding failed"));
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url; link.download = `${fileBase}.png`; link.click();
            URL.revokeObjectURL(url);
            resolve();
        }, "image/png");
    });
}

export async function exportPDF({ fileBase, title, subtitle, filterLine, columns, rows }) {
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: columns.length > 6 ? "landscape" : "portrait", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();

    // Header band (blue theme)
    doc.setFillColor(0, 48, 135); doc.rect(0, 0, pageW, 54, "F"); doc.setTextColor(255, 255, 255);
    doc.setFontSize(15); doc.setFont(undefined, "bold");
    doc.text("Akshaya Patra — " + title, 36, 26);
    doc.setFontSize(9); doc.setFont(undefined, "normal");
    if (subtitle) doc.text(subtitle, 36, 42);

    let startY = 66;
    if (filterLine) {
        doc.setTextColor(90, 90, 90); doc.setFontSize(8);
        doc.text(`Filters: ${filterLine}`, 36, startY);
        startY += 12;
    }

    const head = [["#", ...columns.map(c => c.label)]];
    const body = rows.map((r, i) => [i + 1, ...columns.map(c => String(r[c.key] ?? ""))]);

    autoTable(doc, {
        head, body, startY,
        styles: { fontSize: 7.5, cellPadding: 3, textColor: [33, 37, 41], lineColor: [200, 200, 200], lineWidth: 0.4 },
        headStyles: { fillColor: [0, 48, 135], textColor: [255, 255, 255], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [240, 244, 250] },
        theme: "grid",
        margin: { left: 36, right: 36 },
        didDrawPage: () => {
            const ph = doc.internal.pageSize.getHeight();
            const page = doc.internal.getNumberOfPages();
            doc.setFontSize(8); doc.setTextColor(120, 120, 120);
            doc.text(`Page ${page}`, pageW - 60, ph - 18);
            doc.text(`${rows.length} rows`, 36, ph - 18);
        },
    });
    doc.save(`${fileBase}.pdf`);
}
