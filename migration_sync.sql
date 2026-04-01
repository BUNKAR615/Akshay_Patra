-- Migration: Sync DB with Excel (FINAL)
-- Role holders keep their Department_Description as primary dept
-- Regular employees get sheet's department

BEGIN;

-- ============================================
-- 1. FIX DEPARTMENT ASSIGNMENTS
-- ============================================

UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution-White Collar') WHERE "empCode" = '1800252'; -- RAKESH KUMAR MEENA: Distribution -> Distribution-White Collar
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution-White Collar') WHERE "empCode" = '1800274'; -- RAMESH CHAND SHARMA: Distribution -> Distribution-White Collar
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution-White Collar') WHERE "empCode" = '1800544'; -- PRAVEEN SHARMA: Distribution -> Distribution-White Collar
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Production-White Collar') WHERE "empCode" = '1801105'; -- Jagdish Prasad Meena: Production -> Production-White Collar
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1801132'; -- Gopal Singh: Security -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801198'; -- Mukesh Verma: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801205'; -- BAJRANG SINGH: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801206'; -- BALWEER SINGH: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801208'; -- BHAGWAN SHAY BAIRWA: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801213'; -- GYARSHI LAL MORYA: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801215'; -- HEERA LAL: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801219'; -- JITENDRA RAIGAR: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801220'; -- JYANTI PRASAD SHARMA: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801221'; -- KAILASH CHAND: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801225'; -- KULDEEP SINGH RAJAWAT: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801226'; -- KULDEEP VERMA: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801227'; -- LAL CHAND MORIYA: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801232'; -- MOHAR SINGH GURJAR: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801236'; -- OMPRAKSH GURJAR: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801237'; -- PRABHU NARAYAN MEENA: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801238'; -- PRAKASH CHAND MEENA: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801240'; -- RADHESHYAM: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801241'; -- RAJENDRA JAJORIYA: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801242'; -- RAJENDRA LAKHERA: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801243'; -- RAJU LAL: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801246'; -- RAM DAYAL SHARMA: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801248'; -- RAMAVATAR MEENA: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801252'; -- ROOPNARAYAN MOURYA: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801253'; -- SANJAY: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801254'; -- SATYA NARAYAN: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801259'; -- TUFAN MEENA: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801260'; -- VINOD RAIGAR: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1801264'; -- ASHOK KUMAR DHANKA: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1801265'; -- BABU LAL GURJAR: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1801267'; -- BIJENDRA SHARMA: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1801270'; -- DAYA CHAND VERMA: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1801271'; -- DHARMENDRA KUMAR: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1801272'; -- DINESH KUMAR BALAI: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1801273'; -- GAJANAND RAIGAR: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1801279'; -- HUKAM CHAND JANGID: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1801284'; -- MUKESH KUMAR MEENA: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801291'; -- ROSHAN LAL: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1801293'; -- SAYAR LAL SHARMA: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1801298'; -- UMMED SINGH: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1801299'; -- YADRAM MEENA: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Vehicle-TAPF') WHERE "empCode" = '1801305'; -- RAJESH KUMAR MEENA: Distribution -> Vehicle-TAPF
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Production-White Collar') WHERE "empCode" = '1801316'; -- Raju Meena: Production -> Production-White Collar
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1801321'; -- Lavleen Gurjar: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Production-White Collar') WHERE "empCode" = '1801361'; -- Mamraj Raiger: Production -> Production-White Collar
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution-White Collar') WHERE "empCode" = '1801362'; -- Rahul Singh CHAUHAN: Distribution -> Distribution-White Collar
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1801366'; -- Suraj Mal Gurjar: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution-White Collar') WHERE "empCode" = '1801378'; -- Sanjay Sharma: Distribution -> Distribution-White Collar
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1801406'; -- Jitendra Singh Gurjar: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1801591'; -- RANJIT YOGI: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution-White Collar') WHERE "empCode" = '1801598'; -- VEDPRAKASH MEENA: Distribution -> Distribution-White Collar
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Vehicle-Hired') WHERE "empCode" = '1801637'; -- BABU LAL MEENA: Distribution -> Vehicle-Hired
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1801654'; -- Dheeraj Yadav: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801656'; -- SUNIL KUMAR MOURYA: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801658'; -- Kamal Singh: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution-White Collar') WHERE "empCode" = '1801664'; -- RAVINDRA SHARMA: Distribution -> Distribution-White Collar
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1801742'; -- KAN SINGH: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1801754'; -- RAMAVTAR: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1801758'; -- HANSRAJ MEENA: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1801759'; -- VIJAY SHANKAR MEENA: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801761'; -- GIRRAJ VERMA: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801767'; -- RAJU TANWAR: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801768'; -- SURGYAN: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801781'; -- KALU RAM RAIGAR: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution-White Collar') WHERE "empCode" = '1801791'; -- PUSHPENDRA YADAV: Distribution -> Distribution-White Collar
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801822'; -- BABLU SHARMA: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801862'; -- OMPRAKASH: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Production-White Collar') WHERE "empCode" = '1801883'; -- RATAN LAL MEENA: Production -> Production-White Collar
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1801958'; -- AJAY DHANKA: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1801961'; -- PURANMAL: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Production-White Collar') WHERE "empCode" = '1802010'; -- ASHOK KUMAR YADAV: Production -> Production-White Collar
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1802024'; -- RINKU MORYA: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1802025'; -- SONU DHANAKA: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1802029'; -- JAGADISH NARAYAN MEENA: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1802040'; -- NATHU: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1802045'; -- CHARAT KUMAR DHOBI: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1802056'; -- SANTOSH KUMAR: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1802057'; -- SHYOJI LAL MEENA: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1802059'; -- RAMPRASAD MEENA: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1802064'; -- HARPHOOL MEENA: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1802069'; -- SUNNY MAURYA: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Production-White Collar') WHERE "empCode" = '1802078'; -- DESH VANDHU: Production -> Production-White Collar
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Production-White Collar') WHERE "empCode" = '1802087'; -- DASHRATH SINGH YADAV: Production -> Production-White Collar
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1802113'; -- ASHOK YOGI: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1802114'; -- MUKESH KUMAR MALI: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1802129'; -- CHHOTURAM GUJAR: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1802135'; -- KANA RAM YOGI: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution-White Collar') WHERE "empCode" = '1802143'; -- SARVAGYA KUMAR SHARMA: Distribution -> Distribution-White Collar
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1802176'; -- SOHAN LAL: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1802183'; -- RAMESH CHAND: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1802241'; -- GANESH NARAYAN MEENA: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1802244'; -- RINKU MEENA: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1802249'; -- MADAN SINGH: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1802250'; -- TEJA RAM GURJAR: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1802279'; -- KANA RAM MEENA: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution-White Collar') WHERE "empCode" = '1802283'; -- VISHAL SHARMA: Distribution -> Distribution-White Collar
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1802295'; -- GOVIND SAIN: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1802296'; -- HEERA NAND MAURYA: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution-White Collar') WHERE "empCode" = '1802330'; -- CHANDRASHEKHAR: Distribution -> Distribution-White Collar
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1802331'; -- RAKESH KUMAR BUNKAR: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Production') WHERE "empCode" = '1802338'; -- SONU KUMAR MEENA: Stores -> Production
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1802339'; -- SHEKHAR BAIRWA: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1802342'; -- AJAY KUMAR RAIGAR: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1802350'; -- JITENDRA SINGH: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1802351'; -- RAJU VERMA: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1802352'; -- SURESH VERMA: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1802355'; -- SAHIL TANVAR: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1802359'; -- VISHANU YOGI: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1802370'; -- JAYSINGH: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1802372'; -- PINTU MEENA: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1802373'; -- GAJANAND CHOUDHARY: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1802374'; -- LALIT MUNDRA: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1802378'; -- MEHUL KUMAR SONI: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1802379'; -- DHANRAJ BHEEL: Distribution -> Distribution- Driver
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution') WHERE "empCode" = '1802380'; -- AVINASH: Production -> Distribution
UPDATE users SET "departmentId" = (SELECT id FROM departments WHERE name = 'Distribution- Driver') WHERE "empCode" = '1802386'; -- SAGAR MAL GOME: Distribution -> Distribution- Driver

-- Total department fixes: 120

-- ============================================
-- 2. ADD MISSING ROLE MAPPINGS
-- ============================================

INSERT INTO department_role_mappings (id, "userId", "departmentId", role, "assignedAt")
SELECT gen_random_uuid(), u.id, d.id, 'CLUSTER_MANAGER', NOW()
FROM users u, departments d
WHERE u."empCode" = '1800011' AND d.name = 'Distribution'
ON CONFLICT ("userId", "departmentId", role) DO NOTHING; -- SANT KUMAR SHARMA as CLUSTER_MANAGER in Distribution

INSERT INTO department_role_mappings (id, "userId", "departmentId", role, "assignedAt")
SELECT gen_random_uuid(), u.id, d.id, 'CLUSTER_MANAGER', NOW()
FROM users u, departments d
WHERE u."empCode" = '1800011' AND d.name = 'Production'
ON CONFLICT ("userId", "departmentId", role) DO NOTHING; -- SANT KUMAR SHARMA as CLUSTER_MANAGER in Production

INSERT INTO department_role_mappings (id, "userId", "departmentId", role, "assignedAt")
SELECT gen_random_uuid(), u.id, d.id, 'CLUSTER_MANAGER', NOW()
FROM users u, departments d
WHERE u."empCode" = '1800022' AND d.name = 'Procurement'
ON CONFLICT ("userId", "departmentId", role) DO NOTHING; -- AMIT KESHWA as CLUSTER_MANAGER in Procurement

INSERT INTO department_role_mappings (id, "userId", "departmentId", role, "assignedAt")
SELECT gen_random_uuid(), u.id, d.id, 'BRANCH_MANAGER', NOW()
FROM users u, departments d
WHERE u."empCode" = '1800361' AND d.name = 'Distribution'
ON CONFLICT ("userId", "departmentId", role) DO NOTHING; -- SUSHEEL KUMAR MAHAWAR as BRANCH_MANAGER in Distribution

INSERT INTO department_role_mappings (id, "userId", "departmentId", role, "assignedAt")
SELECT gen_random_uuid(), u.id, d.id, 'SUPERVISOR', NOW()
FROM users u, departments d
WHERE u."empCode" = '1801105' AND d.name = 'Production'
ON CONFLICT ("userId", "departmentId", role) DO NOTHING; -- Jagdish Prasad Meena as SUPERVISOR in Production

INSERT INTO department_role_mappings (id, "userId", "departmentId", role, "assignedAt")
SELECT gen_random_uuid(), u.id, d.id, 'BRANCH_MANAGER', NOW()
FROM users u, departments d
WHERE u."empCode" = '1801155' AND d.name = 'Production'
ON CONFLICT ("userId", "departmentId", role) DO NOTHING; -- Dashrath kumar as BRANCH_MANAGER in Production

INSERT INTO department_role_mappings (id, "userId", "departmentId", role, "assignedAt")
SELECT gen_random_uuid(), u.id, d.id, 'SUPERVISOR', NOW()
FROM users u, departments d
WHERE u."empCode" = '1801305' AND d.name = 'Distribution'
ON CONFLICT ("userId", "departmentId", role) DO NOTHING; -- RAJESH KUMAR MEENA as SUPERVISOR in Distribution

-- Total role mappings to add: 7

-- ============================================
-- 3. REMOVE INCORRECT ROLE MAPPINGS
-- ============================================

DELETE FROM department_role_mappings
WHERE "userId" = (SELECT id FROM users WHERE "empCode" = '1800012')
AND "departmentId" = (SELECT id FROM departments WHERE name = 'Procurement')
AND role = 'CLUSTER_MANAGER'; -- Remove Amit Keshwa as CLUSTER_MANAGER from Procurement

-- Total role mappings to remove: 1

COMMIT;