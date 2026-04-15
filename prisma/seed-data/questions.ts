// Questions bank — three levels only: SELF, BRANCH_MANAGER, CLUSTER_MANAGER.
// HOD-level evaluation (big-branch blue-collar) reuses the BRANCH_MANAGER bank.
export const QUESTIONS = [
  // ═════════════════════════ SELF ASSESSMENT ═════════════════════════
  // ATTENDANCE
  { text: 'I report to work on time every day without exception.', textHindi: 'मैं बिना किसी अपवाद के हर दिन समय पर काम पर रिपोर्ट करता/करती हूँ।', category: 'ATTENDANCE', level: 'SELF', isActive: true },
  { text: 'I inform my supervisor in advance when I need to be absent.', textHindi: 'जब मुझे अनुपस्थित रहना होता है तो मैं अपने पर्यवेक्षक को पहले से सूचित करता/करती हूँ।', category: 'ATTENDANCE', level: 'SELF', isActive: true },
  { text: 'My attendance record this quarter has been consistent and reliable.', textHindi: 'इस तिमाही में मेरी उपस्थिति का रिकॉर्ड निरंतर और विश्वसनीय रहा है।', category: 'ATTENDANCE', level: 'SELF', isActive: true },
  { text: 'I stay for my complete shift and do not leave early without permission.', textHindi: 'मैं अपनी पूरी शिफ्ट रुकता/रुकती हूँ और बिना अनुमति के जल्दी नहीं जाता/जाती।', category: 'ATTENDANCE', level: 'SELF', isActive: true },
  { text: 'I have not taken any unplanned leaves this quarter.', textHindi: 'मैंने इस तिमाही में कोई अनियोजित छुट्टी नहीं ली है।', category: 'ATTENDANCE', level: 'SELF', isActive: true },
  { text: 'I make up for missed work whenever I am absent.', textHindi: 'जब भी मैं अनुपस्थित होता/होती हूँ तो छूटे हुए काम की भरपाई करता/करती हूँ।', category: 'ATTENDANCE', level: 'SELF', isActive: true },
  { text: 'I am present and punctual even during high-pressure periods.', textHindi: 'उच्च दबाव की अवधि में भी मैं उपस्थित और समयनिष्ठ रहता/रहती हूँ।', category: 'ATTENDANCE', level: 'SELF', isActive: true },
  { text: 'I notify my team immediately when I am running late.', textHindi: 'जब मुझे देर हो रही होती है तो मैं तुरंत अपनी टीम को सूचित करता/करती हूँ।', category: 'ATTENDANCE', level: 'SELF', isActive: true },
  // DISCIPLINE
  { text: 'I follow all workplace rules and organizational policies.', textHindi: 'मैं कार्यस्थल के सभी नियमों और संगठनात्मक नीतियों का पालन करता/करती हूँ।', category: 'DISCIPLINE', level: 'SELF', isActive: true },
  { text: 'I maintain a clean and organized workspace at all times.', textHindi: 'मैं हमेशा अपने कार्यक्षेत्र को साफ और व्यवस्थित रखता/रखती हूँ।', category: 'DISCIPLINE', level: 'SELF', isActive: true },
  { text: 'I dress professionally and follow the dress code.', textHindi: 'मैं पेशेवर तरीके से कपड़े पहनता/पहनती हूँ और ड्रेस कोड का पालन करता/करती हूँ।', category: 'DISCIPLINE', level: 'SELF', isActive: true },
  { text: 'I avoid personal phone usage during working hours.', textHindi: 'मैं काम के घंटों के दौरान व्यक्तिगत फोन के उपयोग से बचता/बचती हूँ।', category: 'DISCIPLINE', level: 'SELF', isActive: true },
  { text: 'I handle conflicts calmly and professionally.', textHindi: 'मैं संघर्षों को शांतिपूर्वक और पेशेवर तरीके से संभालता/संभालती हूँ।', category: 'DISCIPLINE', level: 'SELF', isActive: true },
  { text: 'I accept feedback positively and work to improve.', textHindi: 'मैं फीडबैक को सकारात्मक रूप से स्वीकार करता/करती हूँ और सुधार के लिए काम करता/करती हूँ।', category: 'DISCIPLINE', level: 'SELF', isActive: true },
  { text: 'I complete assigned tasks without needing repeated reminders.', textHindi: 'मैं बार-बार याद दिलाए बिना सौंपे गए कार्यों को पूरा करता/करती हूँ।', category: 'DISCIPLINE', level: 'SELF', isActive: true },
  { text: 'I maintain confidentiality of organizational information.', textHindi: 'मैं संगठनात्मक जानकारी की गोपनीयता बनाए रखता/रखती हूँ।', category: 'DISCIPLINE', level: 'SELF', isActive: true },
  // PRODUCTIVITY
  { text: 'I complete my assigned tasks within the given deadlines.', textHindi: 'मैं दी गई समय सीमा के भीतर अपने सौंपे गए कार्यों को पूरा करता/करती हूँ।', category: 'PRODUCTIVITY', level: 'SELF', isActive: true },
  { text: 'I consistently meet or exceed my daily work targets.', textHindi: 'मैं लगातार अपने दैनिक कार्य लक्ष्यों को पूरा करता/करती हूँ या उससे अधिक करता/करती हूँ।', category: 'PRODUCTIVITY', level: 'SELF', isActive: true },
  { text: 'I manage my time efficiently to maximize output.', textHindi: 'मैं अधिकतम उत्पादन के लिए अपने समय का कुशलतापूर्वक प्रबंधन करता/करती हूँ।', category: 'PRODUCTIVITY', level: 'SELF', isActive: true },
  { text: 'I prioritize tasks correctly based on urgency and importance.', textHindi: 'मैं तात्कालिकता और महत्व के आधार पर कार्यों को सही ढंग से प्राथमिकता देता/देती हूँ।', category: 'PRODUCTIVITY', level: 'SELF', isActive: true },
  { text: 'I minimize errors in my work through careful attention.', textHindi: 'मैं सावधानीपूर्वक ध्यान देकर अपने काम में गलतियों को कम करता/करती हूँ।', category: 'PRODUCTIVITY', level: 'SELF', isActive: true },
  { text: 'I take ownership of my work and see tasks through to completion.', textHindi: 'मैं अपने काम की जिम्मेदारी लेता/लेती हूँ और कार्यों को पूरा होने तक देखता/देखती हूँ।', category: 'PRODUCTIVITY', level: 'SELF', isActive: true },
  { text: 'I actively look for ways to improve my work speed and quality.', textHindi: 'मैं अपनी कार्य गति और गुणवत्ता को बेहतर बनाने के तरीके सक्रिय रूप से खोजता/खोजती हूँ।', category: 'PRODUCTIVITY', level: 'SELF', isActive: true },
  { text: 'I handle multiple tasks simultaneously without losing quality.', textHindi: 'मैं गुणवत्ता खोए बिना एक साथ कई कार्यों को संभालता/संभालती हूँ।', category: 'PRODUCTIVITY', level: 'SELF', isActive: true },
  // TEAMWORK
  { text: 'I actively support my colleagues when they need help.', textHindi: 'जब मेरे सहकर्मियों को मदद की जरूरत होती है तो मैं सक्रिय रूप से उनका समर्थन करता/करती हूँ।', category: 'TEAMWORK', level: 'SELF', isActive: true },
  { text: 'I share knowledge and information with my team freely.', textHindi: 'मैं अपनी टीम के साथ स्वतंत्र रूप से ज्ञान और जानकारी साझा करता/करती हूँ।', category: 'TEAMWORK', level: 'SELF', isActive: true },
  { text: 'I contribute positively to team discussions and meetings.', textHindi: 'मैं टीम की चर्चाओं और बैठकों में सकारात्मक योगदान देता/देती हूँ।', category: 'TEAMWORK', level: 'SELF', isActive: true },
  { text: 'I respect the opinions and ideas of my teammates.', textHindi: 'मैं अपने साथियों की राय और विचारों का सम्मान करता/करती हूँ।', category: 'TEAMWORK', level: 'SELF', isActive: true },
  { text: 'I step in to help others when workload is uneven.', textHindi: 'जब कार्यभार असमान होता है तो मैं दूसरों की मदद के लिए आगे आता/आती हूँ।', category: 'TEAMWORK', level: 'SELF', isActive: true },
  { text: 'I avoid creating conflicts within my team.', textHindi: 'मैं अपनी टीम में विवाद पैदा करने से बचता/बचती हूँ।', category: 'TEAMWORK', level: 'SELF', isActive: true },
  { text: 'I give credit to teammates for their contributions.', textHindi: 'मैं अपने साथियों को उनके योगदान के लिए श्रेय देता/देती हूँ।', category: 'TEAMWORK', level: 'SELF', isActive: true },
  { text: 'I work cooperatively with people from different backgrounds.', textHindi: 'मैं विभिन्न पृष्ठभूमि के लोगों के साथ सहयोगपूर्वक काम करता/करती हूँ।', category: 'TEAMWORK', level: 'SELF', isActive: true },
  // INITIATIVE
  { text: 'I take on additional responsibilities without being asked.', textHindi: 'मैं बिना कहे अतिरिक्त जिम्मेदारियाँ लेता/लेती हूँ।', category: 'INITIATIVE', level: 'SELF', isActive: true },
  { text: 'I proactively identify problems and suggest solutions.', textHindi: 'मैं सक्रिय रूप से समस्याओं की पहचान करता/करती हूँ और समाधान सुझाता/सुझाती हूँ।', category: 'INITIATIVE', level: 'SELF', isActive: true },
  { text: 'I volunteer for new projects and challenging assignments.', textHindi: 'मैं नई परियोजनाओं और चुनौतीपूर्ण कार्यों के लिए स्वेच्छा से आगे आता/आती हूँ।', category: 'INITIATIVE', level: 'SELF', isActive: true },
  { text: 'I continuously seek to learn new skills relevant to my role.', textHindi: 'मैं लगातार अपनी भूमिका से संबंधित नए कौशल सीखने की कोशिश करता/करती हूँ।', category: 'INITIATIVE', level: 'SELF', isActive: true },
  { text: 'I suggest process improvements to make work more efficient.', textHindi: 'मैं काम को अधिक कुशल बनाने के लिए प्रक्रिया में सुधार का सुझाव देता/देती हूँ।', category: 'INITIATIVE', level: 'SELF', isActive: true },
  { text: 'I act immediately when I see something that needs attention.', textHindi: 'जब मुझे कुछ ध्यान देने योग्य दिखता है तो मैं तुरंत कार्य करता/करती हूँ।', category: 'INITIATIVE', level: 'SELF', isActive: true },
  { text: 'I take responsibility for outcomes rather than waiting for instructions.', textHindi: 'मैं निर्देशों का इंतजार करने की बजाय परिणामों की जिम्मेदारी लेता/लेती हूँ।', category: 'INITIATIVE', level: 'SELF', isActive: true },
  { text: 'I motivate others around me to perform better.', textHindi: 'मैं अपने आसपास के लोगों को बेहतर प्रदर्शन करने के लिए प्रेरित करता/करती हूँ।', category: 'INITIATIVE', level: 'SELF', isActive: true },
  // COMMUNICATION
  { text: 'I communicate clearly and professionally with my team.', textHindi: 'मैं अपनी टीम के साथ स्पष्ट और पेशेवर तरीके से संवाद करता/करती हूँ।', category: 'COMMUNICATION', level: 'SELF', isActive: true },
  { text: 'I respond to messages and emails within a reasonable time.', textHindi: 'मैं उचित समय के भीतर संदेशों और ईमेल का जवाब देता/देती हूँ।', category: 'COMMUNICATION', level: 'SELF', isActive: true },
  { text: 'I ask for clarification when I do not understand something.', textHindi: 'जब मुझे कुछ समझ नहीं आता तो मैं स्पष्टीकरण माँगता/माँगती हूँ।', category: 'COMMUNICATION', level: 'SELF', isActive: true },
  { text: 'I give clear and complete information when reporting to my supervisor.', textHindi: 'अपने पर्यवेक्षक को रिपोर्ट करते समय मैं स्पष्ट और पूर्ण जानकारी देता/देती हूँ।', category: 'COMMUNICATION', level: 'SELF', isActive: true },
  { text: 'I listen attentively when others are speaking.', textHindi: 'जब दूसरे बोल रहे होते हैं तो मैं ध्यान से सुनता/सुनती हूँ।', category: 'COMMUNICATION', level: 'SELF', isActive: true },
  { text: 'I document my work properly for future reference.', textHindi: 'मैं भविष्य के संदर्भ के लिए अपने काम को सही तरीके से दस्तावेज़ करता/करती हूँ।', category: 'COMMUNICATION', level: 'SELF', isActive: true },
  // INTEGRITY
  { text: 'I am honest about my work progress and challenges.', textHindi: 'मैं अपनी कार्य प्रगति और चुनौतियों के बारे में ईमानदार हूँ।', category: 'INTEGRITY', level: 'SELF', isActive: true },
  { text: 'I admit mistakes immediately and take steps to correct them.', textHindi: 'मैं तुरंत गलतियाँ स्वीकार करता/करती हूँ और उन्हें सुधारने के लिए कदम उठाता/उठाती हूँ।', category: 'INTEGRITY', level: 'SELF', isActive: true },
  { text: 'I treat all resources and assets of the organization with care.', textHindi: 'मैं संगठन के सभी संसाधनों और संपत्तियों की देखभाल करता/करती हूँ।', category: 'INTEGRITY', level: 'SELF', isActive: true },
  { text: 'I follow ethical standards in all work situations.', textHindi: 'मैं सभी कार्य स्थितियों में नैतिक मानकों का पालन करता/करती हूँ।', category: 'INTEGRITY', level: 'SELF', isActive: true },
  { text: 'I do not misuse my position or authority.', textHindi: 'मैं अपनी स्थिति या अधिकार का दुरुपयोग नहीं करता/करती।', category: 'INTEGRITY', level: 'SELF', isActive: true },
  { text: 'I act with consistency whether or not I am being observed.', textHindi: 'मैं देखे जाने या न देखे जाने पर एक समान व्यवहार करता/करती हूँ।', category: 'INTEGRITY', level: 'SELF', isActive: true },

  // ═════════════════════════ BRANCH MANAGER (30) ═════════════════════════
  // Also used by big-branch HODs for blue-collar Stage-2 evaluation.
  // ATTENDANCE (4)
  { text: 'This employee shows up prepared and ready every day.', textHindi: 'यह कर्मचारी हर दिन तैयार होकर आता/आती है।', category: 'ATTENDANCE', level: 'BRANCH_MANAGER', isActive: true },
  { text: 'This employee maintains excellent attendance throughout the quarter.', textHindi: 'यह कर्मचारी पूरे तिमाही में उत्कृष्ट उपस्थिति बनाए रखता/रखती है।', category: 'ATTENDANCE', level: 'BRANCH_MANAGER', isActive: true },
  { text: 'This employee is rarely absent without proper notice.', textHindi: 'यह कर्मचारी उचित सूचना के बिना शायद ही कभी अनुपस्थित रहता/रहती है।', category: 'ATTENDANCE', level: 'BRANCH_MANAGER', isActive: true },
  { text: 'This employee is punctual and completes full working hours.', textHindi: 'यह कर्मचारी समयनिष्ठ है और पूरे कार्य घंटे पूरा करता/करती है।', category: 'ATTENDANCE', level: 'BRANCH_MANAGER', isActive: true },
  // DISCIPLINE (5)
  { text: 'This employee maintains a positive attitude at the workplace.', textHindi: 'यह कर्मचारी कार्यस्थल पर सकारात्मक दृष्टिकोण बनाए रखता/रखती है।', category: 'DISCIPLINE', level: 'BRANCH_MANAGER', isActive: true },
  { text: 'This employee responds to feedback constructively.', textHindi: 'यह कर्मचारी फीडबैक पर रचनात्मक तरीके से प्रतिक्रिया देता/देती है।', category: 'DISCIPLINE', level: 'BRANCH_MANAGER', isActive: true },
  { text: 'This employee handles conflicts maturely and professionally.', textHindi: 'यह कर्मचारी विवादों को परिपक्वता और पेशेवर तरीके से संभालता/संभालती है।', category: 'DISCIPLINE', level: 'BRANCH_MANAGER', isActive: true },
  { text: 'This employee follows workplace rules consistently.', textHindi: 'यह कर्मचारी कार्यस्थल के नियमों का लगातार पालन करता/करती है।', category: 'DISCIPLINE', level: 'BRANCH_MANAGER', isActive: true },
  { text: 'This employee handles pressure situations with maturity.', textHindi: 'यह कर्मचारी दबाव की स्थितियों को परिपक्वता से संभालता/संभालती है।', category: 'DISCIPLINE', level: 'BRANCH_MANAGER', isActive: true },
  // PRODUCTIVITY (6)
  { text: 'This employee consistently delivers work of high quality.', textHindi: 'यह कर्मचारी लगातार उच्च गुणवत्ता का काम करता/करती है।', category: 'PRODUCTIVITY', level: 'BRANCH_MANAGER', isActive: true },
  { text: 'This employee meets deadlines without requiring supervision.', textHindi: 'यह कर्मचारी बिना निगरानी के समय सीमा पूरी करता/करती है।', category: 'PRODUCTIVITY', level: 'BRANCH_MANAGER', isActive: true },
  { text: 'This employee handles work pressure effectively.', textHindi: 'यह कर्मचारी काम के दबाव को प्रभावी ढंग से संभालता/संभालती है।', category: 'PRODUCTIVITY', level: 'BRANCH_MANAGER', isActive: true },
  { text: "This employee's productivity this quarter has been above average.", textHindi: 'इस तिमाही में इस कर्मचारी की उत्पादकता औसत से अधिक रही है।', category: 'PRODUCTIVITY', level: 'BRANCH_MANAGER', isActive: true },
  { text: 'This employee shows consistent improvement over time.', textHindi: 'यह कर्मचारी समय के साथ लगातार सुधार दिखाता/दिखाती है।', category: 'PRODUCTIVITY', level: 'BRANCH_MANAGER', isActive: true },
  { text: 'This employee contributes positively to the department goals.', textHindi: 'यह कर्मचारी विभाग के लक्ष्यों में सकारात्मक योगदान देता/देती है।', category: 'PRODUCTIVITY', level: 'BRANCH_MANAGER', isActive: true },
  // TEAMWORK (5)
  { text: 'This employee cooperates well with the entire team.', textHindi: 'यह कर्मचारी पूरी टीम के साथ अच्छे से सहयोग करता/करती है।', category: 'TEAMWORK', level: 'BRANCH_MANAGER', isActive: true },
  { text: "This employee's presence positively impacts team morale.", textHindi: 'इस कर्मचारी की उपस्थिति टीम के मनोबल पर सकारात्मक प्रभाव डालती है।', category: 'TEAMWORK', level: 'BRANCH_MANAGER', isActive: true },
  { text: 'This employee actively mentors or helps newer colleagues.', textHindi: 'यह कर्मचारी नए सहकर्मियों का सक्रिय रूप से मार्गदर्शन या सहायता करता/करती है।', category: 'TEAMWORK', level: 'BRANCH_MANAGER', isActive: true },
  { text: 'This employee communicates openly across departments.', textHindi: 'यह कर्मचारी विभागों में खुले तौर पर संवाद करता/करती है।', category: 'TEAMWORK', level: 'BRANCH_MANAGER', isActive: true },
  { text: 'This employee builds constructive working relationships.', textHindi: 'यह कर्मचारी रचनात्मक कार्य संबंध बनाता/बनाती है।', category: 'TEAMWORK', level: 'BRANCH_MANAGER', isActive: true },
  // INITIATIVE (5)
  { text: 'This employee demonstrates leadership potential in their role.', textHindi: 'यह कर्मचारी अपनी भूमिका में नेतृत्व क्षमता प्रदर्शित करता/करती है।', category: 'INITIATIVE', level: 'BRANCH_MANAGER', isActive: true },
  { text: 'This employee shows responsibility beyond their job description.', textHindi: 'यह कर्मचारी अपने कार्य विवरण से परे जिम्मेदारी दिखाता/दिखाती है।', category: 'INITIATIVE', level: 'BRANCH_MANAGER', isActive: true },
  { text: 'This employee proposes ideas that improve branch operations.', textHindi: 'यह कर्मचारी ऐसे विचार प्रस्तुत करता/करती है जो शाखा संचालन में सुधार लाते हैं।', category: 'INITIATIVE', level: 'BRANCH_MANAGER', isActive: true },
  { text: 'This employee takes charge during critical situations.', textHindi: 'यह कर्मचारी महत्वपूर्ण स्थितियों के दौरान कमान संभालता/संभालती है।', category: 'INITIATIVE', level: 'BRANCH_MANAGER', isActive: true },
  { text: 'This employee voluntarily supports extra branch activities.', textHindi: 'यह कर्मचारी स्वेच्छा से अतिरिक्त शाखा गतिविधियों का समर्थन करता/करती है।', category: 'INITIATIVE', level: 'BRANCH_MANAGER', isActive: true },
  // INTEGRITY (5)
  { text: 'I can assign critical tasks to this employee with confidence.', textHindi: 'मैं इस कर्मचारी को आत्मविश्वास के साथ महत्वपूर्ण कार्य सौंप सकता/सकती हूँ।', category: 'INTEGRITY', level: 'BRANCH_MANAGER', isActive: true },
  { text: 'This employee takes ownership of mistakes and corrects them.', textHindi: 'यह कर्मचारी गलतियों की जिम्मेदारी लेता/लेती है और उन्हें सुधारता/सुधारती है।', category: 'INTEGRITY', level: 'BRANCH_MANAGER', isActive: true },
  { text: 'This employee follows through on every commitment made.', textHindi: 'यह कर्मचारी की गई हर प्रतिबद्धता को पूरा करता/करती है।', category: 'INTEGRITY', level: 'BRANCH_MANAGER', isActive: true },
  { text: 'This employee represents the values of Akshaya Patra well.', textHindi: 'यह कर्मचारी अक्षय पात्र के मूल्यों का अच्छे से प्रतिनिधित्व करता/करती है।', category: 'INTEGRITY', level: 'BRANCH_MANAGER', isActive: true },
  { text: 'This employee is honest and transparent in all dealings.', textHindi: 'यह कर्मचारी सभी व्यवहारों में ईमानदार और पारदर्शी है।', category: 'INTEGRITY', level: 'BRANCH_MANAGER', isActive: true },

  // ═════════════════════════ CLUSTER MANAGER (20) ═════════════════════════
  // ATTENDANCE (2)
  { text: 'This employee demonstrates dependable attendance across the cluster.', textHindi: 'यह कर्मचारी क्लस्टर में भरोसेमंद उपस्थिति प्रदर्शित करता/करती है।', category: 'ATTENDANCE', level: 'CLUSTER_MANAGER', isActive: true },
  { text: 'This employee consistently shows up when the organization needs them.', textHindi: 'जब संगठन को आवश्यकता होती है तो यह कर्मचारी लगातार उपस्थित होता/होती है।', category: 'ATTENDANCE', level: 'CLUSTER_MANAGER', isActive: true },
  // DISCIPLINE (3)
  { text: 'This employee embodies organizational discipline at a high standard.', textHindi: 'यह कर्मचारी उच्च मानक पर संगठनात्मक अनुशासन का प्रतीक है।', category: 'DISCIPLINE', level: 'CLUSTER_MANAGER', isActive: true },
  { text: 'This employee handles cross-branch coordination professionally.', textHindi: 'यह कर्मचारी शाखाओं के बीच समन्वय को पेशेवर तरीके से संभालता/संभालती है।', category: 'DISCIPLINE', level: 'CLUSTER_MANAGER', isActive: true },
  { text: 'This employee adheres to policies even under stress.', textHindi: 'दबाव में भी यह कर्मचारी नीतियों का पालन करता/करती है।', category: 'DISCIPLINE', level: 'CLUSTER_MANAGER', isActive: true },
  // PRODUCTIVITY (4)
  { text: 'This employee has made a measurable impact this quarter.', textHindi: 'इस कर्मचारी ने इस तिमाही में मापने योग्य प्रभाव डाला है।', category: 'PRODUCTIVITY', level: 'CLUSTER_MANAGER', isActive: true },
  { text: "This employee's output contributes to cluster-wide performance.", textHindi: 'इस कर्मचारी का उत्पादन क्लस्टर-व्यापी प्रदर्शन में योगदान देता है।', category: 'PRODUCTIVITY', level: 'CLUSTER_MANAGER', isActive: true },
  { text: 'This employee delivers results that other branches can learn from.', textHindi: 'यह कर्मचारी ऐसे परिणाम देता/देती है जिनसे अन्य शाखाएँ सीख सकती हैं।', category: 'PRODUCTIVITY', level: 'CLUSTER_MANAGER', isActive: true },
  { text: 'This employee sustains high performance over the full quarter.', textHindi: 'यह कर्मचारी पूरी तिमाही में उच्च प्रदर्शन बनाए रखता/रखती है।', category: 'PRODUCTIVITY', level: 'CLUSTER_MANAGER', isActive: true },
  // TEAMWORK (2)
  { text: 'This employee strengthens collaboration within the cluster.', textHindi: 'यह कर्मचारी क्लस्टर के भीतर सहयोग को मजबूत करता/करती है।', category: 'TEAMWORK', level: 'CLUSTER_MANAGER', isActive: true },
  { text: 'This employee builds trust across branches and teams.', textHindi: 'यह कर्मचारी शाखाओं और टीमों में विश्वास बनाता/बनाती है।', category: 'TEAMWORK', level: 'CLUSTER_MANAGER', isActive: true },
  // INITIATIVE (4)
  { text: 'This employee demonstrates the qualities of a future leader.', textHindi: 'यह कर्मचारी भविष्य के नेता के गुण प्रदर्शित करता/करती है।', category: 'INITIATIVE', level: 'CLUSTER_MANAGER', isActive: true },
  { text: 'This employee sets a standard for others in the organization.', textHindi: 'यह कर्मचारी संगठन में दूसरों के लिए एक मानक स्थापित करता/करती है।', category: 'INITIATIVE', level: 'CLUSTER_MANAGER', isActive: true },
  { text: 'This employee drives improvements beyond their immediate role.', textHindi: 'यह कर्मचारी अपनी तात्कालिक भूमिका से आगे बढ़कर सुधार लाता/लाती है।', category: 'INITIATIVE', level: 'CLUSTER_MANAGER', isActive: true },
  { text: 'This employee takes ownership of cluster-level initiatives.', textHindi: 'यह कर्मचारी क्लस्टर-स्तरीय पहलों की जिम्मेदारी लेता/लेती है।', category: 'INITIATIVE', level: 'CLUSTER_MANAGER', isActive: true },
  // COMMUNICATION (2)
  { text: 'This employee communicates effectively with cluster leadership.', textHindi: 'यह कर्मचारी क्लस्टर नेतृत्व के साथ प्रभावी ढंग से संवाद करता/करती है।', category: 'COMMUNICATION', level: 'CLUSTER_MANAGER', isActive: true },
  { text: 'This employee escalates issues with clarity and context.', textHindi: 'यह कर्मचारी स्पष्टता और संदर्भ के साथ समस्याओं को आगे बढ़ाता/बढ़ाती है।', category: 'COMMUNICATION', level: 'CLUSTER_MANAGER', isActive: true },
  // INTEGRITY (3)
  { text: 'This employee is reliable and trustworthy at the highest level.', textHindi: 'यह कर्मचारी उच्चतम स्तर पर विश्वसनीय और भरोसेमंद है।', category: 'INTEGRITY', level: 'CLUSTER_MANAGER', isActive: true },
  { text: 'This employee consistently upholds the mission of Akshaya Patra.', textHindi: 'यह कर्मचारी लगातार अक्षय पात्र के मिशन को बनाए रखता/रखती है।', category: 'INTEGRITY', level: 'CLUSTER_MANAGER', isActive: true },
  { text: 'This employee is a role model for ethical conduct in the cluster.', textHindi: 'यह कर्मचारी क्लस्टर में नैतिक आचरण के लिए एक आदर्श है।', category: 'INTEGRITY', level: 'CLUSTER_MANAGER', isActive: true },
];
