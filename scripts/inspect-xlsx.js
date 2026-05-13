const XLSX = require("xlsx");
const path = require("path");

const files = [
  "C:\\Users\\Dinesh\\Downloads\\self_assessment_-Jaipur_EMployee_Details-Main_list1.xlsx",
  "C:\\Users\\Dinesh\\Downloads\\Employee Self-Assessment Sheet_AJM_BARAN_BIK_JLW_JDP (1).xlsx",
];

for (const file of files) {
  console.log("\n" + "=".repeat(80));
  console.log("FILE:", path.basename(file));
  console.log("=".repeat(80));

  const wb = XLSX.readFile(file);
  console.log("Sheet names:", wb.SheetNames);

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", header: 1 });
    const firstNonEmpty = rows.findIndex((r) =>
      r.some((c) => String(c).trim() !== "")
    );
    const headerRow = rows[firstNonEmpty] || [];
    const dataRows = rows.slice(firstNonEmpty + 1).filter((r) =>
      r.some((c) => String(c).trim() !== "")
    );

    console.log(`\n--- Sheet: "${sheetName}" ---`);
    console.log(`Header row index: ${firstNonEmpty}`);
    console.log("Header:", headerRow);
    console.log(`Data rows: ${dataRows.length}`);
    if (dataRows.length > 0) {
      console.log("First data row:", dataRows[0]);
    }
    if (dataRows.length > 1) {
      console.log("Second data row:", dataRows[1]);
    }
    if (dataRows.length > 2) {
      console.log("Last data row:", dataRows[dataRows.length - 1]);
    }
  }
}
