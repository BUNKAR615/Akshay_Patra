"use client";

import { Badge } from "./ui";

/**
 * Evaluator-dashboard banner listing the department-level evaluation
 * authority ("Power of Attorney") the signed-in user holds for this role.
 * Renders nothing when there are no delegations.
 *
 * @param {{ delegations: { id: string, branchName: string, departmentName: string }[], message: string }} props
 */
export default function DelegationBanner({ delegations = [], message }) {
    if (!delegations.length) return null;
    return (
        <div className="mb-6 p-4 rounded-card border border-orange-200 bg-orange-50/70">
            <p className="text-[12px] font-bold uppercase tracking-wider text-orange-700 m-0">Delegated evaluation authority · Power of Attorney</p>
            <p className="text-[13px] text-gray-700 mt-1 mb-2">{message}</p>
            <div className="flex flex-wrap gap-1.5">
                {delegations.map((d) => (
                    <Badge key={d.id} label={`${d.branchName} · ${d.departmentName}`} color="orange" />
                ))}
            </div>
        </div>
    );
}
