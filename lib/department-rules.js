import prisma from "./prisma";

/**
 * Determine shortlist limits for a department based on employee count.
 *
 * Rules:
 *   ≥ 10 employees → stage1: 10, stage2: 5, stage3: 3  (default)
 *   5–9 employees  → stage1: ALL, stage2: 5, stage3: 3  (Case 1)
 *   3–4 employees  → stage1: ALL, stage2: ALL, stage3: 3 (Case 2)
 *   2 employees    → stage1: ALL, stage2: ALL, stage3: ALL (Case 3)
 *   1 employee     → autoWinner: true                    (Case 4)
 *
 * A limit of `null` means "take ALL" (no cap).
 *
 * @param {string} departmentId
 * @returns {Promise<{totalEmployees: number, stage1Limit: number|null, stage2Limit: number|null, stage3Limit: number|null, autoWinner: boolean, caseNumber: number}>}
 */
export async function getDepartmentSize(departmentId) {
    const totalEmployees = await prisma.user.count({
        where: { departmentId, role: "EMPLOYEE" },
    });

    if (totalEmployees >= 10) {
        return { totalEmployees, stage1Limit: 10, stage2Limit: 5, stage3Limit: 3, autoWinner: false, caseNumber: 0 };
    }
    if (totalEmployees >= 5) {
        // Case 1: 5–9 employees → all go to Stage 2
        return { totalEmployees, stage1Limit: null, stage2Limit: 5, stage3Limit: 3, autoWinner: false, caseNumber: 1 };
    }
    if (totalEmployees >= 3) {
        // Case 2: 3–4 employees → all go to Stage 2 + Stage 3
        return { totalEmployees, stage1Limit: null, stage2Limit: null, stage3Limit: 3, autoWinner: false, caseNumber: 2 };
    }
    if (totalEmployees === 2) {
        // Case 3: 2 employees → all go through all stages
        return { totalEmployees, stage1Limit: null, stage2Limit: null, stage3Limit: null, autoWinner: false, caseNumber: 3 };
    }
    if (totalEmployees === 1) {
        // Case 4: single employee → auto-winner
        return { totalEmployees, stage1Limit: null, stage2Limit: null, stage3Limit: null, autoWinner: true, caseNumber: 4 };
    }

    // 0 employees — nothing to do
    return { totalEmployees: 0, stage1Limit: 0, stage2Limit: 0, stage3Limit: 0, autoWinner: false, caseNumber: -1 };
}

/**
 * Log a small-department rule application to the audit log.
 * Fire-and-forget — does not block the caller.
 */
export function logSmallDepartmentRule({ userId, departmentId, departmentName, caseNumber, totalEmployees, quarterId, action }) {
    prisma.auditLog.create({
        data: {
            userId,
            action: action || "SMALL_DEPARTMENT_RULE",
            details: {
                rule: `Case ${caseNumber}`,
                totalEmployees,
                departmentId,
                departmentName: departmentName || "unknown",
                quarterId,
                message: `Small department rule applied: Case ${caseNumber} — ${totalEmployees} employee(s) in department`,
            },
        },
    }).catch(() => { });
}
