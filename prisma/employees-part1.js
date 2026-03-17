// Employee data Part 1 — compact pipe-delimited
// Format: empCode|name|department|designation|role|password
const R = { E: 'EMPLOYEE', S: 'SUPERVISOR', B: 'BRANCH_MANAGER', C: 'CLUSTER_MANAGER', A: 'ADMIN' };
const raw = `1801157|Aashish Arora|Procurement|Officer|E|Aashish_57
1801958|AJAY DHANKA|Distribution|Driver|E|Ajay_58
1802316|AJAY KUMAR|Production|Helper|E|Ajay_16
1802342|AJAY KUMAR RAIGAR|Production|Helper|E|Ajay_42
1800022|AMIT KESHWA|Operations|General Manager|C|Amit_22
1001048|ANAMIKA SHARMA|India One Marketing|Deputy Manager|E|Anamika_48
1801541|ANIL KUMAR SINDHI|Finance|Deputy Manager|E|Anil_41
1802037|ANITA DEVI|Production|Helper|E|Anita_37
1802132|ANITA DEVI|Production|Helper|E|Anita_32
1802327|ANITA VERMA|Production|Helper|E|Anita_27
1801793|ANJANI|Production|Helper|E|Anjani_93
1802259|ANKIT SAINI|Stores|Executive|E|Ankit_59
1802382|ANKUSH POTTER|Security|Security|E|Ankush_82
2000448|ANSAR HUSAIN|Maintenance|Electrician|E|Ansar_48
1801994|ARJUN LAL MAHAWAR|Production|Helper|E|Arjun_94
1801990|ARTI DEVI|Production|Helper|E|Arti_90
1801920|ASHOK|Maintenance|Welder - Maintenance|E|Ashok_20
1801264|ASHOK KUMAR DHANKA|Distribution|Driver|E|Ashok_64
1800346|ASHOK KUMAR YADAV|Distribution|Officer|E|Ashok_46
1802010|ASHOK KUMAR YADAV|Distribution|Supervisor - Distribution|S|Ashok_10
1802113|ASHOK YOGI|Distribution|Driver|E|Ashok_13
1802380|AVINASH|Production|Helper|E|Avinash_80
1801869|BABALI DEVI|Production|Helper|E|Babali_69
1801822|BABLU SHARMA|Production|Helper|E|Bablu_22
1801265|BABU LAL GURJAR|Distribution|Driver|E|Babu_65
1801637|BABU LAL MEENA|Distribution|Executive|E|Babu_37
1800128|BABURI DEVI MORYA|Production|Helper|E|Baburi_28
1801205|BAJRANG SINGH|Production|Helper|E|Bajrang_05
1802306|BALVEER SINGH|Production|Helper|E|Balveer_06
1801206|BALWEER SINGH|Production|Helper|E|Balweer_06
1800104|BARDI DEVI PRAJPAT|Production|Helper|E|Bardi_04
1801208|BHAGWAN SHAY BAIRWA|Production|Helper|E|Bhagwan_08
1801765|BHAGWATI DEVI|Production|Helper|E|Bhagwati_65
1801445|Bharat Bhushan Arora|Administration|Executive|E|Bharat_45
1801726|BHARAT KUMAR YADAV|Information Technology|Executive|E|Bharat_26
1802215|BHAWANI SINGH|Quality|Regional Manager|E|Bhawani_15
1800463|BHOJRAJ SINGH|Production|Helper|E|Bhojraj_63
1801131|Bhupendra Singh Rathore|Security|Security|E|Bhupendra_31
1802348|BHUROBAI|Production|Helper|E|Bhurobai_48
1801267|BIJENDRA SHARMA|Distribution|Driver|E|Bijendra_67
1802286|CHANDAN SINGH|Production|Helper - Production|E|Chandan_86
1800996|CHANDESHWAR THAKUR|Production|Operator|E|Chandeshwar_96
1802330|CHANDRASHEKHAR|Distribution|Supervisor|S|Chandrashekhar_30
1802045|CHARAT KUMAR DHOBI|Production|Helper|E|Charat_45
5100029|CHETAN SINGH BHATI|Human Resources|Senior Executive - HR|E|Chetan_29
1802130|CHHOTI DEVI|Production|Helper|E|Chhoti_30
1802129|CHHOTURAM GUJAR|Production|Helper|E|Chhoturam_29
1800122|CHOTA DEVI REGAR|Production|Helper|E|Chota_22
1801155|Dashrath kumar|Production|Assistant Manager|E|Dashrath_55
1802087|DASHRATH SINGH YADAV|Production|Assistant Supervisor|S|Dashrath_87
1801270|DAYA CHAND VERMA|Distribution|Driver|E|Daya_70
1800314|DAYARAM RAM GURJAR|Production|Helper|E|Dayaram_14
1802376|DEEPAK MEENA|Production|Helper|E|Deepak_76
1802053|DEEPAK MUNDOTIA|Human Resources|Executive|E|Deepak_53
1801827|DEEPAK SAINI|Production|Helper|E|Deepak_27
1802078|DESH VANDHU|Production|Assistant Supervisor|S|Desh_78
1802379|DHANRAJ BHEEL|Distribution|Driver|E|Dhanraj_79
1800390|DHANRAJ JAT|Production|COOK|E|Dhanraj_90
1800086|DHARAM RAJ SAINI|Production|Helper|E|Dharam_86
1801271|DHARMENDRA KUMAR|Distribution|Driver|E|Dharmendra_71
1801654|Dheeraj Yadav|Distribution|Driver|E|Dheeraj_54
1802357|DILIP KUMAR MEENA|Production|Helper|E|Dilip_57
1801772|DILIP KUMAR PANDA|Maintenance|Officer|E|Dilip_72
1801272|DINESH KUMAR BALAI|Distribution|Driver|E|Dinesh_72
1800487|DINESH KUMAR MALI|Production|Helper|E|Dinesh_87
1802238|GAJANAND BAIRWA|Maintenance|Plumber|E|Gajanand_38
1802373|GAJANAND CHOUDHARY|Distribution|Driver|E|Gajanand_73
1801273|GAJANAND RAIGAR|Distribution|Driver|E|Gajanand_73
1802241|GANESH NARAYAN MEENA|Production|Helper|E|Ganesh_41
1800001|GAURI SHANKAR SAIN|Maintenance|Executive|E|Gauri_01
1800127|GEETA DEVI|Production|Helper|E|Geeta_27
1801761|GIRRAJ VERMA|Production|Helper|E|Girraj_61
1801132|Gopal Singh|Security|Security|E|Gopal_32
1801274|GOPAL SINGH|Distribution|Driver|E|Gopal_74
1802295|GOVIND SAIN|Production|Helper - Production|E|Govind_95
1801926|GYAN KANWAR|Production|Helper|E|Gyan_26
1801213|GYARSHI LAL MORYA|Production|Helper|E|Gyarshi_13
1801758|HANSRAJ MEENA|Distribution|Driver|E|Hansraj_58
1802320|HANSRAJ MEENA|Production|Helper|E|Hansraj_20
1802344|HANSRAJ YOGI|Security|Supervisor|S|Hansraj_44
1800258|HANUMAN CHAUDHRAY|Production|Helper|E|Hanuman_58
1802340|HANUMAN NARUKA|Production|Helper|E|Hanuman_40
1802354|HARESH KUMAR KANSAL|Production|Helper|E|Haresh_54
1802064|HARPHOOL MEENA|Production|Helper|E|Harphool_64
1801215|HEERA LAL|Production|Helper|E|Heera_15
1802296|HEERA NAND MAURYA|Production|Helper - Production|E|Heera_96
1802314|HIMANSHU CHOPRA|Production|Helper|E|Himanshu_14
1801279|HUKAM CHAND JANGID|Distribution|Driver|E|Hukam_79
1802029|JAGADISH NARAYAN MEENA|Distribution|Driver|E|Jagadish_29
1801105|Jagdish Prasad Meena|Production|Executive|E|Jagdish_05
1802153|JAGRAM MEENA|Production|Helper|E|Jagram_53
1800056|JANSHI RAM MEENA|Production|COOK|E|Janshi_56
1802179|JASWANT SINGH TOMER|Administration|Office Boy|E|Jaswant_79
1802370|JAYSINGH|Distribution|Driver|E|Jaysingh_70
1801037|Jitendra kumar Parashar|Administration|Executive|E|Jitendra_37
1801219|JITENDRA RAIGAR|Production|Helper|E|Jitendra_19
1802350|JITENDRA SINGH|Distribution|Driver|E|Jitendra_50
1801406|Jitendra Singh Gurjar|Distribution|Driver|E|Jitendra_06
1801220|JYANTI PRASAD SHARMA|Production|Helper|E|Jyanti_20
1801221|KAILASH CHAND|Production|Helper|E|Kailash_21
1801872|KAILASH CHAND|Production|Helper|E|Kailash_72
1800169|KAILASHI DEVI|Production|Helper|E|Kailashi_69
1801781|KALU RAM RAIGAR|Production|Helper|E|Kalu_81
1801167|Kamal Kishore Sharma|Production|Vessel Washing|E|Kamal_67
1802381|KAMAL KUMAR BAIRWA|Security|Security|E|Kamal_81
1801658|Kamal Singh|Production|Helper|E|Kamal_58
1801896|KAMAL SINGH MAWARI|Human Resources|Executive|E|Kamal_96
1801368|Kamlesh Bunkar|Production|Helper|E|Kamlesh_68
1801776|KAMLESH DEVI|Production|Helper|E|Kamlesh_76
1801662|KAMLESH KUMAR SHARMA|Operations|Executive|E|Kamlesh_62
1801742|KAN SINGH|Distribution|Driver|E|Kan_42
1802279|KANA RAM MEENA|Distribution|Driver|E|Kana_79
1802135|KANA RAM YOGI|Distribution|Driver|E|Kana_35
1802258|KAPIL MEENA|Production|Helper|E|Kapil_58
1802333|KARAN NARUKA|Production|Helper|E|Karan_33
1801745|KAVITA BALAI|Production|Helper|E|Kavita_45
1802159|KAVITA SISODIYA|Production|Helper|E|Kavita_59
1802334|KHEMRAJ MEENA|Production|Helper|E|Khemraj_34
1802192|KIRAN DEVI|Production|Helper|E|Kiran_92
1801225|KULDEEP SINGH RAJAWAT|Production|Helper|E|Kuldeep_25
1801226|KULDEEP VERMA|Production|Helper|E|Kuldeep_26
1801227|LAL CHAND MORIYA|Production|Helper|E|Lal_27
1800094|LALA RAM MEENA|Production|Helper|E|Lala_94
1802374|LALIT MUNDRA|Production|Helper|E|Lalit_74
1801321|Lavleen Gurjar|Distribution|Driver|E|Lavleen_21
1802142|LAXMI KANWAR RAJAWAT|Security|Security|E|Laxmi_42
1802337|LOKESH KUMAR MEENA|Production|Helper|E|Lokesh_37
1802249|MADAN SINGH|Distribution|Driver|E|Madan_49
1801129|Maharaj Singh Gurjar|Security|Security|E|Maharaj_29
1801171|Mahendra Singh Boran|Security|Security|E|Mahendra_71
1800250|MAHENDRA YADAV|Procurement|Officer|E|Mahendra_50
1801416|Malu Ram|Production|Helper|E|Malu_16
1801361|Mamraj Raiger|Production|Supervisior - Production|S|Mamraj_61
1802006|MAMTA|Production|Helper-Production|E|Mamta_06
1801363|Mamta Devi|Production|Helper|E|Mamta_63
1802232|MAMTA DEVI|Production|Helper|E|Mamta_32
1802222|MANISH KUMAR BAIRWA|Production|Helper|E|Manish_22
1801130|Manish Kumar Jaiman|Security|Officer|E|Manish_30
1802299|MANJU|Production|Helper|E|Manju_99
1800133|MANJU DEVI|Production|Helper|E|Manju_33
1800106|MANJU DEVI MORYA|Production|Helper|E|Manju_06
1800029|MANOJ KUMAR JAIN|Procurement|Senior Officer|E|Manoj_29
1802217|MANOJ KUMAR MEENA|Production|Helper|E|Manoj_17
1801587|MANPHOLI DEVI|Production|Helper|E|Manpholi_87
1802385|MANSHA RAM|Production|Helper|E|Mansha_85
1801986|MANSINGH MEENA|Maintenance|Electrician|E|Mansingh_86
1800221|MAYA DEVI|Production|Helper|E|Maya_21
1800282|MEENA MISHRA|Production|Helper|E|Meena_82
1800171|MEERA DEVI|Production|Helper|E|Meera_71
1800989|MEERA DEVI|Production|Helper|E|Meera_89`;
module.exports = raw.trim().split('\n').map(l => {
  const [empCode, name, department, designation, role, password] = l.split('|');
  return { empCode, name, department, designation, role: R[role], password };
});
