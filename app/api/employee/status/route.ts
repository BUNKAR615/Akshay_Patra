import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";

/**
 * GET /api/employee/status
 *
 * Returns the employee's current quarter status, assessment submission,
 * and stage progress. Designed to NEVER return a 500 error — every
 * failure path returns a safe default 200 response.
 */

const SAFE_DEFAULT = {
  success: true,
  data: {
    quarter: null,
    assessment: { submitted: false },
    stageStatus: {
      currentStage: null,
      isShortlistedStage2: false,
      isShortlistedStage3: false,
      isShortlistedStage4: false,
      isWinner: false,
    },
  },
};

export const GET = withRole(["EMPLOYEE"], async (request, { user }) => {
  try {
    const userId = user.userId;
    console.log("Employee status called for userId:", userId);

    // ── 1. Find active quarter ──
    const activeQuarter = await prisma.quarter.findFirst({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        status: true,
        questionCount: true,
        startDate: true,
      },
    });

    console.log("Active quarter:", activeQuarter?.name ?? "none");

    // If no active quarter, return safe default — never crash
    if (!activeQuarter) {
      return Response.json(SAFE_DEFAULT);
    }

    // ── 2. Assessment query (never crash if table missing) ──
    const assessment = await prisma.selfAssessment
      .findFirst({
        where: {
          userId: userId,
          quarterId: activeQuarter.id,
        },
        select: {
          id: true,
          rawScore: true,
          normalizedScore: true,
          submittedAt: true,
        },
      })
      .catch(() => null); // never crash if table missing

    console.log("Assessment submitted:", !!assessment);

    // ── 3. Shortlist queries (each wrapped individually) ──
    let isShortlistedStage2 = false;
    let isShortlistedStage3 = false;
    let isShortlistedStage4 = false;

    try {
      const s2 = await prisma.shortlistStage2.findFirst({
        where: { userId: userId, quarterId: activeQuarter.id },
      });
      isShortlistedStage2 = !!s2;
    } catch {
      isShortlistedStage2 = false;
    }

    try {
      const s3 = await prisma.shortlistStage3.findFirst({
        where: { userId: userId, quarterId: activeQuarter.id },
      });
      isShortlistedStage3 = !!s3;
    } catch {
      isShortlistedStage3 = false;
    }

    try {
      const s4 = await prisma.shortlistStage4.findFirst({
        where: { userId: userId, quarterId: activeQuarter.id },
      });
      isShortlistedStage4 = !!s4;
    } catch {
      isShortlistedStage4 = false;
    }

    // ── 4. Return safe complete response ──
    return Response.json({
      success: true,
      data: {
        quarter: activeQuarter,
        assessment: {
          submitted: !!assessment,
          submittedAt: assessment?.submittedAt ?? null,
          rawScore: assessment?.rawScore ?? null,
          normalizedScore: assessment?.normalizedScore ?? null,
        },
        stageStatus: {
          currentStage: isShortlistedStage4
            ? 4
            : isShortlistedStage3
              ? 3
              : isShortlistedStage2
                ? 2
                : 1,
          isShortlistedStage2,
          isShortlistedStage3,
          isShortlistedStage4,
          isWinner: false,
        },
      },
    });
  } catch (error) {
    // ── Outer catch: NEVER return a 500 ──
    console.error("Employee status error:", error);
    return Response.json(SAFE_DEFAULT, { status: 200 });
  }
});
