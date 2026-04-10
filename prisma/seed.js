const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const data1 = require('./employees-part1');
const data2 = require('./employees-part2');

const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning database...');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE users CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE departments CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE branches CASCADE');

  // Step 1: Create Branches
  console.log('Creating branches...');
  const branch = await prisma.branch.create({
    data: { name: 'Jaipur', location: 'Jaipur, Rajasthan', branchType: 'BIG' }
  });

  const nathdwaraBranch = await prisma.branch.create({
    data: { name: 'Nathdwara', location: 'Nathdwara, Rajasthan', branchType: 'BIG' }
  });

  // Small branches (for future use)
  const udaipurBranch = await prisma.branch.create({
    data: { name: 'Udaipur', location: 'Udaipur, Rajasthan', branchType: 'SMALL' }
  });
  const jodhpurBranch = await prisma.branch.create({
    data: { name: 'Jodhpur', location: 'Jodhpur, Rajasthan', branchType: 'SMALL' }
  });

  // Step 2: Create Jaipur Departments with collar type
  // Existing employee data references: Administration, Distribution, Finance,
  // Human Resources, India One Marketing, Information Technology, Maintenance,
  // Operations, Process Excellence and CI, Procurement, Production, Quality,
  // Security, Stores. We keep those, mark collar types, and add new WC-specific
  // departments for Distribution/Production (where BC employees stay in the base
  // dept and WC employees can be moved to the new WC variant by admin).
  const jaipurDepts = [
    // WHITE COLLAR
    { name: 'Administration',          collarType: 'WHITE_COLLAR' },
    { name: 'Human Resources',         collarType: 'WHITE_COLLAR' },
    { name: 'Information Technology',  collarType: 'WHITE_COLLAR' },
    { name: 'Procurement',             collarType: 'WHITE_COLLAR' },
    { name: 'Quality',                 collarType: 'WHITE_COLLAR' },
    { name: 'Stores',                  collarType: 'WHITE_COLLAR' },
    { name: 'Distribution White Collar', collarType: 'WHITE_COLLAR' },
    { name: 'Production White Collar',   collarType: 'WHITE_COLLAR' },

    // BLUE COLLAR (including the base Distribution/Production where existing employees live)
    { name: 'Distribution',            collarType: 'BLUE_COLLAR' },
    { name: 'Production',              collarType: 'BLUE_COLLAR' },
    { name: 'Finance',                 collarType: 'BLUE_COLLAR' },
    { name: 'India One Marketing',     collarType: 'BLUE_COLLAR' },
    { name: 'Maintenance',             collarType: 'BLUE_COLLAR' },
    { name: 'Operations',              collarType: 'BLUE_COLLAR' },
    { name: 'Process Excellence and CI', collarType: 'BLUE_COLLAR' },
    { name: 'Security',                collarType: 'BLUE_COLLAR' },
  ];

  console.log(`Creating ${jaipurDepts.length} Jaipur departments...`);
  const deptMap = {};
  for (const d of jaipurDepts) {
    const dept = await prisma.department.create({
      data: { name: d.name, branchId: branch.id, collarType: d.collarType }
    });
    deptMap[d.name] = dept.id;
  }

  // Step 3: Seed all employees using upsert (idempotent)
  const allEmployees = [...data1, ...data2];
  console.log(`Seeding ${allEmployees.length} employees...`);

  let count = 0;

  for (const emp of allEmployees) {
    const deptId = deptMap[emp.department];
    if (!deptId) {
      console.log(`  ⚠ Department not found: ${emp.department} — skipping ${emp.name}`);
      continue;
    }

    const hashed = await bcrypt.hash(emp.password, 10);
    const user = await prisma.user.upsert({
      where: { empCode: emp.empCode },
      update: {
        name: emp.name,
        role: emp.role,
        designation: emp.designation,
        departmentId: deptId,
      },
      create: {
        empCode: emp.empCode,
        name: emp.name,
        password: hashed,
        role: emp.role,
        designation: emp.designation,
        departmentId: deptId,
      }
    });

    if (emp.role === 'SUPERVISOR') {
      await prisma.departmentRoleMapping.upsert({
        where: { userId_departmentId_role: { userId: user.id, departmentId: deptId, role: 'SUPERVISOR' } },
        update: {},
        create: { userId: user.id, departmentId: deptId, role: 'SUPERVISOR' }
      });
    }

    count++;
    if (count % 50 === 0) console.log(`  ${count}/${allEmployees.length} users created...`);
  }

  // ─────────────────────────────────────
  // ASSIGN SANT KUMAR SHARMA AS BM FOR ALL JAIPUR DEPARTMENTS
  // ─────────────────────────────────────
  console.log('Assigning Sant Kumar Sharma as Branch Manager for all Jaipur departments...');
  const santKumar = await prisma.user.findUnique({ where: { empCode: '1800011' } });
  if (santKumar) {
    const jaipurDepts = await prisma.department.findMany({ where: { branchId: branch.id } });
    for (const dept of jaipurDepts) {
      await prisma.departmentRoleMapping.upsert({
        where: { userId_departmentId_role: { userId: santKumar.id, departmentId: dept.id, role: 'BRANCH_MANAGER' } },
        update: {},
        create: { userId: santKumar.id, departmentId: dept.id, role: 'BRANCH_MANAGER' }
      });
    }
    console.log(`  ✓ Sant Kumar Sharma assigned as BM for ${jaipurDepts.length} Jaipur departments`);
  } else {
    console.log('  ⚠ Sant Kumar Sharma (1800011) not found — skipping BM assignment');
  }

  // Verification summary
  const total = await prisma.user.count();
  const byRole = await prisma.user.groupBy({
    by: ['role'],
    _count: { role: true }
  });

  console.log('\n=====================================');
  console.log('SEED COMPLETE — AKSHAYA PATRA JAIPUR');
  console.log('=====================================');
  console.log(`TOTAL USERS: ${total}`);
  byRole.forEach(r =>
    console.log(`  ${r.role}: ${r._count.role}`)
  );
  console.log('=====================================\n');
  // ─────────────────────────────────────
  // QUESTIONS SEEDING
  // ─────────────────────────────────────
  const questions = [
    // SELF ASSESSMENT — ATTENDANCE
    { text: 'I report to work on time every day without exception.', textHindi: 'मैं बिना किसी अपवाद के हर दिन समय पर काम पर रिपोर्ट करता/करती हूँ।', category: 'ATTENDANCE', level: 'SELF', isActive: true },
    { text: 'I inform my supervisor in advance when I need to be absent.', textHindi: 'जब मुझे अनुपस्थित रहना होता है तो मैं अपने पर्यवेक्षक को पहले से सूचित करता/करती हूँ।', category: 'ATTENDANCE', level: 'SELF', isActive: true },
    { text: 'My attendance record this quarter has been consistent and reliable.', textHindi: 'इस तिमाही में मेरी उपस्थिति का रिकॉर्ड निरंतर और विश्वसनीय रहा है।', category: 'ATTENDANCE', level: 'SELF', isActive: true },
    { text: 'I stay for my complete shift and do not leave early without permission.', textHindi: 'मैं अपनी पूरी शिफ्ट रुकता/रुकती हूँ और बिना अनुमति के जल्दी नहीं जाता/जाती।', category: 'ATTENDANCE', level: 'SELF', isActive: true },
    { text: 'I have not taken any unplanned leaves this quarter.', textHindi: 'मैंने इस तिमाही में कोई अनियोजित छुट्टी नहीं ली है।', category: 'ATTENDANCE', level: 'SELF', isActive: true },
    { text: 'I make up for missed work whenever I am absent.', textHindi: 'जब भी मैं अनुपस्थित होता/होती हूँ तो छूटे हुए काम की भरपाई करता/करती हूँ।', category: 'ATTENDANCE', level: 'SELF', isActive: true },
    { text: 'I am present and punctual even during high-pressure periods.', textHindi: 'उच्च दबाव की अवधि में भी मैं उपस्थित और समयनिष्ठ रहता/रहती हूँ।', category: 'ATTENDANCE', level: 'SELF', isActive: true },
    { text: 'I notify my team immediately when I am running late.', textHindi: 'जब मुझे देर हो रही होती है तो मैं तुरंत अपनी टीम को सूचित करता/करती हूँ।', category: 'ATTENDANCE', level: 'SELF', isActive: true },

    // SELF ASSESSMENT — DISCIPLINE
    { text: 'I follow all workplace rules and organizational policies.', textHindi: 'मैं कार्यस्थल के सभी नियमों और संगठनात्मक नीतियों का पालन करता/करती हूँ।', category: 'DISCIPLINE', level: 'SELF', isActive: true },
    { text: 'I maintain a clean and organized workspace at all times.', textHindi: 'मैं हमेशा अपने कार्यक्षेत्र को साफ और व्यवस्थित रखता/रखती हूँ।', category: 'DISCIPLINE', level: 'SELF', isActive: true },
    { text: 'I dress professionally and follow the dress code.', textHindi: 'मैं पेशेवर तरीके से कपड़े पहनता/पहनती हूँ और ड्रेस कोड का पालन करता/करती हूँ।', category: 'DISCIPLINE', level: 'SELF', isActive: true },
    { text: 'I avoid personal phone usage during working hours.', textHindi: 'मैं काम के घंटों के दौरान व्यक्तिगत फोन के उपयोग से बचता/बचती हूँ।', category: 'DISCIPLINE', level: 'SELF', isActive: true },
    { text: 'I handle conflicts calmly and professionally.', textHindi: 'मैं संघर्षों को शांतिपूर्वक और पेशेवर तरीके से संभालता/संभालती हूँ।', category: 'DISCIPLINE', level: 'SELF', isActive: true },
    { text: 'I accept feedback positively and work to improve.', textHindi: 'मैं फीडबैक को सकारात्मक रूप से स्वीकार करता/करती हूँ और सुधार के लिए काम करता/करती हूँ।', category: 'DISCIPLINE', level: 'SELF', isActive: true },
    { text: 'I complete assigned tasks without needing repeated reminders.', textHindi: 'मैं बार-बार याद दिलाए बिना सौंपे गए कार्यों को पूरा करता/करती हूँ।', category: 'DISCIPLINE', level: 'SELF', isActive: true },
    { text: 'I maintain confidentiality of organizational information.', textHindi: 'मैं संगठनात्मक जानकारी की गोपनीयता बनाए रखता/रखती हूँ।', category: 'DISCIPLINE', level: 'SELF', isActive: true },

    // SELF ASSESSMENT — PRODUCTIVITY
    { text: 'I complete my assigned tasks within the given deadlines.', textHindi: 'मैं दी गई समय सीमा के भीतर अपने सौंपे गए कार्यों को पूरा करता/करती हूँ।', category: 'PRODUCTIVITY', level: 'SELF', isActive: true },
    { text: 'I consistently meet or exceed my daily work targets.', textHindi: 'मैं लगातार अपने दैनिक कार्य लक्ष्यों को पूरा करता/करती हूँ या उससे अधिक करता/करती हूँ।', category: 'PRODUCTIVITY', level: 'SELF', isActive: true },
    { text: 'I manage my time efficiently to maximize output.', textHindi: 'मैं अधिकतम उत्पादन के लिए अपने समय का कुशलतापूर्वक प्रबंधन करता/करती हूँ।', category: 'PRODUCTIVITY', level: 'SELF', isActive: true },
    { text: 'I prioritize tasks correctly based on urgency and importance.', textHindi: 'मैं तात्कालिकता और महत्व के आधार पर कार्यों को सही ढंग से प्राथमिकता देता/देती हूँ।', category: 'PRODUCTIVITY', level: 'SELF', isActive: true },
    { text: 'I minimize errors in my work through careful attention.', textHindi: 'मैं सावधानीपूर्वक ध्यान देकर अपने काम में गलतियों को कम करता/करती हूँ।', category: 'PRODUCTIVITY', level: 'SELF', isActive: true },
    { text: 'I take ownership of my work and see tasks through to completion.', textHindi: 'मैं अपने काम की जिम्मेदारी लेता/लेती हूँ और कार्यों को पूरा होने तक देखता/देखती हूँ।', category: 'PRODUCTIVITY', level: 'SELF', isActive: true },
    { text: 'I actively look for ways to improve my work speed and quality.', textHindi: 'मैं अपनी कार्य गति और गुणवत्ता को बेहतर बनाने के तरीके सक्रिय रूप से खोजता/खोजती हूँ।', category: 'PRODUCTIVITY', level: 'SELF', isActive: true },
    { text: 'I handle multiple tasks simultaneously without losing quality.', textHindi: 'मैं गुणवत्ता खोए बिना एक साथ कई कार्यों को संभालता/संभालती हूँ।', category: 'PRODUCTIVITY', level: 'SELF', isActive: true },

    // SELF ASSESSMENT — TEAMWORK
    { text: 'I actively support my colleagues when they need help.', textHindi: 'जब मेरे सहकर्मियों को मदद की जरूरत होती है तो मैं सक्रिय रूप से उनका समर्थन करता/करती हूँ।', category: 'TEAMWORK', level: 'SELF', isActive: true },
    { text: 'I share knowledge and information with my team freely.', textHindi: 'मैं अपनी टीम के साथ स्वतंत्र रूप से ज्ञान और जानकारी साझा करता/करती हूँ।', category: 'TEAMWORK', level: 'SELF', isActive: true },
    { text: 'I contribute positively to team discussions and meetings.', textHindi: 'मैं टीम की चर्चाओं और बैठकों में सकारात्मक योगदान देता/देती हूँ।', category: 'TEAMWORK', level: 'SELF', isActive: true },
    { text: 'I respect the opinions and ideas of my teammates.', textHindi: 'मैं अपने साथियों की राय और विचारों का सम्मान करता/करती हूँ।', category: 'TEAMWORK', level: 'SELF', isActive: true },
    { text: 'I step in to help others when workload is uneven.', textHindi: 'जब कार्यभार असमान होता है तो मैं दूसरों की मदद के लिए आगे आता/आती हूँ।', category: 'TEAMWORK', level: 'SELF', isActive: true },
    { text: 'I avoid creating conflicts within my team.', textHindi: 'मैं अपनी टीम में विवाद पैदा करने से बचता/बचती हूँ।', category: 'TEAMWORK', level: 'SELF', isActive: true },
    { text: 'I give credit to teammates for their contributions.', textHindi: 'मैं अपने साथियों को उनके योगदान के लिए श्रेय देता/देती हूँ।', category: 'TEAMWORK', level: 'SELF', isActive: true },
    { text: 'I work cooperatively with people from different backgrounds.', textHindi: 'मैं विभिन्न पृष्ठभूमि के लोगों के साथ सहयोगपूर्वक काम करता/करती हूँ।', category: 'TEAMWORK', level: 'SELF', isActive: true },

    // SELF ASSESSMENT — INITIATIVE
    { text: 'I take on additional responsibilities without being asked.', textHindi: 'मैं बिना कहे अतिरिक्त जिम्मेदारियाँ लेता/लेती हूँ।', category: 'INITIATIVE', level: 'SELF', isActive: true },
    { text: 'I proactively identify problems and suggest solutions.', textHindi: 'मैं सक्रिय रूप से समस्याओं की पहचान करता/करती हूँ और समाधान सुझाता/सुझाती हूँ।', category: 'INITIATIVE', level: 'SELF', isActive: true },
    { text: 'I volunteer for new projects and challenging assignments.', textHindi: 'मैं नई परियोजनाओं और चुनौतीपूर्ण कार्यों के लिए स्वेच्छा से आगे आता/आती हूँ।', category: 'INITIATIVE', level: 'SELF', isActive: true },
    { text: 'I continuously seek to learn new skills relevant to my role.', textHindi: 'मैं लगातार अपनी भूमिका से संबंधित नए कौशल सीखने की कोशिश करता/करती हूँ।', category: 'INITIATIVE', level: 'SELF', isActive: true },
    { text: 'I suggest process improvements to make work more efficient.', textHindi: 'मैं काम को अधिक कुशल बनाने के लिए प्रक्रिया में सुधार का सुझाव देता/देती हूँ।', category: 'INITIATIVE', level: 'SELF', isActive: true },
    { text: 'I act immediately when I see something that needs attention.', textHindi: 'जब मुझे कुछ ध्यान देने योग्य दिखता है तो मैं तुरंत कार्य करता/करती हूँ।', category: 'INITIATIVE', level: 'SELF', isActive: true },
    { text: 'I take responsibility for outcomes rather than waiting for instructions.', textHindi: 'मैं निर्देशों का इंतजार करने की बजाय परिणामों की जिम्मेदारी लेता/लेती हूँ।', category: 'INITIATIVE', level: 'SELF', isActive: true },
    { text: 'I motivate others around me to perform better.', textHindi: 'मैं अपने आसपास के लोगों को बेहतर प्रदर्शन करने के लिए प्रेरित करता/करती हूँ।', category: 'INITIATIVE', level: 'SELF', isActive: true },

    // SELF ASSESSMENT — COMMUNICATION
    { text: 'I communicate clearly and professionally with my team.', textHindi: 'मैं अपनी टीम के साथ स्पष्ट और पेशेवर तरीके से संवाद करता/करती हूँ।', category: 'COMMUNICATION', level: 'SELF', isActive: true },
    { text: 'I respond to messages and emails within a reasonable time.', textHindi: 'मैं उचित समय के भीतर संदेशों और ईमेल का जवाब देता/देती हूँ।', category: 'COMMUNICATION', level: 'SELF', isActive: true },
    { text: 'I ask for clarification when I do not understand something.', textHindi: 'जब मुझे कुछ समझ नहीं आता तो मैं स्पष्टीकरण माँगता/माँगती हूँ।', category: 'COMMUNICATION', level: 'SELF', isActive: true },
    { text: 'I give clear and complete information when reporting to my supervisor.', textHindi: 'अपने पर्यवेक्षक को रिपोर्ट करते समय मैं स्पष्ट और पूर्ण जानकारी देता/देती हूँ।', category: 'COMMUNICATION', level: 'SELF', isActive: true },
    { text: 'I listen attentively when others are speaking.', textHindi: 'जब दूसरे बोल रहे होते हैं तो मैं ध्यान से सुनता/सुनती हूँ।', category: 'COMMUNICATION', level: 'SELF', isActive: true },
    { text: 'I document my work properly for future reference.', textHindi: 'मैं भविष्य के संदर्भ के लिए अपने काम को सही तरीके से दस्तावेज़ करता/करती हूँ।', category: 'COMMUNICATION', level: 'SELF', isActive: true },

    // SELF ASSESSMENT — INTEGRITY
    { text: 'I am honest about my work progress and challenges.', textHindi: 'मैं अपनी कार्य प्रगति और चुनौतियों के बारे में ईमानदार हूँ।', category: 'INTEGRITY', level: 'SELF', isActive: true },
    { text: 'I admit mistakes immediately and take steps to correct them.', textHindi: 'मैं तुरंत गलतियाँ स्वीकार करता/करती हूँ और उन्हें सुधारने के लिए कदम उठाता/उठाती हूँ।', category: 'INTEGRITY', level: 'SELF', isActive: true },
    { text: 'I treat all resources and assets of the organization with care.', textHindi: 'मैं संगठन के सभी संसाधनों और संपत्तियों की देखभाल करता/करती हूँ।', category: 'INTEGRITY', level: 'SELF', isActive: true },
    { text: 'I follow ethical standards in all work situations.', textHindi: 'मैं सभी कार्य स्थितियों में नैतिक मानकों का पालन करता/करती हूँ।', category: 'INTEGRITY', level: 'SELF', isActive: true },
    { text: 'I do not misuse my position or authority.', textHindi: 'मैं अपनी स्थिति या अधिकार का दुरुपयोग नहीं करता/करती।', category: 'INTEGRITY', level: 'SELF', isActive: true },
    { text: 'I act with consistency whether or not I am being observed.', textHindi: 'मैं देखे जाने या न देखे जाने पर एक समान व्यवहार करता/करती हूँ।', category: 'INTEGRITY', level: 'SELF', isActive: true },

    // SUPERVISOR EVALUATION
    { text: 'This employee consistently delivers work of high quality.', textHindi: 'यह कर्मचारी लगातार उच्च गुणवत्ता का काम करता/करती है।', category: 'PRODUCTIVITY', level: 'SUPERVISOR', isActive: true },
    { text: 'This employee meets deadlines without requiring supervision.', textHindi: 'यह कर्मचारी बिना निगरानी के समय सीमा पूरी करता/करती है।', category: 'PRODUCTIVITY', level: 'SUPERVISOR', isActive: true },
    { text: 'This employee handles work pressure effectively.', textHindi: 'यह कर्मचारी काम के दबाव को प्रभावी ढंग से संभालता/संभालती है।', category: 'PRODUCTIVITY', level: 'SUPERVISOR', isActive: true },
    { text: 'This employee\'s productivity this quarter has been above average.', textHindi: 'इस तिमाही में इस कर्मचारी की उत्पादकता औसत से अधिक रही है।', category: 'PRODUCTIVITY', level: 'SUPERVISOR', isActive: true },
    { text: 'This employee shows consistent improvement over time.', textHindi: 'यह कर्मचारी समय के साथ लगातार सुधार दिखाता/दिखाती है।', category: 'PRODUCTIVITY', level: 'SUPERVISOR', isActive: true },
    { text: 'This employee maintains a positive attitude at the workplace.', textHindi: 'यह कर्मचारी कार्यस्थल पर सकारात्मक दृष्टिकोण बनाए रखता/रखती है।', category: 'DISCIPLINE', level: 'SUPERVISOR', isActive: true },
    { text: 'This employee cooperates well with the entire team.', textHindi: 'यह कर्मचारी पूरी टीम के साथ अच्छे से सहयोग करता/करती है।', category: 'TEAMWORK', level: 'SUPERVISOR', isActive: true },
    { text: 'This employee responds to feedback constructively.', textHindi: 'यह कर्मचारी फीडबैक पर रचनात्मक तरीके से प्रतिक्रिया देता/देती है।', category: 'DISCIPLINE', level: 'SUPERVISOR', isActive: true },
    { text: 'This employee handles conflicts maturely and professionally.', textHindi: 'यह कर्मचारी विवादों को परिपक्वता और पेशेवर तरीके से संभालता/संभालती है।', category: 'DISCIPLINE', level: 'SUPERVISOR', isActive: true },
    { text: 'This employee follows workplace rules consistently.', textHindi: 'यह कर्मचारी कार्यस्थल के नियमों का लगातार पालन करता/करती है।', category: 'DISCIPLINE', level: 'SUPERVISOR', isActive: true },
    { text: 'I can assign critical tasks to this employee with confidence.', textHindi: 'मैं इस कर्मचारी को आत्मविश्वास के साथ महत्वपूर्ण कार्य सौंप सकता/सकती हूँ।', category: 'INTEGRITY', level: 'SUPERVISOR', isActive: true },
    { text: 'This employee shows up prepared and ready every day.', textHindi: 'यह कर्मचारी हर दिन तैयार होकर आता/आती है।', category: 'ATTENDANCE', level: 'SUPERVISOR', isActive: true },
    { text: 'This employee takes ownership of mistakes and corrects them.', textHindi: 'यह कर्मचारी गलतियों की जिम्मेदारी लेता/लेती है और उन्हें सुधारता/सुधारती है।', category: 'INTEGRITY', level: 'SUPERVISOR', isActive: true },
    { text: 'This employee follows through on every commitment made.', textHindi: 'यह कर्मचारी की गई हर प्रतिबद्धता को पूरा करता/करती है।', category: 'INTEGRITY', level: 'SUPERVISOR', isActive: true },

    // BRANCH MANAGER EVALUATION
    { text: 'This employee demonstrates leadership potential in their role.', textHindi: 'यह कर्मचारी अपनी भूमिका में नेतृत्व क्षमता प्रदर्शित करता/करती है।', category: 'INITIATIVE', level: 'BRANCH_MANAGER', isActive: true },
    { text: 'This employee contributes positively to the department goals.', textHindi: 'यह कर्मचारी विभाग के लक्ष्यों में सकारात्मक योगदान देता/देती है।', category: 'PRODUCTIVITY', level: 'BRANCH_MANAGER', isActive: true },
    { text: 'This employee shows responsibility beyond their job description.', textHindi: 'यह कर्मचारी अपने कार्य विवरण से परे जिम्मेदारी दिखाता/दिखाती है।', category: 'INITIATIVE', level: 'BRANCH_MANAGER', isActive: true },
    { text: 'This employee handles pressure situations with maturity.', textHindi: 'यह कर्मचारी दबाव की स्थितियों को परिपक्वता से संभालता/संभालती है।', category: 'DISCIPLINE', level: 'BRANCH_MANAGER', isActive: true },
    { text: 'This employee\'s presence positively impacts team morale.', textHindi: 'इस कर्मचारी की उपस्थिति टीम के मनोबल पर सकारात्मक प्रभाव डालती है।', category: 'TEAMWORK', level: 'BRANCH_MANAGER', isActive: true },
    { text: 'This employee represents the values of Akshaya Patra well.', textHindi: 'यह कर्मचारी अक्षय पात्र के मूल्यों का अच्छे से प्रतिनिधित्व करता/करती है।', category: 'INTEGRITY', level: 'BRANCH_MANAGER', isActive: true },
    { text: 'This employee maintains consistent attendance across the quarter.', textHindi: 'यह कर्मचारी पूरी तिमाही में लगातार उपस्थिति बनाए रखता/रखती है।', category: 'ATTENDANCE', level: 'BRANCH_MANAGER', isActive: true },
    { text: 'This employee shows punctuality and respects work timings.', textHindi: 'यह कर्मचारी समयनिष्ठा दिखाता/दिखाती है और काम के समय का सम्मान करता/करती है।', category: 'ATTENDANCE', level: 'BRANCH_MANAGER', isActive: true },
    { text: 'This employee adheres to workplace discipline consistently.', textHindi: 'यह कर्मचारी लगातार कार्यस्थल अनुशासन का पालन करता/करती है।', category: 'DISCIPLINE', level: 'BRANCH_MANAGER', isActive: true },
    { text: 'This employee delivers assigned tasks with minimal supervision.', textHindi: 'यह कर्मचारी न्यूनतम निगरानी के साथ सौंपे गए कार्यों को पूरा करता/करती है।', category: 'PRODUCTIVITY', level: 'BRANCH_MANAGER', isActive: true },
    { text: 'This employee collaborates effectively across departments.', textHindi: 'यह कर्मचारी विभागों में प्रभावी ढंग से सहयोग करता/करती है।', category: 'TEAMWORK', level: 'BRANCH_MANAGER', isActive: true },
    { text: 'This employee communicates clearly with peers and seniors.', textHindi: 'यह कर्मचारी साथियों और वरिष्ठों के साथ स्पष्ट संवाद करता/करती है।', category: 'COMMUNICATION', level: 'BRANCH_MANAGER', isActive: true },
    { text: 'This employee takes initiative to solve problems proactively.', textHindi: 'यह कर्मचारी सक्रिय रूप से समस्याओं को हल करने की पहल करता/करती है।', category: 'INITIATIVE', level: 'BRANCH_MANAGER', isActive: true },
    { text: 'This employee acts with honesty and integrity at all times.', textHindi: 'यह कर्मचारी हमेशा ईमानदारी और सत्यनिष्ठा से कार्य करता/करती है।', category: 'INTEGRITY', level: 'BRANCH_MANAGER', isActive: true },
    { text: 'This employee maintains high work standards under pressure.', textHindi: 'यह कर्मचारी दबाव में उच्च कार्य मानक बनाए रखता/रखती है।', category: 'PRODUCTIVITY', level: 'BRANCH_MANAGER', isActive: true },

    // CLUSTER MANAGER EVALUATION
    { text: 'This employee has made a measurable impact this quarter.', textHindi: 'इस कर्मचारी ने इस तिमाही में मापने योग्य प्रभाव डाला है।', category: 'PRODUCTIVITY', level: 'CLUSTER_MANAGER', isActive: true },
    { text: 'This employee demonstrates the qualities of a future leader.', textHindi: 'यह कर्मचारी भविष्य के नेता के गुण प्रदर्शित करता/करती है।', category: 'INITIATIVE', level: 'CLUSTER_MANAGER', isActive: true },
    { text: 'This employee is reliable and trustworthy at the highest level.', textHindi: 'यह कर्मचारी उच्चतम स्तर पर विश्वसनीय और भरोसेमंद है।', category: 'INTEGRITY', level: 'CLUSTER_MANAGER', isActive: true },
    { text: 'This employee consistently upholds the mission of Akshaya Patra.', textHindi: 'यह कर्मचारी लगातार अक्षय पात्र के मिशन को बनाए रखता/रखती है।', category: 'INTEGRITY', level: 'CLUSTER_MANAGER', isActive: true },
    { text: 'This employee sets a standard for others in the organization.', textHindi: 'यह कर्मचारी संगठन में दूसरों के लिए एक मानक स्थापित करता/करती है।', category: 'INITIATIVE', level: 'CLUSTER_MANAGER', isActive: true },

    // HOD EVALUATION (for blue-collar employees in big branches)
    { text: 'This employee consistently performs their duties with diligence.', textHindi: 'यह कर्मचारी लगातार अपने कर्तव्यों को लगन से निभाता/निभाती है।', category: 'PRODUCTIVITY', level: 'HOD', isActive: true },
    { text: 'This employee maintains good attendance and punctuality.', textHindi: 'यह कर्मचारी अच्छी उपस्थिति और समयनिष्ठा बनाए रखता/रखती है।', category: 'ATTENDANCE', level: 'HOD', isActive: true },
    { text: 'This employee follows safety protocols and departmental procedures.', textHindi: 'यह कर्मचारी सुरक्षा प्रोटोकॉल और विभागीय प्रक्रियाओं का पालन करता/करती है।', category: 'DISCIPLINE', level: 'HOD', isActive: true },
    { text: 'This employee works well with colleagues in the department.', textHindi: 'यह कर्मचारी विभाग में सहकर्मियों के साथ अच्छे से काम करता/करती है।', category: 'TEAMWORK', level: 'HOD', isActive: true },
    { text: 'This employee takes initiative to improve work processes.', textHindi: 'यह कर्मचारी कार्य प्रक्रियाओं में सुधार के लिए पहल करता/करती है।', category: 'INITIATIVE', level: 'HOD', isActive: true },
    { text: 'This employee handles equipment and resources responsibly.', textHindi: 'यह कर्मचारी उपकरण और संसाधनों को जिम्मेदारी से संभालता/संभालती है।', category: 'INTEGRITY', level: 'HOD', isActive: true },
    { text: 'This employee meets daily production / task targets reliably.', textHindi: 'यह कर्मचारी दैनिक उत्पादन / कार्य लक्ष्यों को विश्वसनीय रूप से पूरा करता/करती है।', category: 'PRODUCTIVITY', level: 'HOD', isActive: true },
    { text: 'This employee maintains good hygiene and workplace cleanliness.', textHindi: 'यह कर्मचारी अच्छी स्वच्छता और कार्यस्थल की सफाई बनाए रखता/रखती है।', category: 'DISCIPLINE', level: 'HOD', isActive: true },
    { text: 'This employee is willing to help colleagues during busy hours.', textHindi: 'यह कर्मचारी व्यस्त घंटों के दौरान सहकर्मियों की मदद करने को तैयार है।', category: 'TEAMWORK', level: 'HOD', isActive: true },
    { text: 'This employee reports issues promptly to the supervisor.', textHindi: 'यह कर्मचारी मुद्दों को तुरंत पर्यवेक्षक को रिपोर्ट करता/करती है।', category: 'COMMUNICATION', level: 'HOD', isActive: true },
    { text: 'This employee avoids absenteeism and informs well in advance.', textHindi: 'यह कर्मचारी अनुपस्थिति से बचता/बचती है और पहले से सूचित करता/करती है।', category: 'ATTENDANCE', level: 'HOD', isActive: true },
    { text: 'This employee follows instructions accurately without shortcuts.', textHindi: 'यह कर्मचारी शॉर्टकट के बिना निर्देशों का सटीक पालन करता/करती है।', category: 'DISCIPLINE', level: 'HOD', isActive: true },
    { text: 'This employee demonstrates a positive attitude at work.', textHindi: 'यह कर्मचारी काम पर सकारात्मक दृष्टिकोण दिखाता/दिखाती है।', category: 'TEAMWORK', level: 'HOD', isActive: true },
    { text: 'This employee has shown willingness to learn new skills.', textHindi: 'यह कर्मचारी नए कौशल सीखने की इच्छा दिखाता/दिखाती है।', category: 'INITIATIVE', level: 'HOD', isActive: true },
    { text: 'This employee is honest and trustworthy in daily work.', textHindi: 'यह कर्मचारी दैनिक कार्य में ईमानदार और भरोसेमंद है।', category: 'INTEGRITY', level: 'HOD', isActive: true },

    // HR EVALUATION (final stage before committee)
    { text: 'This employee has a clean disciplinary record this quarter.', textHindi: 'इस तिमाही में इस कर्मचारी का अनुशासनात्मक रिकॉर्ड स्वच्छ रहा है।', category: 'DISCIPLINE', level: 'HR', isActive: true },
    { text: 'This employee demonstrates commitment to organizational values.', textHindi: 'यह कर्मचारी संगठनात्मक मूल्यों के प्रति प्रतिबद्धता प्रदर्शित करता/करती है।', category: 'INTEGRITY', level: 'HR', isActive: true },
    { text: 'This employee has shown growth and development this quarter.', textHindi: 'इस तिमाही में इस कर्मचारी ने विकास और प्रगति दिखाई है।', category: 'INITIATIVE', level: 'HR', isActive: true },
    { text: 'This employee contributes to a positive workplace culture.', textHindi: 'यह कर्मचारी सकारात्मक कार्यस्थल संस्कृति में योगदान देता/देती है।', category: 'TEAMWORK', level: 'HR', isActive: true },
    { text: 'This employee has maintained satisfactory attendance and punctuality records.', textHindi: 'इस कर्मचारी ने संतोषजनक उपस्थिति और समयनिष्ठा रिकॉर्ड बनाए रखा है।', category: 'ATTENDANCE', level: 'HR', isActive: true },
    { text: 'This employee deserves recognition for outstanding performance.', textHindi: 'यह कर्मचारी उत्कृष्ट प्रदर्शन के लिए मान्यता का पात्र है।', category: 'PRODUCTIVITY', level: 'HR', isActive: true }
  ];

  console.log('Seeding questions...');
  for (const q of questions) {
    const existing = await prisma.question.findFirst({ where: { text: q.text } });
    if (existing) {
      await prisma.question.update({
        where: { id: existing.id },
        data: {
          textHindi: q.textHindi,
          category: q.category,
          level: q.level,
          isActive: q.isActive
        }
      });
    } else {
      await prisma.question.create({
        data: {
          text: q.text,
          textHindi: q.textHindi,
          category: q.category,
          level: q.level,
          isActive: q.isActive
        }
      });
    }
  }

  const generatedQuestions = await prisma.question.count();
  console.log(`✓ ${generatedQuestions} questions seeded`);

  const self = await prisma.question.count({ where: { level: 'SELF' } });
  const supervisor = await prisma.question.count({ where: { level: 'SUPERVISOR' } });
  const bm = await prisma.question.count({ where: { level: 'BRANCH_MANAGER' } });
  const cm = await prisma.question.count({ where: { level: 'CLUSTER_MANAGER' } });
  const hod = await prisma.question.count({ where: { level: 'HOD' } });
  const hr = await prisma.question.count({ where: { level: 'HR' } });

  console.log('==============================');
  console.log('QUESTION BANK SUMMARY');
  console.log('==============================');
  console.log(`SELF ASSESSMENT : ${self}  questions`);
  console.log(`SUPERVISOR      : ${supervisor} questions`);
  console.log(`BRANCH MANAGER  : ${bm}  questions`);
  console.log(`CLUSTER MANAGER : ${cm}  questions`);
  console.log(`HOD             : ${hod}  questions`);
  console.log(`HR              : ${hr}  questions`);
  console.log(`TOTAL           : ${self+supervisor+bm+cm+hod+hr} questions`);
  console.log('==============================\n');

  // Branch summary
  const branches = await prisma.branch.findMany({ select: { name: true, branchType: true } });
  console.log('==============================');
  console.log('BRANCH SUMMARY');
  console.log('==============================');
  branches.forEach(b => console.log(`  ${b.name}: ${b.branchType}`));
  console.log('==============================\n');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
