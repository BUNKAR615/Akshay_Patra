"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function HrCommitteeRedirect() {
    const { branchId } = useParams();
    const router = useRouter();
    useEffect(() => { router.replace(`/dashboard/admin/${branchId}/org`); }, [branchId]);
    return null;
}
