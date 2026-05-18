// DepartmentRoleMapping assignments (38 entries)
export const ROLE_MAPPINGS = [
  { empCode: '1800003', department: 'Administration', role: 'CLUSTER_MANAGER' },
  { empCode: '1800011', department: 'Administration', role: 'BRANCH_MANAGER' },
  { empCode: '5100029', department: 'Administration', role: 'SUPERVISOR' },
  { empCode: '1800022', department: 'Distribution-White Collar', role: 'CLUSTER_MANAGER' },
  { empCode: '1800011', department: 'Distribution-White Collar', role: 'BRANCH_MANAGER' },
  { empCode: '1800031', department: 'Distribution-White Collar', role: 'SUPERVISOR' },
  { empCode: '1800022', department: 'Vehicle-TAPF', role: 'CLUSTER_MANAGER' },
  { empCode: '1800011', department: 'Vehicle-TAPF', role: 'BRANCH_MANAGER' },
  { empCode: '1800346', department: 'Vehicle-TAPF', role: 'SUPERVISOR' },
  { empCode: '1800022', department: 'Vehicle-Hired', role: 'CLUSTER_MANAGER' },
  { empCode: '1800011', department: 'Vehicle-Hired', role: 'BRANCH_MANAGER' },
  { empCode: '1800361', department: 'Vehicle-Hired', role: 'SUPERVISOR' },
  { empCode: '1800011', department: 'Distribution- Driver', role: 'CLUSTER_MANAGER' },
  { empCode: '1800346', department: 'Distribution- Driver', role: 'BRANCH_MANAGER' },
  { empCode: '1801637', department: 'Distribution- Driver', role: 'SUPERVISOR' },
  { empCode: '1800003', department: 'Human Resources', role: 'CLUSTER_MANAGER' },
  { empCode: '1800003', department: 'Human Resources', role: 'BRANCH_MANAGER' },
  { empCode: '5100029', department: 'Human Resources', role: 'SUPERVISOR' },
  { empCode: '1800022', department: 'Information Technology', role: 'CLUSTER_MANAGER' },
  { empCode: '1800022', department: 'Information Technology', role: 'BRANCH_MANAGER' },
  // NOTE: Rishpal Kumawat (1800349) was previously seeded here with
  // role 'SUPERVISOR' for Information Technology. SUPERVISOR is a legacy
  // enum value with no runtime support — login, dashboard routing, and
  // every evaluator flow ignore it. Keeping that row meant his admin
  // profile rendered a bogus "SUPERVISOR" pill alongside ADMIN. The row
  // is intentionally removed so future re-seeds don't reintroduce it.
  // For pre-existing DBs, /api/auth/me + UserProfileCard also filter
  // SUPERVISOR entries at the boundary, so this is purely belt-and-braces.
  { empCode: '1800022', department: 'Maintenance', role: 'CLUSTER_MANAGER' },
  { empCode: '1800011', department: 'Maintenance', role: 'BRANCH_MANAGER' },
  { empCode: '1801772', department: 'Maintenance', role: 'SUPERVISOR' },
  { empCode: '1800012', department: 'Procurement', role: 'CLUSTER_MANAGER' },
  { empCode: '1800012', department: 'Procurement', role: 'BRANCH_MANAGER' },
  { empCode: '1801157', department: 'Procurement', role: 'SUPERVISOR' },
  { empCode: '1800022', department: 'Production-White Collar', role: 'CLUSTER_MANAGER' },
  { empCode: '1800011', department: 'Production-White Collar', role: 'BRANCH_MANAGER' },
  { empCode: '1801155', department: 'Production-White Collar', role: 'SUPERVISOR' },
  { empCode: '1800022', department: 'Quality', role: 'CLUSTER_MANAGER' },
  { empCode: '1800011', department: 'Quality', role: 'SUPERVISOR' },
  { empCode: '1800022', department: 'Security', role: 'CLUSTER_MANAGER' },
  { empCode: '1801130', department: 'Security', role: 'BRANCH_MANAGER' },
  { empCode: '1802344', department: 'Security', role: 'SUPERVISOR' },
  { empCode: '1800022', department: 'Stores', role: 'CLUSTER_MANAGER' },
  { empCode: '1800006', department: 'Stores', role: 'BRANCH_MANAGER' },
  { empCode: '1800011', department: 'Stores', role: 'SUPERVISOR' },
];
