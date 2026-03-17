async function testApi() {
    console.log("Starting API tests for global roles...");

    const loginBM = await fetch('http://127.0.0.1:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 's.sharma@akshayapatra.org', password: 'password123' })
    });

    const bmCookies = loginBM.headers.get('set-cookie');
    console.log("BM Login Status:", loginBM.status);

    const deptsRes = await fetch('http://127.0.0.1:3001/api/branch-manager/departments', {
        headers: { 'Cookie': bmCookies }
    });
    const deptsJson = await deptsRes.json();
    console.log("BM Departments Status:", deptsRes.status);
    console.log("BM Departments Count:", deptsJson.data?.departments?.length);

    const loginCM = await fetch('http://127.0.0.1:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'a.keshwa@akshayapatra.org', password: 'password123' })
    });

    const cmCookies = loginCM.headers.get('set-cookie');
    console.log("CM Login Status:", loginCM.status);

    const cmDeptsRes = await fetch('http://127.0.0.1:3001/api/cluster-manager/departments', {
        headers: { 'Cookie': cmCookies }
    });
    const cmDeptsJson = await cmDeptsRes.json();
    console.log("CM Departments Status:", cmDeptsRes.status);
    console.log("CM Departments Count:", cmDeptsJson.data?.departments?.length);

    const adminLogin = await fetch('http://127.0.0.1:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'bharatbdl@akshayapatra.org', password: 'password123' })
    });

    const adminCookies = adminLogin.headers.get('set-cookie');
    console.log("Admin Login Status:", adminLogin.status);

    const assignmentsRes = await fetch('http://127.0.0.1:3001/api/admin/departments/all-assignments', {
        headers: { 'Cookie': adminCookies }
    });
    const assignmentsJson = await assignmentsRes.json();
    console.log("Assignments Status:", assignmentsRes.status);
    console.log("First Dept BM:", assignmentsJson.data?.departments[0]?.branchManager?.name);
    console.log("First Dept CMs:", assignmentsJson.data?.departments[0]?.clusterManagers?.map(c => c.name));
}

testApi().catch(console.error);
