"""For every conflicting empCode, show the full row from each tab side-by-side
so we can see HOW the duplication looks (identical copy? different DOJ?
different department field? etc.)."""
import re
import pandas as pd

PATH = r"C:\Users\Dinesh\Downloads\self_assessment_-Jaipur_EMployee_Details-Main_list1.xlsx"
OUT  = r"C:\Users\Dinesh\Desktop\Akshaya_Patra\xlsx_conflict_row_compare.txt"

xl = pd.ExcelFile(PATH)

# Read every tab into a dict keyed by tab name, where value is list of rows
# (each row is a dict empCode/name/doj/dept/desig/mobile/role)
COLS = ["empCode", "name", "doj", "dept_in_sheet", "designation", "mobile", "role"]
per_tab = {}
for name in xl.sheet_names:
    df = pd.read_excel(PATH, sheet_name=name, header=None, dtype=str).fillna("")
    df = df[~df.apply(lambda r: all(v == "" for v in r), axis=1)]
    first = str(df.iloc[0, 0]).strip().lower() if len(df) else ""
    body = df.iloc[1:] if first == "empcode" else df
    rows = []
    for _, r in body.iterrows():
        vals = list(r)[:7] + [""] * (7 - len(r))
        rows.append({COLS[i]: str(vals[i]).strip() for i in range(7)})
    per_tab[name] = rows

# Find conflicts (empCode in both a WC and a BC tab)
per_code = {}
for tab_name, rows in per_tab.items():
    is_bc = bool(re.search(r"blue\s*coll", tab_name, re.IGNORECASE))
    cls = "BC" if is_bc else "WC"
    for r in rows:
        code = r["empCode"]
        if not code:
            continue
        per_code.setdefault(code, []).append((tab_name, cls, r))

conflicts = []
for code, hits in per_code.items():
    cls_set = {h[1] for h in hits}
    if "WC" in cls_set and "BC" in cls_set:
        conflicts.append((code, hits))

# Diff classification for each conflict
identical_count = 0
diff_designation_count = 0
diff_dept_count = 0
diff_other_count = 0
diff_details = []

lines = [f"Side-by-side row comparison for {len(conflicts)} conflicting empCodes", ""]

for code, hits in sorted(conflicts, key=lambda x: x[1][0][2]["name"].lower()):
    lines.append("=" * 100)
    lines.append(f"empCode {code}  —  {hits[0][2]['name']}")
    lines.append("-" * 100)
    field_diffs = set()
    # Compare every pair of rows for this empCode
    base = hits[0][2]
    for tab_name, cls, r in hits:
        lines.append(f"  [{cls}] in tab '{tab_name}':")
        lines.append(f"      empCode      : {r['empCode']}")
        lines.append(f"      Name         : {r['name']}")
        lines.append(f"      DOJ          : {r['doj']}")
        lines.append(f"      Dept_Desc    : {r['dept_in_sheet']}")
        lines.append(f"      Designation  : {r['designation']}")
        lines.append(f"      Mobile       : {r['mobile']}")
        lines.append(f"      Role         : {r['role']}")
        for k in COLS[1:]:  # skip empCode
            if r[k] != base[k]:
                field_diffs.add(k)
    if not field_diffs:
        identical_count += 1
        lines.append("  Diff: IDENTICAL rows")
    else:
        if "designation" in field_diffs:
            diff_designation_count += 1
        if "dept_in_sheet" in field_diffs:
            diff_dept_count += 1
        if field_diffs - {"designation", "dept_in_sheet"}:
            diff_other_count += 1
        lines.append(f"  Diff fields: {sorted(field_diffs)}")
        diff_details.append((code, hits[0][2]['name'], sorted(field_diffs)))
    lines.append("")

with open(OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print(f"Total conflicts: {len(conflicts)}")
print(f"  IDENTICAL rows (every column matches across both tabs): {identical_count}")
print(f"  Designation differs across the two rows: {diff_designation_count}")
print(f"  Department field differs across the two rows: {diff_dept_count}")
print(f"  Some other column differs:                  {diff_other_count}")
print()
print(f"Full per-empCode comparison written to: {OUT}")
print()
if diff_details:
    print("Conflicts where the two rows are NOT identical (first 15):")
    for code, name, fields in diff_details[:15]:
        print(f"  {code}  {name}   diff in: {fields}")
