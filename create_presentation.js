const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.title = "Akshaya Patra Employee Evaluation System";

// Color palette
const C = {
  navy: "1B3A6B",
  saffron: "E8721C",
  saffronLight: "FFF3E0",
  white: "FFFFFF",
  charcoal: "2C2C2C",
  lightGrey: "F5F5F5",
  midGrey: "D0D0D0",
  darkGrey: "555555",
  green: "1A7A4A",
  purple: "6B3FA0",
  gold: "C8860A",
  lightBlue: "1565A7",
  tableAlt: "EEF2F8",
  saffronMid: "FBB96E",
};

const makeShadow = () => ({ type: "outer", blur: 5, offset: 2, angle: 135, color: "000000", opacity: 0.12 });

function addFooter(slide, slideNum) {
  // Footer bar
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 5.35, w: 10, h: 0.28,
    fill: { color: C.navy }, line: { color: C.navy }
  });
  slide.addText("Akshaya Patra Foundation", {
    x: 0.3, y: 5.35, w: 6, h: 0.28,
    fontSize: 9, color: C.white, valign: "middle", margin: 0
  });
  slide.addText(String(slideNum), {
    x: 9.3, y: 5.35, w: 0.6, h: 0.28,
    fontSize: 9, color: C.white, align: "right", valign: "middle", margin: 0
  });
}

function addSlideTitle(slide, title, subtitle) {
  // Thin top accent bar
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 10, h: 0.08,
    fill: { color: C.saffron }, line: { color: C.saffron }
  });
  slide.addText(title, {
    x: 0.4, y: 0.15, w: 9.2, h: 0.6,
    fontSize: 26, bold: true, color: C.navy, fontFace: "Calibri", margin: 0
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.4, y: 0.72, w: 9.2, h: 0.32,
      fontSize: 13, color: C.darkGrey, fontFace: "Calibri", italic: true, margin: 0
    });
  }
  // Divider line
  slide.addShape(pres.shapes.LINE, {
    x: 0.4, y: 1.08, w: 9.2, h: 0,
    line: { color: C.midGrey, width: 0.75 }
  });
}

// ─── SLIDE 1: TITLE ───────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.navy };

  // Decorative saffron bar bottom
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 5.1, w: 10, h: 0.525,
    fill: { color: C.saffron }, line: { color: C.saffron }
  });
  // Subtle side accent
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 0.18, h: 5.625,
    fill: { color: C.saffron }, line: { color: C.saffron }
  });

  s.addText("Employee Evaluation System", {
    x: 0.6, y: 1.1, w: 9.0, h: 0.9,
    fontSize: 40, bold: true, color: C.white, fontFace: "Calibri",
    align: "left", valign: "middle", margin: 0
  });
  s.addText("A Structured, Multi-Stage Framework for Recognizing the Best Employee", {
    x: 0.6, y: 2.1, w: 8.6, h: 0.6,
    fontSize: 18, color: C.saffronMid, fontFace: "Calibri", align: "left", margin: 0
  });
  s.addShape(pres.shapes.LINE, {
    x: 0.6, y: 2.85, w: 4.5, h: 0,
    line: { color: C.saffron, width: 1.5 }
  });
  s.addText("Akshaya Patra Foundation", {
    x: 0.6, y: 3.05, w: 6, h: 0.4,
    fontSize: 15, color: C.white, fontFace: "Calibri", bold: true, margin: 0
  });
  s.addText("Presented to Branch Managers, Cluster Managers & Committee Members", {
    x: 0.6, y: 3.55, w: 8.5, h: 0.35,
    fontSize: 12, color: "AABCDE", fontFace: "Calibri", italic: true, margin: 0
  });
}

// ─── SLIDE 2: AGENDA ──────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  addSlideTitle(s, "Presentation Agenda", "A structured walkthrough of the evaluation framework");
  addFooter(s, 2);

  const leftItems = [
    "1.  Evaluation Process Overview",
    "2.  Branch Types: BIG vs SMALL",
    "3.  Stage 1 — Self-Assessment",
    "4.  Stage 2 — Evaluator Assessment",
    "5.  Stage 3 — Cluster Manager Evaluation",
    "6.  Stage 4 — HR Evaluation",
    "7.  Stage 5 — Committee & Final Winners",
  ];
  const rightItems = [
    "8.   Question Framework & Categories",
    "9.   Weighted Scoring & Formulas",
    "10. Quarter Creation & Management",
    "11. Blue-Collar vs White-Collar Tracks",
    "12. Roles & Responsibilities",
    "13. Scoring Model Justification",
  ];

  // Left card
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.4, y: 1.2, w: 4.3, h: 3.9,
    fill: { color: C.lightGrey }, line: { color: C.midGrey, width: 0.5 },
    shadow: makeShadow()
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.4, y: 1.2, w: 4.3, h: 0.38,
    fill: { color: C.navy }, line: { color: C.navy }
  });
  s.addText("Evaluation Framework", {
    x: 0.4, y: 1.2, w: 4.3, h: 0.38,
    fontSize: 11, bold: true, color: C.white, align: "center", valign: "middle", margin: 0
  });
  const leftTextArr = leftItems.map((t, i) => ({
    text: t,
    options: { breakLine: i < leftItems.length - 1, fontSize: 12, color: C.charcoal, paraSpaceAfter: 6 }
  }));
  s.addText(leftTextArr, { x: 0.6, y: 1.65, w: 3.9, h: 3.3 });

  // Right card
  s.addShape(pres.shapes.RECTANGLE, {
    x: 5.3, y: 1.2, w: 4.3, h: 3.9,
    fill: { color: C.lightGrey }, line: { color: C.midGrey, width: 0.5 },
    shadow: makeShadow()
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 5.3, y: 1.2, w: 4.3, h: 0.38,
    fill: { color: C.saffron }, line: { color: C.saffron }
  });
  s.addText("Supporting Topics", {
    x: 5.3, y: 1.2, w: 4.3, h: 0.38,
    fontSize: 11, bold: true, color: C.white, align: "center", valign: "middle", margin: 0
  });
  const rightTextArr = rightItems.map((t, i) => ({
    text: t,
    options: { breakLine: i < rightItems.length - 1, fontSize: 12, color: C.charcoal, paraSpaceAfter: 6 }
  }));
  s.addText(rightTextArr, { x: 5.5, y: 1.65, w: 3.9, h: 3.3 });
}

// ─── SLIDE 3: 5-STAGE PIPELINE ────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  addSlideTitle(s, "The 5-Stage Evaluation Pipeline", "A progressive, multi-evaluator framework ensuring fairness and objectivity");
  addFooter(s, 3);

  const stages = [
    { num: "1", title: "Self\nAssessment", eval: "Employee", color: C.lightBlue },
    { num: "2", title: "Evaluator\nAssessment", eval: "BM / HOD", color: C.saffron },
    { num: "3", title: "Cluster Mgr\nReview", eval: "Cluster Mgr", color: C.green },
    { num: "4", title: "HR\nEvaluation", eval: "HR Dept", color: C.purple },
    { num: "5", title: "Committee\nDecision", eval: "Committee", color: C.gold },
  ];

  const boxW = 1.55, boxH = 2.2, startX = 0.25, y = 1.35, gap = 0.38;

  stages.forEach((st, i) => {
    const x = startX + i * (boxW + gap);
    // Card shadow
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: boxW, h: boxH,
      fill: { color: C.white }, line: { color: st.color, width: 1.5 },
      shadow: makeShadow()
    });
    // Color header
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: boxW, h: 0.45,
      fill: { color: st.color }, line: { color: st.color }
    });
    s.addText("STAGE " + st.num, {
      x, y, w: boxW, h: 0.45,
      fontSize: 11, bold: true, color: C.white, align: "center", valign: "middle", margin: 0
    });
    s.addText(st.title, {
      x, y: y + 0.5, w: boxW, h: 0.9,
      fontSize: 12, bold: true, color: st.color, align: "center", valign: "middle", margin: 0
    });
    s.addText(st.eval, {
      x, y: y + 1.45, w: boxW, h: 0.6,
      fontSize: 11, color: C.darkGrey, align: "center", valign: "middle", margin: 0
    });

    // Arrow
    if (i < stages.length - 1) {
      const ax = x + boxW + 0.06;
      s.addShape(pres.shapes.LINE, {
        x: ax, y: y + boxH / 2, w: gap - 0.12, h: 0,
        line: { color: C.midGrey, width: 1.5 }
      });
      // Arrowhead using small triangle text
      s.addText("▶", {
        x: ax + gap - 0.28, y: y + boxH / 2 - 0.15, w: 0.22, h: 0.3,
        fontSize: 9, color: C.midGrey, margin: 0
      });
    }
  });

  // Bottom note
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.4, y: 3.75, w: 9.2, h: 0.5,
    fill: { color: C.saffronLight }, line: { color: C.saffron, width: 0.75 }
  });
  s.addText("Each stage progressively narrows candidates — only the most consistently high-performing employees reach the final stage.", {
    x: 0.55, y: 3.75, w: 9.0, h: 0.5,
    fontSize: 11, color: C.navy, italic: true, valign: "middle", margin: 0
  });
}

// ─── SLIDE 4: BIG VS SMALL BRANCHES ──────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  addSlideTitle(s, "Two Branch Types, Two Evaluation Paths", "The evaluation structure adapts to branch size and complexity");
  addFooter(s, 4);

  const tableData = [
    [
      { text: "Criteria", options: { bold: true, color: C.white, fill: { color: C.charcoal }, fontSize: 11 } },
      { text: "BIG BRANCH", options: { bold: true, color: C.white, fill: { color: C.navy }, fontSize: 11, align: "center" } },
      { text: "SMALL BRANCH", options: { bold: true, color: C.white, fill: { color: C.saffron }, fontSize: 11, align: "center" } },
    ],
    ["Blue-Collar Evaluator", { text: "HOD (Head of Department)", options: { align: "center" } }, { text: "Branch Manager", options: { align: "center" } }],
    ["White-Collar Evaluator", { text: "Branch Manager", options: { align: "center" } }, { text: "Branch Manager (all staff)", options: { align: "center" } }],
    ["Stage 2 BC Advance", { text: "Top 10 Blue-Collar", options: { align: "center" } }, { text: "Top 10 (All staff)", options: { align: "center" } }],
    ["Stage 2 WC Advance", { text: "Top 3 White-Collar", options: { align: "center" } }, { text: "— (unified track)", options: { align: "center", color: C.darkGrey, italic: true } }],
    ["Stage 3 Advance", { text: "WC: Top 2 / BC: Top 5", options: { align: "center" } }, { text: "Top 5 (All staff)", options: { align: "center" } }],
    ["Stage 4 Advance", { text: "WC: Top 1 / BC: Top 3", options: { align: "center" } }, { text: "Top 3 (All staff)", options: { align: "center" } }],
    [
      { text: "Final Winners", options: { bold: true } },
      { text: "1 WC + 3 BC = 4 Winners", options: { bold: true, color: C.navy, align: "center" } },
      { text: "3 Winners (no collar split)", options: { bold: true, color: C.saffron, align: "center" } }
    ],
    ["HOD Required?", { text: "YES", options: { bold: true, color: C.green, align: "center" } }, { text: "NO", options: { bold: true, color: "CC0000", align: "center" } }],
  ];

  // Alternate row fills
  const rows = tableData.map((row, i) => {
    if (i === 0) return row;
    return row.map(cell => {
      if (typeof cell === "string") {
        return { text: cell, options: { fill: { color: i % 2 === 0 ? C.tableAlt : C.white }, fontSize: 11 } };
      }
      return { text: cell.text, options: { ...cell.options, fill: { color: i % 2 === 0 ? C.tableAlt : C.white }, fontSize: 11 } };
    });
  });

  s.addTable(rows, {
    x: 0.35, y: 1.18, w: 9.3, h: 3.6,
    colW: [2.8, 3.25, 3.25],
    border: { pt: 0.5, color: C.midGrey },
    fontFace: "Calibri"
  });

  // Callout
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.35, y: 4.85, w: 9.3, h: 0.4,
    fill: { color: C.saffronLight }, line: { color: C.saffron, width: 0.75 }
  });
  s.addText("Key Principle: BIG branches maintain separate WC/BC tracks. SMALL branches follow a single unified track managed by the Branch Manager.", {
    x: 0.5, y: 4.85, w: 9.1, h: 0.4,
    fontSize: 10.5, color: C.navy, italic: true, valign: "middle", margin: 0
  });
}

// ─── SLIDE 5: STAGE 1 ─────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  addSlideTitle(s, "Stage 1 — Self-Assessment by Employees", "Every eligible employee evaluates their own performance");
  addFooter(s, 5);

  // Left section
  const bullets = [
    "Each employee receives a personalized, randomized set of 10–25 questions",
    "Questions drawn from 7 performance categories (Attendance, Discipline, Productivity, Teamwork, Initiative, Communication, Integrity)",
    "Questions available in both English and Hindi",
    "Answers rated on a –2 to +2 scale (Strongly Negative to Strongly Positive)",
    "System auto-calculates a Normalized Score (0–100)",
    "TOP 50% of employees by score are shortlisted for Stage 2",
  ];
  const bulletArr = bullets.map((b, i) => ({
    text: b, options: { bullet: true, fontSize: 11.5, color: C.charcoal, paraSpaceAfter: 5, breakLine: i < bullets.length - 1 }
  }));
  s.addText(bulletArr, { x: 0.4, y: 1.2, w: 5.5, h: 3.1 });

  // Answer scale card
  s.addShape(pres.shapes.RECTANGLE, {
    x: 6.3, y: 1.18, w: 3.3, h: 2.5,
    fill: { color: C.lightGrey }, line: { color: C.midGrey, width: 0.5 }, shadow: makeShadow()
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 6.3, y: 1.18, w: 3.3, h: 0.38,
    fill: { color: C.lightBlue }, line: { color: C.lightBlue }
  });
  s.addText("Answer Scale", {
    x: 6.3, y: 1.18, w: 3.3, h: 0.38,
    fontSize: 11, bold: true, color: C.white, align: "center", valign: "middle", margin: 0
  });

  const scaleRows = [
    [{ text: "Score", options: { bold: true } }, { text: "Meaning", options: { bold: true } }],
    [{ text: "+2", options: { bold: true, color: C.green } }, "Strongly Positive"],
    [{ text: "+1", options: { color: C.green } }, "Positive"],
    [{ text: " 0", options: { color: C.darkGrey } }, "Neutral / N/A"],
    [{ text: "–1", options: { color: "CC5500" } }, "Negative"],
    [{ text: "–2", options: { bold: true, color: "CC0000" } }, "Strongly Negative"],
  ].map((row, i) => row.map(cell => {
    const base = typeof cell === "string" ? { text: cell, options: {} } : cell;
    return { text: base.text, options: { ...base.options, fontSize: 11, fill: { color: i % 2 === 0 ? C.white : C.tableAlt }, align: "center" } };
  }));

  s.addTable(scaleRows, {
    x: 6.3, y: 1.58, w: 3.3, h: 2.0,
    border: { pt: 0.5, color: C.midGrey }, fontFace: "Calibri", colW: [0.8, 2.5]
  });

  // Formula box
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.4, y: 3.85, w: 9.2, h: 0.55,
    fill: { color: C.navy }, line: { color: C.navy }
  });
  s.addText([
    { text: "Formula: ", options: { bold: true, color: C.saffronMid } },
    { text: "Normalized Score = (Raw Score ÷ Max Possible) × 100   |   Max Possible = No. of Questions × 2", options: { color: C.white } }
  ], { x: 0.55, y: 3.85, w: 9.0, h: 0.55, fontSize: 11, valign: "middle", margin: 0 });

  // Output callout
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.4, y: 4.55, w: 9.2, h: 0.42,
    fill: { color: C.saffronLight }, line: { color: C.saffron, width: 0.75 }
  });
  s.addText("Stage 1 Output: Top 50% of all employees advance to Stage 2", {
    x: 0.55, y: 4.55, w: 9.0, h: 0.42,
    fontSize: 11.5, color: C.navy, bold: true, italic: true, valign: "middle", margin: 0
  });
}

// ─── SLIDE 6: STAGE 2 ─────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  addSlideTitle(s, "Stage 2 — Evaluator Assessment", "Stage 1 shortlisted employees are independently evaluated by a senior evaluator");
  addFooter(s, 6);

  // BIG branch card
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.35, y: 1.22, w: 4.3, h: 2.8,
    fill: { color: C.lightGrey }, line: { color: C.navy, width: 1 }, shadow: makeShadow()
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.35, y: 1.22, w: 4.3, h: 0.42,
    fill: { color: C.navy }, line: { color: C.navy }
  });
  s.addText("BIG BRANCH", {
    x: 0.35, y: 1.22, w: 4.3, h: 0.42,
    fontSize: 13, bold: true, color: C.white, align: "center", valign: "middle", margin: 0
  });
  const bigBullets = [
    "White-Collar → Evaluated by Branch Manager",
    "Blue-Collar → Evaluated by HOD (Head of Dept)",
    "Each evaluator answers up to 15 questions per employee",
    "Top 3 White-Collar advance to Stage 3",
    "Top 10 Blue-Collar advance to Stage 3",
  ].map((b, i) => ({ text: b, options: { bullet: true, fontSize: 11, color: C.charcoal, paraSpaceAfter: 5, breakLine: i < 4 } }));
  s.addText(bigBullets, { x: 0.5, y: 1.7, w: 4.0, h: 2.2 });

  // SMALL branch card
  s.addShape(pres.shapes.RECTANGLE, {
    x: 5.35, y: 1.22, w: 4.3, h: 2.8,
    fill: { color: C.lightGrey }, line: { color: C.saffron, width: 1 }, shadow: makeShadow()
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 5.35, y: 1.22, w: 4.3, h: 0.42,
    fill: { color: C.saffron }, line: { color: C.saffron }
  });
  s.addText("SMALL BRANCH", {
    x: 5.35, y: 1.22, w: 4.3, h: 0.42,
    fontSize: 13, bold: true, color: C.white, align: "center", valign: "middle", margin: 0
  });
  const smallBullets = [
    "All employees evaluated by Branch Manager",
    "No HOD role exists in SMALL branches",
    "Same 15-question evaluation format",
    "Top 10 employees advance (no collar split)",
  ].map((b, i) => ({ text: b, options: { bullet: true, fontSize: 11, color: C.charcoal, paraSpaceAfter: 5, breakLine: i < 3 } }));
  s.addText(smallBullets, { x: 5.5, y: 1.7, w: 4.0, h: 2.2 });

  // Formula
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.35, y: 4.15, w: 9.3, h: 0.55,
    fill: { color: C.navy }, line: { color: C.navy }
  });
  s.addText([
    { text: "Stage 2 Score = ", options: { bold: true, color: C.saffronMid } },
    { text: "(Self Score × 60%) + (Evaluator Score × 40%)", options: { color: C.white } }
  ], { x: 0.5, y: 4.15, w: 9.1, h: 0.55, fontSize: 12, valign: "middle", margin: 0 });

  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.35, y: 4.78, w: 9.3, h: 0.38,
    fill: { color: C.saffronLight }, line: { color: C.saffron, width: 0.75 }
  });
  s.addText("The evaluator's independent assessment acts as a check on self-reported scores, ensuring objectivity.", {
    x: 0.5, y: 4.78, w: 9.1, h: 0.38, fontSize: 10.5, color: C.navy, italic: true, valign: "middle", margin: 0
  });
}

// ─── SLIDE 7: STAGE 3 ─────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  addSlideTitle(s, "Stage 3 — Cluster Manager Evaluation", "An independent regional-level review adds a third layer of objectivity");
  addFooter(s, 7);

  // Main content
  const pts = [
    "Stage 2 shortlisted employees are presented to the Cluster Manager (CM)",
    "CM conducts an independent evaluation using a dedicated set of 10 questions",
    "CM evaluates employees across all assigned branches — no prior bias",
  ];
  pts.forEach((pt, i) => {
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.4, y: 1.25 + i * 0.68, w: 0.38, h: 0.38,
      fill: { color: C.green }, line: { color: C.green }
    });
    s.addText(String(i + 1), {
      x: 0.4, y: 1.25 + i * 0.68, w: 0.38, h: 0.38,
      fontSize: 12, bold: true, color: C.white, align: "center", valign: "middle", margin: 0
    });
    s.addText(pt, {
      x: 0.88, y: 1.25 + i * 0.68, w: 8.7, h: 0.38,
      fontSize: 12, color: C.charcoal, valign: "middle", margin: 0
    });
  });

  // Advances grid
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.4, y: 3.3, w: 4.3, h: 0.38,
    fill: { color: C.navy }, line: { color: C.navy }
  });
  s.addText("BIG BRANCH — Stage 3 Advances", {
    x: 0.4, y: 3.3, w: 4.3, h: 0.38,
    fontSize: 11, bold: true, color: C.white, align: "center", valign: "middle", margin: 0
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.4, y: 3.68, w: 4.3, h: 0.6,
    fill: { color: C.tableAlt }, line: { color: C.midGrey, width: 0.5 }
  });
  s.addText("Top 2 White-Collar  +  Top 5 Blue-Collar", {
    x: 0.4, y: 3.68, w: 4.3, h: 0.6,
    fontSize: 12, bold: true, color: C.navy, align: "center", valign: "middle", margin: 0
  });

  s.addShape(pres.shapes.RECTANGLE, {
    x: 5.3, y: 3.3, w: 4.3, h: 0.38,
    fill: { color: C.saffron }, line: { color: C.saffron }
  });
  s.addText("SMALL BRANCH — Stage 3 Advances", {
    x: 5.3, y: 3.3, w: 4.3, h: 0.38,
    fontSize: 11, bold: true, color: C.white, align: "center", valign: "middle", margin: 0
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 5.3, y: 3.68, w: 4.3, h: 0.6,
    fill: { color: C.saffronLight }, line: { color: C.midGrey, width: 0.5 }
  });
  s.addText("Top 5 (Unified — no collar split)", {
    x: 5.3, y: 3.68, w: 4.3, h: 0.6,
    fontSize: 12, bold: true, color: C.saffron, align: "center", valign: "middle", margin: 0
  });

  // Formula
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.4, y: 4.4, w: 9.2, h: 0.55,
    fill: { color: C.navy }, line: { color: C.navy }
  });
  s.addText([
    { text: "Stage 3 Score = ", options: { bold: true, color: C.saffronMid } },
    { text: "(Self × 40%) + (Evaluator × 30%) + (CM × 30%)", options: { color: C.white } }
  ], { x: 0.55, y: 4.4, w: 9.0, h: 0.55, fontSize: 12, valign: "middle", margin: 0 });
}

// ─── SLIDE 8: STAGE 4 ─────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  addSlideTitle(s, "Stage 4 — HR Evaluation (Attendance & Punctuality)", "Objective, data-driven HR metrics complete the scoring picture");
  addFooter(s, 8);

  // Left
  s.addText("What HR Evaluates", {
    x: 0.35, y: 1.2, w: 4.5, h: 0.35,
    fontSize: 13, bold: true, color: C.navy, margin: 0
  });
  const hrPts = [
    "HR does NOT use a questionnaire format",
    "HR records Attendance % and Punctuality % for each employee",
    "Supporting PDFs uploaded as evidence",
    "System converts percentages to Band Marks (0–10 per metric)",
    "Total HR Score = Attendance Marks + Punctuality Marks (max 20)",
  ].map((b, i) => ({ text: b, options: { bullet: true, fontSize: 11, color: C.charcoal, paraSpaceAfter: 5, breakLine: i < 4 } }));
  s.addText(hrPts, { x: 0.35, y: 1.6, w: 4.8, h: 2.5 });

  // Band mark table
  s.addShape(pres.shapes.RECTANGLE, {
    x: 5.5, y: 1.18, w: 4.1, h: 0.38,
    fill: { color: C.purple }, line: { color: C.purple }
  });
  s.addText("Attendance / Punctuality Band Marks", {
    x: 5.5, y: 1.18, w: 4.1, h: 0.38,
    fontSize: 10.5, bold: true, color: C.white, align: "center", valign: "middle", margin: 0
  });

  const bandRows = [
    [{ text: "Percentage %", options: { bold: true, fill: { color: "E8E0F0" } } }, { text: "Marks Awarded", options: { bold: true, fill: { color: "E8E0F0" }, align: "center" } }],
    ["≥ 90%", { text: "10", options: { bold: true, color: C.green, align: "center" } }],
    ["80 – 89%", { text: "9", options: { align: "center" } }],
    ["70 – 79%", { text: "8", options: { align: "center" } }],
    ["60 – 69%", { text: "7", options: { align: "center" } }],
    ["50 – 59%", { text: "6", options: { align: "center" } }],
    ["40 – 49%", { text: "5", options: { align: "center" } }],
    ["30 – 39%", { text: "4", options: { align: "center" } }],
    ["20 – 29%", { text: "3", options: { align: "center" } }],
    ["10 – 19%", { text: "2", options: { align: "center" } }],
    ["< 10%",    { text: "1", options: { bold: true, color: "CC0000", align: "center" } }],
  ].map((row, i) => row.map(cell => {
    if (typeof cell === "string") return { text: cell, options: { fontSize: 10, fill: { color: i % 2 === 0 ? C.white : C.tableAlt } } };
    return { text: cell.text, options: { ...cell.options, fontSize: 10, fill: { color: i % 2 === 0 ? C.white : C.tableAlt } } };
  }));

  s.addTable(bandRows, {
    x: 5.5, y: 1.56, w: 4.1, h: 2.95,
    border: { pt: 0.5, color: C.midGrey }, fontFace: "Calibri", colW: [2.4, 1.7]
  });

  // Formulas
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.35, y: 4.62, w: 4.85, h: 0.5,
    fill: { color: C.purple }, line: { color: C.purple }
  });
  s.addText("HR Score = Attend. Marks + Punctuality Marks ÷ 20 × 100", {
    x: 0.35, y: 4.62, w: 4.85, h: 0.5,
    fontSize: 10, bold: true, color: C.white, align: "center", valign: "middle", margin: 0
  });

  s.addShape(pres.shapes.RECTANGLE, {
    x: 5.3, y: 4.62, w: 4.3, h: 0.5,
    fill: { color: C.navy }, line: { color: C.navy }
  });
  s.addText("Final = Self×30% + Eval×25% + CM×25% + HR×20%", {
    x: 5.3, y: 4.62, w: 4.3, h: 0.5,
    fontSize: 10, bold: true, color: C.white, align: "center", valign: "middle", margin: 0
  });
}

// ─── SLIDE 9: STAGE 5 / COMMITTEE ────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  addSlideTitle(s, "Stage 5 — Committee Review & Winner Declaration", "The Committee reviews final scores and officially declares the Best Employee(s)");
  addFooter(s, 9);

  // Left: what committee reviews
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.35, y: 1.2, w: 4.5, h: 0.38,
    fill: { color: C.gold }, line: { color: C.gold }
  });
  s.addText("What the Committee Reviews", {
    x: 0.35, y: 1.2, w: 4.5, h: 0.38,
    fontSize: 11, bold: true, color: C.white, align: "center", valign: "middle", margin: 0
  });
  const revPts = [
    "All Stage 4 finalists with complete score breakdowns",
    "Scores visible by stage: Self / BM or HOD / CM / HR",
    "Both branch types (BIG and SMALL) handled separately",
    "Weighted final score calculated transparently for each finalist",
  ].map((b, i) => ({ text: b, options: { bullet: true, fontSize: 11.5, color: C.charcoal, paraSpaceAfter: 6, breakLine: i < 3 } }));
  s.addText(revPts, { x: 0.4, y: 1.65, w: 4.3, h: 2.1 });

  // Right: winner table
  s.addShape(pres.shapes.RECTANGLE, {
    x: 5.15, y: 1.2, w: 4.5, h: 0.38,
    fill: { color: C.navy }, line: { color: C.navy }
  });
  s.addText("Winner Declaration", {
    x: 5.15, y: 1.2, w: 4.5, h: 0.38,
    fontSize: 11, bold: true, color: C.white, align: "center", valign: "middle", margin: 0
  });
  const winRows = [
    [{ text: "Branch Type", options: { bold: true, fill: { color: "E0E8F5" } } }, { text: "Winners Declared", options: { bold: true, fill: { color: "E0E8F5" } } }],
    ["BIG Branch", "1 Best Employee (WC) + 3 Best Employees (BC) = 4 Total"],
    ["SMALL Branch", "3 Best Employees (no collar distinction)"],
  ].map((row, i) => row.map(cell => {
    if (typeof cell === "string") return { text: cell, options: { fontSize: 11, fill: { color: i % 2 === 0 ? C.white : C.tableAlt }, wrap: true } };
    return { text: cell.text, options: { ...cell.options, fontSize: 11, wrap: true } };
  }));
  s.addTable(winRows, {
    x: 5.15, y: 1.58, w: 4.5, h: 1.4,
    border: { pt: 0.5, color: C.midGrey }, fontFace: "Calibri", colW: [1.5, 3.0]
  });

  // Tiebreaker box
  s.addShape(pres.shapes.RECTANGLE, {
    x: 5.15, y: 3.1, w: 4.5, h: 1.25,
    fill: { color: C.saffronLight }, line: { color: C.saffron, width: 0.75 }
  });
  s.addText([
    { text: "Tiebreaker Rules (equal Final Score):\n", options: { bold: true, color: C.navy, breakLine: true } },
    { text: "1st → Cluster Manager Score\n", options: { color: C.charcoal, breakLine: true } },
    { text: "2nd → Evaluator (BM/HOD) Score\n", options: { color: C.charcoal, breakLine: true } },
    { text: "3rd → Self-Assessment Score", options: { color: C.charcoal } },
  ], { x: 5.3, y: 3.12, w: 4.2, h: 1.2, fontSize: 11, valign: "top", margin: 0 });

  // Footer callout
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.35, y: 4.6, w: 9.3, h: 0.45,
    fill: { color: C.navy }, line: { color: C.navy }
  });
  s.addText("The Committee's role is oversight and declaration — evaluation is complete by Stage 4. This ensures the process remains objective and data-driven.", {
    x: 0.5, y: 4.6, w: 9.1, h: 0.45, fontSize: 10.5, color: C.white, italic: true, valign: "middle", margin: 0
  });
}

// ─── SLIDE 10: QUESTION FRAMEWORK ────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  addSlideTitle(s, "Question Framework — 7 Performance Categories", "Questions are carefully structured across seven dimensions of workplace performance");
  addFooter(s, 10);

  const cats = [
    { name: "ATTENDANCE", desc: "Regular presence & punctuality", color: "1565A7" },
    { name: "DISCIPLINE", desc: "Adherence to rules & conduct standards", color: "1A7A4A" },
    { name: "PRODUCTIVITY", desc: "Work output, quality, and efficiency", color: "6B3FA0" },
    { name: "TEAMWORK", desc: "Collaboration and team contribution", color: "C8860A" },
    { name: "INITIATIVE", desc: "Proactivity & self-motivation", color: "E8721C" },
    { name: "COMMUNICATION", desc: "Clarity, effectiveness & professionalism", color: "006B6B" },
    { name: "INTEGRITY", desc: "Honesty, ethics & organizational values", color: "1B3A6B" },
  ];

  const cols = 3, boxW = 2.8, boxH = 0.8, gapX = 0.25, gapY = 0.2;
  const startX = 0.35, startY = 1.22;

  cats.forEach((cat, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const totalInLastRow = cats.length % cols || cols;
    const isLastRow = row === Math.floor((cats.length - 1) / cols);
    const xOffset = isLastRow && totalInLastRow < cols ? (10 - totalInLastRow * (boxW + gapX) + gapX) / 2 : startX;
    const x = xOffset + col * (boxW + gapX);
    const y = startY + row * (boxH + gapY);

    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: boxW, h: boxH,
      fill: { color: C.white }, line: { color: cat.color, width: 1.5 }, shadow: makeShadow()
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: 0.18, h: boxH,
      fill: { color: cat.color }, line: { color: cat.color }
    });
    s.addText(cat.name, {
      x: x + 0.25, y: y + 0.05, w: boxW - 0.3, h: 0.35,
      fontSize: 11, bold: true, color: cat.color, margin: 0
    });
    s.addText(cat.desc, {
      x: x + 0.25, y: y + 0.38, w: boxW - 0.3, h: 0.36,
      fontSize: 10, color: C.darkGrey, margin: 0
    });
  });

  // Facts row
  const facts = [
    "English & Hindi\nfor accessibility",
    "Min. 2 questions\nper category",
    "Randomized per\nemployee",
  ];
  facts.forEach((f, i) => {
    const x = 0.35 + i * 3.15;
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: 4.38, w: 3.0, h: 0.6,
      fill: { color: C.navy }, line: { color: C.navy }
    });
    s.addText(f, { x, y: 4.38, w: 3.0, h: 0.6, fontSize: 10, bold: true, color: C.white, align: "center", valign: "middle", margin: 0 });
  });
}

// ─── SLIDE 11: WEIGHTED SCORING ───────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  addSlideTitle(s, "Weighted Scoring Model — Building the Final Score", "A cumulative, transparent system where every stage contributes to the final result");
  addFooter(s, 11);

  // Stacked bars
  const stages = [
    { label: "Stage 1", segs: [{ pct: 1.0, color: C.lightBlue, name: "Self 100%" }] },
    { label: "Stage 2", segs: [{ pct: 0.6, color: C.lightBlue, name: "Self 60%" }, { pct: 0.4, color: C.saffron, name: "Eval 40%" }] },
    { label: "Stage 3", segs: [{ pct: 0.4, color: C.lightBlue, name: "Self 40%" }, { pct: 0.3, color: C.saffron, name: "Eval 30%" }, { pct: 0.3, color: C.green, name: "CM 30%" }] },
    { label: "Final", segs: [{ pct: 0.3, color: C.lightBlue, name: "Self 30%" }, { pct: 0.25, color: C.saffron, name: "Eval 25%" }, { pct: 0.25, color: C.green, name: "CM 25%" }, { pct: 0.2, color: C.purple, name: "HR 20%" }] },
  ];

  const barW = 6.0, barH = 0.40, startX = 1.6, startY = 1.25, gap = 0.38;

  stages.forEach((st, si) => {
    const y = startY + si * (barH + gap);
    s.addText(st.label, { x: 0.35, y: y, w: 1.2, h: barH, fontSize: 11, bold: true, color: C.navy, valign: "middle", align: "right", margin: 0 });
    let curX = startX;
    st.segs.forEach(seg => {
      const w = seg.pct * barW;
      s.addShape(pres.shapes.RECTANGLE, { x: curX, y, w, h: barH, fill: { color: seg.color }, line: { color: C.white, width: 0.5 } });
      if (w > 0.5) s.addText(seg.name, { x: curX + 0.05, y, w: w - 0.1, h: barH, fontSize: 9, color: C.white, bold: true, align: "center", valign: "middle", margin: 0 });
      curX += w;
    });
  });

  // Legend — placed after the Final bar
  const finalBarY = 1.25 + 3 * (0.40 + 0.38); // startY + 3 * (barH + gap)
  const legendY = finalBarY + 0.40 + 0.12;
  const legItems = [
    { color: C.lightBlue, label: "Self-Assessment" },
    { color: C.saffron, label: "Evaluator (BM/HOD)" },
    { color: C.green, label: "Cluster Manager" },
    { color: C.purple, label: "HR Evaluation" },
  ];
  legItems.forEach((li, i) => {
    const x = 1.6 + i * 2.0;
    s.addShape(pres.shapes.RECTANGLE, { x, y: legendY, w: 0.20, h: 0.20, fill: { color: li.color }, line: { color: li.color } });
    s.addText(li.label, { x: x + 0.26, y: legendY, w: 1.65, h: 0.20, fontSize: 9.5, color: C.charcoal, valign: "middle", margin: 0 });
  });

  // Formulas
  const divY = legendY + 0.28;
  const formulas = [
    ["Normalization:", "Score = (Raw Score ÷ Max Possible) × 100"],
    ["Stage 2:", "(Self × 0.60) + (Evaluator × 0.40)"],
    ["Stage 3:", "(Self × 0.40) + (Evaluator × 0.30) + (CM × 0.30)"],
    ["Final Score:", "(Self × 0.30) + (Evaluator × 0.25) + (CM × 0.25) + (HR × 0.20)"],
  ];
  s.addShape(pres.shapes.RECTANGLE, { x: 0.35, y: divY, w: 9.3, h: 0.08, fill: { color: C.midGrey }, line: { color: C.midGrey } });
  formulas.forEach((f, i) => {
    const x = i < 2 ? 0.35 : 5.0;
    const y = divY + 0.14 + (i % 2) * 0.38;
    s.addText([
      { text: f[0] + " ", options: { bold: true, color: C.navy } },
      { text: f[1], options: { color: C.charcoal } }
    ], { x, y, w: 4.5, h: 0.34, fontSize: 10, valign: "middle", margin: 0 });
  });
}

// ─── SLIDE 12: QUARTER MANAGEMENT ─────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  addSlideTitle(s, "Quarter Management — Evaluation Cycle Structure", "Each evaluation cycle runs within a defined Quarter, created and managed by the Admin");
  addFooter(s, 12);

  // Left — setup fields
  s.addShape(pres.shapes.RECTANGLE, { x: 0.35, y: 1.2, w: 4.4, h: 0.38, fill: { color: C.navy }, line: { color: C.navy } });
  s.addText("Quarter Setup Fields", { x: 0.35, y: 1.2, w: 4.4, h: 0.38, fontSize: 11, bold: true, color: C.white, align: "center", valign: "middle", margin: 0 });
  const fields = [
    "Quarter Name (e.g., Q1-2025) — must be unique",
    "Start Date & End Date",
    "Self-Assessment questions: 10–25 per employee",
    "BM / HOD evaluator questions: up to 25",
    "CM evaluator questions: up to 25",
    "Question Selection Mode: AUTO or MANUAL",
  ].map((b, i) => ({ text: b, options: { bullet: true, fontSize: 11, color: C.charcoal, paraSpaceAfter: 5, breakLine: i < 5 } }));
  s.addText(fields, { x: 0.4, y: 1.62, w: 4.2, h: 2.4 });

  // Right — modes
  s.addShape(pres.shapes.RECTANGLE, { x: 5.25, y: 1.2, w: 4.4, h: 0.38, fill: { color: C.saffron }, line: { color: C.saffron } });
  s.addText("Question Selection Modes", { x: 5.25, y: 1.2, w: 4.4, h: 0.38, fontSize: 11, bold: true, color: C.white, align: "center", valign: "middle", margin: 0 });

  s.addShape(pres.shapes.RECTANGLE, { x: 5.25, y: 1.62, w: 4.4, h: 0.28, fill: { color: C.lightBlue }, line: { color: C.lightBlue } });
  s.addText("AUTO MODE", { x: 5.25, y: 1.62, w: 4.4, h: 0.28, fontSize: 10, bold: true, color: C.white, align: "center", valign: "middle", margin: 0 });
  const autoItems = [
    "System picks category-balanced questions automatically",
    "Minimum 2 questions from each of 7 categories",
    "Remaining slots filled randomly (Fisher-Yates shuffle)",
  ].map((b, i) => ({ text: b, options: { bullet: true, fontSize: 10.5, color: C.charcoal, paraSpaceAfter: 4, breakLine: i < 2 } }));
  s.addText(autoItems, { x: 5.3, y: 1.94, w: 4.2, h: 1.0 });

  s.addShape(pres.shapes.RECTANGLE, { x: 5.25, y: 3.0, w: 4.4, h: 0.28, fill: { color: C.green }, line: { color: C.green } });
  s.addText("MANUAL MODE", { x: 5.25, y: 3.0, w: 4.4, h: 0.28, fontSize: 10, bold: true, color: C.white, align: "center", valign: "middle", margin: 0 });
  const manualItems = [
    "Admin hand-picks specific questions for inclusion",
    "Useful for targeted or thematic evaluations",
  ].map((b, i) => ({ text: b, options: { bullet: true, fontSize: 10.5, color: C.charcoal, paraSpaceAfter: 4, breakLine: i < 1 } }));
  s.addText(manualItems, { x: 5.3, y: 3.32, w: 4.2, h: 0.7 });

  // Lifecycle timeline
  s.addShape(pres.shapes.RECTANGLE, { x: 0.35, y: 4.12, w: 9.3, h: 0.28, fill: { color: C.lightGrey }, line: { color: C.midGrey, width: 0.5 } });
  const steps = ["Quarter Created", "Quarter ACTIVE", "Evaluation Phases 1–4", "Quarter CLOSED", "Results Published"];
  const stepW = 9.3 / steps.length;
  steps.forEach((st, i) => {
    const x = 0.35 + i * stepW;
    s.addShape(pres.shapes.RECTANGLE, { x, y: 4.12, w: stepW, h: 0.28, fill: { color: i % 2 === 0 ? C.navy : C.lightBlue }, line: { color: C.white, width: 0.5 } });
    s.addText(st, { x, y: 4.12, w: stepW, h: 0.28, fontSize: 8.5, bold: true, color: C.white, align: "center", valign: "middle", margin: 0 });
  });

  s.addShape(pres.shapes.RECTANGLE, { x: 0.35, y: 4.5, w: 9.3, h: 0.38, fill: { color: C.saffronLight }, line: { color: C.saffron, width: 0.75 } });
  s.addText("Only ONE quarter can be active at a time. The system prevents duplicate active quarters automatically.", {
    x: 0.5, y: 4.5, w: 9.1, h: 0.38, fontSize: 10.5, color: C.navy, italic: true, valign: "middle", margin: 0
  });
}

// ─── SLIDE 13: BC vs WC TRACKS ────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  addSlideTitle(s, "Blue-Collar vs White-Collar — Separate Evaluation Tracks", "For BIG branches, the system runs two parallel, independent evaluation pipelines");
  addFooter(s, 13);

  const tracks = [
    {
      title: "WHITE-COLLAR TRACK", color: C.navy,
      stages: [
        { stageLabel: "Stage 1", detail: "All WC Employees" },
        { stageLabel: "Stage 2", detail: "Evaluated by Branch Manager → Top 3" },
        { stageLabel: "Stage 3", detail: "Evaluated by Cluster Manager → Top 2" },
        { stageLabel: "Stage 4", detail: "HR Evaluation → Top 1" },
      ],
      winner: "1 Best WC Employee"
    },
    {
      title: "BLUE-COLLAR TRACK", color: C.saffron,
      stages: [
        { stageLabel: "Stage 1", detail: "All BC Employees" },
        { stageLabel: "Stage 2", detail: "Evaluated by HOD → Top 10" },
        { stageLabel: "Stage 3", detail: "Evaluated by Cluster Manager → Top 5" },
        { stageLabel: "Stage 4", detail: "HR Evaluation → Top 3" },
      ],
      winner: "3 Best BC Employees"
    }
  ];

  tracks.forEach((track, ti) => {
    const startX = ti === 0 ? 0.35 : 5.15;
    const trackW = 4.5;

    s.addShape(pres.shapes.RECTANGLE, { x: startX, y: 1.2, w: trackW, h: 0.4, fill: { color: track.color }, line: { color: track.color } });
    s.addText(track.title, { x: startX, y: 1.2, w: trackW, h: 0.4, fontSize: 12, bold: true, color: C.white, align: "center", valign: "middle", margin: 0 });

    const stageY = [1.72, 2.28, 2.84, 3.4];
    track.stages.forEach((st, si) => {
      s.addShape(pres.shapes.RECTANGLE, {
        x: startX, y: stageY[si], w: trackW, h: 0.44,
        fill: { color: si % 2 === 0 ? C.tableAlt : C.white }, line: { color: C.midGrey, width: 0.5 }
      });
      s.addText([
        { text: st.stageLabel + ": ", options: { bold: true, color: track.color } },
        { text: st.detail, options: { color: C.charcoal } }
      ], { x: startX + 0.1, y: stageY[si], w: trackW - 0.2, h: 0.44, fontSize: 11, valign: "middle", margin: 0 });

      // Arrow
      if (si < 3) {
        s.addText("▼", { x: startX + trackW / 2 - 0.12, y: stageY[si] + 0.44, w: 0.24, h: 0.14, fontSize: 8, color: track.color, align: "center", margin: 0 });
      }
    });

    // Winner box
    s.addShape(pres.shapes.RECTANGLE, { x: startX, y: 4.0, w: trackW, h: 0.45, fill: { color: track.color }, line: { color: track.color } });
    s.addText("🏆  " + track.winner, { x: startX, y: 4.0, w: trackW, h: 0.45, fontSize: 12, bold: true, color: C.white, align: "center", valign: "middle", margin: 0 });
  });

  s.addShape(pres.shapes.RECTANGLE, { x: 0.35, y: 4.58, w: 9.3, h: 0.42, fill: { color: C.saffronLight }, line: { color: C.saffron, width: 0.75 } });
  s.addText("Total per BIG Branch: 4 Winners (1 WC + 3 BC)  |  Blue-collar employees are recognized on their own merits — never competing with white-collar staff.", {
    x: 0.5, y: 4.58, w: 9.1, h: 0.42, fontSize: 10.5, color: C.navy, italic: true, valign: "middle", margin: 0
  });
}

// ─── SLIDE 14: ROLES ──────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  addSlideTitle(s, "Roles & Responsibilities in the Evaluation System", "Seven distinct roles work together across the five evaluation stages");
  addFooter(s, 14);

  const roles = [
    ["Admin", "Pre-Quarter", "Creates quarters, manages questions, employee records & branch setup", "All Branches"],
    ["Employee", "Stage 1", "Submits self-assessment answers to personalized question set", "Own profile only"],
    ["Branch Manager", "Stage 2", "Evaluates Stage 1 shortlisted employees (WC for BIG; all staff for SMALL)", "1 Branch"],
    ["HOD (Head of Dept)", "Stage 2", "Evaluates Blue-Collar Stage 1 shortlist — BIG branches only", "1 Branch / Dept"],
    ["Cluster Manager", "Stage 3", "Independent evaluation of Stage 2 shortlisted employees", "Multiple Branches"],
    ["HR Department", "Stage 4", "Records attendance & punctuality data with supporting PDF evidence", "Multiple Branches"],
    ["Committee", "Stage 5", "Reviews final scores and officially declares Best Employee winners", "Multiple Branches"],
  ];

  const headers = [
    [
      { text: "Role", options: { bold: true, color: C.white, fill: { color: C.navy }, align: "center" } },
      { text: "Stage", options: { bold: true, color: C.white, fill: { color: C.navy }, align: "center" } },
      { text: "Responsibility", options: { bold: true, color: C.white, fill: { color: C.navy }, align: "center" } },
      { text: "Branch Scope", options: { bold: true, color: C.white, fill: { color: C.navy }, align: "center" } },
    ]
  ];

  const bodyRows = roles.map((row, i) => row.map((cell, ci) => ({
    text: cell,
    options: { fontSize: 10.5, fill: { color: i % 2 === 0 ? C.white : C.tableAlt }, align: ci === 2 ? "left" : "center", wrap: true }
  })));

  s.addTable([...headers, ...bodyRows], {
    x: 0.3, y: 1.18, w: 9.4, h: 3.85,
    colW: [1.7, 1.0, 4.5, 2.2],
    border: { pt: 0.5, color: C.midGrey }, fontFace: "Calibri"
  });

  s.addShape(pres.shapes.RECTANGLE, { x: 0.3, y: 5.1, w: 9.4, h: 0.05, fill: { color: C.saffron }, line: { color: C.saffron } });
  s.addText("Each role has strictly scoped access — evaluators can only see employees in their assigned branch(es), maintaining confidentiality and integrity.", {
    x: 0.3, y: 4.85, w: 9.4, h: 0.38, fontSize: 10, color: C.darkGrey, italic: true, valign: "middle", margin: 0
  });
}

// ─── SLIDE 15: SUMMARY / WHY THIS MODEL ──────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.navy };

  // Top accent
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.08, fill: { color: C.saffron }, line: { color: C.saffron } });

  s.addText("Why This Evaluation Model?", {
    x: 0.4, y: 0.15, w: 9.2, h: 0.55, fontSize: 28, bold: true, color: C.white, fontFace: "Calibri", margin: 0
  });
  s.addText("A fair, transparent, and multi-dimensional framework for recognizing exceptional employees", {
    x: 0.4, y: 0.72, w: 9.2, h: 0.32, fontSize: 13, color: C.saffronMid, italic: true, fontFace: "Calibri", margin: 0
  });
  s.addShape(pres.shapes.LINE, { x: 0.4, y: 1.08, w: 9.2, h: 0, line: { color: C.saffron, width: 0.75 } });

  const pillars = [
    { title: "OBJECTIVITY", body: "No single evaluator decides the winner. Four independent evaluators at different organizational levels contribute to the final score, minimizing personal bias.", color: C.lightBlue },
    { title: "PROGRESSIVE FILTERING", body: "Employees advance stage by stage. Only consistently strong performers reach the final. One lucky score in one stage cannot guarantee a win.", color: C.saffron },
    { title: "MULTI-DIMENSIONAL ASSESSMENT", body: "7 performance categories + attendance + punctuality. Both soft skills (self-evaluation) and objective HR data are included in the final score.", color: C.green },
    { title: "EQUITY & ACCESSIBILITY", body: "Blue-collar and white-collar employees compete on separate tracks in BIG branches. Questions in Hindi and English ensure language is never a barrier.", color: C.gold },
  ];

  pillars.forEach((p, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = col === 0 ? 0.35 : 5.2;
    const y = 1.2 + row * 1.55;
    const w = 4.5, h = 1.4;

    s.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: "1E2E50" }, line: { color: p.color, width: 1.5 } });
    s.addShape(pres.shapes.RECTANGLE, { x, y, w, h: 0.35, fill: { color: p.color }, line: { color: p.color } });
    s.addText(p.title, { x, y, w, h: 0.35, fontSize: 11, bold: true, color: C.white, align: "center", valign: "middle", margin: 0 });
    s.addText(p.body, { x: x + 0.12, y: y + 0.38, w: w - 0.24, h: 0.98, fontSize: 10.5, color: "CADCFC", valign: "top", margin: 0 });
  });

  // Final summary bar
  s.addShape(pres.shapes.RECTANGLE, { x: 0.35, y: 4.42, w: 9.3, h: 0.52, fill: { color: C.saffron }, line: { color: C.saffron } });
  s.addText("Final Score = 30% Self-Honesty + 25% Manager Assessment + 25% Cluster Oversight + 20% Attendance & Punctuality", {
    x: 0.5, y: 4.42, w: 9.1, h: 0.52, fontSize: 12, bold: true, color: C.white, align: "center", valign: "middle", margin: 0
  });

  s.addText("We invite Branch Managers, Cluster Managers & Committee Members to review, validate, and approve this evaluation framework.", {
    x: 0.35, y: 5.0, w: 9.3, h: 0.35, fontSize: 10, color: "AABCDE", italic: true, align: "center", valign: "middle", margin: 0
  });

  // Bottom accent
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 5.35, w: 10, h: 0.275, fill: { color: C.saffron }, line: { color: C.saffron } });
  s.addText("Akshaya Patra Foundation", { x: 0.3, y: 5.35, w: 5, h: 0.275, fontSize: 9, bold: true, color: C.white, valign: "middle", margin: 0 });
  s.addText("15", { x: 9.3, y: 5.35, w: 0.6, h: 0.275, fontSize: 9, color: C.white, align: "right", valign: "middle", margin: 0 });
}

pres.writeFile({ fileName: "C:\\Users\\Dinesh\\Desktop\\Akshaya_Patra\\Akshaya_Patra_Evaluation_Presentation.pptx" })
  .then(() => console.log("SUCCESS: Presentation saved."))
  .catch(e => { console.error("ERROR:", e); process.exit(1); });
