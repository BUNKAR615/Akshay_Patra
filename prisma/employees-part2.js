// Employee data Part 2 — compact pipe-delimited
// Format: empCode|name|department|designation|role|password
const R = { E: 'EMPLOYEE', S: 'SUPERVISOR', B: 'BRANCH_MANAGER', C: 'CLUSTER_MANAGER', A: 'ADMIN' };
const raw = `1802378|MEHUL KUMAR SONI|Production|Helper|E|Mehul_78
1801232|MOHAR SINGH GURJAR|Production|Helper|E|Mohar_32
1802361|MOHIT VERMA|Production|Helper|E|Mohit_61
1802284|MONU VERMA|Production|Helper|E|Monu_84
1801180|Mukesh|Production|Helper|E|Mukesh_80
1801919|MUKESH JANGID|Production|Helper|E|Mukesh_19
1802114|MUKESH KUMAR MALI|Distribution|Driver|E|Mukesh_14
1801284|MUKESH KUMAR MEENA|Distribution|Driver|E|Mukesh_84
1801841|MUKESH KUMAR YADAV|Production|Helper|E|Mukesh_41
1800347|MUKESH SHARMA|Procurement|Officer|E|Mukesh_47
1801425|Mukesh Sharma|Security|Security|E|Mukesh_25
1801198|Mukesh Verma|Production|Helper|E|Mukesh_98
1802253|MUKUT BIHARI SHARMA|Production|Helper|E|Mukut_53
1802093|NAGENDRA JATAV|Security|Security|E|Nagendra_93
1800059|NAND KISHOR JAT|Administration|Office Boy|E|Nand_59
1800144|NARBADA DEVI|Production|Helper|E|Narbada_44
1802075|NARENDRA KUMAR|Production|Helper|E|Narendra_75
1800040|NARESH BANSAL|Procurement|Officer|E|Naresh_40
1800168|NATHI DEVI|Production|Helper|E|Nathi_68
1802040|NATHU|Production|Helper|E|Nathu_40
1802288|NEPAL SINGH SONDIYA|Production|Helper - Production|E|Nepal_88
1802387|NIKITA MEENA|Production|Helper|E|Nikita_87
1802145|NITU YOGI|Production|Helper|E|Nitu_45
1800031|OM PRAKASH SHARMA|Distribution|Supervisor|S|Om_31
1801862|OMPRAKASH|Production|Helper|E|Omprakash_62
1801236|OMPRAKSH GURJAR|Production|Helper|E|Ompraksh_36
1801716|PANKAJ BHARDWAJ|Human Resources|Senior Executive|E|Pankaj_16
1801079|Pappu Lal|Production|Helper|E|Pappu_79
1800557|PARMESHWAR MEENA|Production|Helper|E|Parmeshwar_57
1801187|Pinki Jain|Production|Helper|E|Pinki_87
1802372|PINTU MEENA|Distribution|Driver|E|Pintu_72
1801122|Pooran Mal Meena|Security|Security|E|Pooran_22
1801237|PRABHU NARAYAN MEENA|Production|Helper|E|Prabhu_37
1800060|PRADHAN GURJAR|Production|Helper|E|Pradhan_60
1801238|PRAKASH CHAND MEENA|Production|Helper|E|Prakash_38
1800010|PRAKASH CHAND VIJAY|Finance|Deputy General Manager|E|Prakash_10
1802366|Pramod Kumar Sharma|Finance|Assistant Manager|E|Pramod_66
1800544|PRAVEEN SHARMA|Distribution|Supervisor|S|Praveen_44
1800979|PREM DEVI|Production|Helper|E|Prem_79
1800134|PREM DEVI REGAR|Production|Helper|E|Prem_34
1801748|PREMLATA|Production|Helper|E|Premlata_48
1802188|PUKHRAJ JWALA|Production|Helper|E|Pukhraj_88
1801961|PURANMAL|Production|Helper|E|Puranmal_61
1802328|PUSHPENDRA MEENA|Production|Helper|E|Pushpendra_28
1801791|PUSHPENDRA YADAV|Distribution|Supervisor|S|Pushpendra_91
1800135|RADHA DEVI BALAI|Production|Helper|E|Radha_35
1800160|RADHA SHARMA|Production|Helper|E|Radha_60
1801240|RADHESHYAM|Production|Helper|E|Radheshyam_40
1801362|Rahul Singh CHAUHAN|Distribution|Supervisor - Distribution|S|Rahul_62
1800110|RAJANTI DEVI MORYA|Production|Helper|E|Rajanti_10
1801241|RAJENDRA JAJORIYA|Production|Helper|E|Rajendra_41
1801840|RAJENDRA KUMAR MEENA|Production|Helper|E|Rajendra_40
1801242|RAJENDRA LAKHERA|Production|Helper|E|Rajendra_42
1802324|RAJENDRA PRASAD MEENA|Production|Helper|E|Rajendra_24
1800003|Rajesh Kaushik|Human Resources|AGM - Human Resources|E|Rajesh_03
1801305|RAJESH KUMAR MEENA|Distribution|Executive|E|Rajesh_05
1800012|Rajesh Kumar Sharma|Procurement|Assistant General Manager|E|Rajesh_12
1802384|RAJU DAS VAISHNAV|Production|Helper|E|Raju_84
1801243|RAJU LAL|Production|Helper|E|Raju_43
1801316|Raju Meena|Production|Supervisor|S|Raju_16
1801767|RAJU TANWAR|Production|Helper|E|Raju_67
1802351|RAJU VERMA|Distribution|Driver|E|Raju_51
1802331|RAKESH KUMAR BUNKAR|Production|Helper|E|Rakesh_31
1800252|RAKESH KUMAR MEENA|Distribution|Supervisor|S|Rakesh_52
1801288|RAKESH KUMAR MEENA|Distribution|Driver|E|Rakesh_88
1800095|RAKESH VIJAY|Procurement|Officer|E|Rakesh_95
1801246|RAM DAYAL SHARMA|Production|Helper|E|Ram_46
1801248|RAMAVATAR MEENA|Production|Helper|E|Ramavatar_48
1801754|RAMAVTAR|Distribution|Driver|E|Ramavtar_54
1801078|Rambati Devi|Production|Helper|E|Rambati_78
1802183|RAMESH CHAND|Distribution|Driver|E|Ramesh_83
1800274|RAMESH CHAND SHARMA|Distribution|Supervisor|S|Ramesh_74
1801391|Ramesh Kumar Mali|Production|Helper|E|Ramesh_91
1801912|RAMESHCHAND|Production|Helper|E|Rameshchand_12
1802230|RAMESHWAR DAYAL|Human Resources|Executive|E|Rameshwar_30
1802353|RAMESHWAR SAINI|Stores|Executive|E|Rameshwar_53
1801463|RAMNIWAS CHOUDHARY|Quality|Officer - Quality|E|Ramniwas_63
1802049|RAMOTAR RANA|Production|Helper|E|Ramotar_49
1802059|RAMPRASAD MEENA|Production|Helper|E|Ramprasad_59
1801607|RAMRAJ MEENA|Production|COOK|E|Ramraj_07
1801591|RANJIT YOGI|Distribution|Driver|E|Ranjit_91
1800050|RATAN LAL DARJI|Production|Helper|E|Ratan_50
1801883|RATAN LAL MEENA|Production|Supervisor|S|Ratan_83
1801642|RATAN SINGH|Production|Helper|E|Ratan_42
1800120|RATNA DEVI|Production|Helper|E|Ratna_20
1802115|RAVI THAKUR|Finance|Executive|E|Ravi_15
1802371|RAVINDRA KUMAR|Production|Helper|E|Ravindra_71
1802289|RAVINDRA KUMAR MEENA|Production|Helper - Production|E|Ravindra_89
1801664|RAVINDRA SHARMA|Distribution|Supervisor|S|Ravindra_64
1802264|REENA DEVI|Production|Helper|E|Reena_64
1800153|REETA DEVI|Production|Helper|E|Reeta_53
1802147|REKHA RAWAT|Production|Helper|E|Rekha_47
1801735|REWAT SINGH|Production|Operator|E|Rewat_35
1801952|RINKU CHOPRA|Production|Helper|E|Rinku_52
1802244|RINKU MEENA|Production|Helper|E|Rinku_44
1802024|RINKU MORYA|Distribution|Driver|E|Rinku_24
1800349|RISHPAL KUMAWAT|Information Technology|Assistant Manager|A|Rishpal_49
1800082|RODU RAM MEENA|Production|Helper|E|Rodu_82
1802363|ROHAN KUMAR CHOPRA|Production|Helper|E|Rohan_63
1802009|ROHITASH KUMAR REDDY|Production|Helper-Production|E|Rohitash_09
1801252|ROOPNARAYAN MOURYA|Production|Helper|E|Roopnarayan_52
1801291|ROSHAN LAL|Production|Helper|E|Roshan_91
1801481|Roshan Sharma|Maintenance|Fitter|E|Roshan_81
1802152|SACHIN RAISWAL|Production|Helper|E|Sachin_52
1802386|SAGAR MAL GOME|Distribution|Driver|E|Sagar_86
1802355|SAHIL TANVAR|Production|Helper|E|Sahil_55
1802073|SAMAY SINGH|Production|Helper|E|Samay_73
1802304|SANDEEP SAINI|Quality|Executive|E|Sandeep_04
1801253|SANJAY|Production|Helper|E|Sanjay_53
1802332|SANJAY KUMAR SAINI|Process Excellence and CI|Officer|E|Sanjay_32
1801378|Sanjay Sharma|Distribution|Supervisor - Distribution|S|Sanjay_78
1802343|SANJAY SHARMA|Distribution|Driver|E|Sanjay_43
1800011|SANT KUMAR SHARMA|Operations|Manager|B|Sant_11
1801347|Santosh Devi|Stores|Helper|E|Santosh_47
1801544|SANTOSH DEVI|Production|Helper|E|Santosh_44
1802056|SANTOSH KUMAR|Distribution|Driver|E|Santosh_56
1802141|SANTRA|Production|Helper|E|Santra_41
1800137|SANTRA DEVI MAHAWAR|Production|Helper|E|Santra_37
1800112|SANTRA DEVI REIGER|Production|Helper|E|Santra_12
1801747|SANTRA PRAJAPAT|Production|Helper|E|Santra_47
1802143|SARVAGYA KUMAR SHARMA|Distribution|Executive|E|Sarvagya_43
1802240|SATISH TIWARI|Production|Operator|E|Satish_40
1801254|SATYA NARAYAN|Production|Helper|E|Satya_54
1802233|SAVITA BALAI|Production|Helper|E|Savita_33
1802099|SAVITA DEVI|Production|Helper|E|Savita_99
1801293|SAYAR LAL SHARMA|Distribution|Driver|E|Sayar_93
1802090|SEEMA DEVI|Production|Helper|E|Seema_90
1802377|SEEMA DEVI|Production|Helper|E|Seema_77
1801878|SEEMA KANWAR|Production|Helper|E|Seema_78
1800496|SEETA|Production|Helper|E|Seeta_96
1800113|SHAKUNTLA DEVI SHARMA|Production|Helper|E|Shakuntla_13
1802119|SHANKAR LAL MEENA|Production|Helper|E|Shankar_19
1801873|SHANKAR SINGH|Production|Operator|E|Shankar_73
1801888|SHANKARA NAND|Security|Security|E|Shankara_88
1800115|SHANTI DEVI MORYA|Production|Helper|E|Shanti_15
1801846|SHASHI DEVI SHARMA|Production|Helper|E|Shashi_46
1802339|SHEKHAR BAIRWA|Production|Helper|E|Shekhar_39
1802269|SHIMLA SHARMA|Production|Helper|E|Shimla_69
1802375|SHIVKESH MEENA|Production|Helper|E|Shivkesh_75
1801053|Shivraj Gurjar|Production|COOK|E|Shivraj_53
1801671|SHRI NARAYAN BAIRWA|Security|Security|E|Shri_71
1802021|SHYAMSUNDAR BHAT|Maintenance|Operator|E|Shyamsundar_21
1802057|SHYOJI LAL MEENA|Production|Helper|E|Shyoji_57
1802176|SOHAN LAL|Distribution|Driver|E|Sohan_76
1802118|SONIYA DEVI|Production|Helper|E|Soniya_18
1801780|SONU|Production|Helper|E|Sonu_80
1802360|SONU|Production|Helper|E|Sonu_60
1801892|SONU BUNKER|Production|Helper|E|Sonu_92
1802025|SONU DHANAKA|Production|Helper|E|Sonu_25
1802362|SONU JATAV|Security|Security|E|Sonu_62
1802338|SONU KUMAR MEENA|Stores|Helper|E|Sonu_38
1800006|SUBHASH CHAND GAUR|Stores|Deputy Manager|E|Subhash_06
1800978|SUKHIYA DEVI|Production|Helper|E|Sukhiya_78
1801534|SUKHRAM|Production|Helper|E|Sukhram_34
1801170|Sumit Sharma|Finance|Executive|E|Sumit_70
1800154|SUMITRA DEVI|Production|Helper|E|Sumitra_54
1800181|SUNIL AGARWAL|Maintenance|Electrician|E|Sunil_81
1801656|SUNIL KUMAR MOURYA|Production|Helper|E|Sunil_56
1801947|SUNIL MEENA|Production|Helper|E|Sunil_47
1802365|SUNIL MEGHWAL|Production|Helper|E|Sunil_65
1801924|SUNITA DEVI|Production|Helper|E|Sunita_24
1800117|SUNITA DEVI MORYA|Production|Helper|E|Sunita_17
1802069|SUNNY MAURYA|Production|Helper|E|Sunny_69
1801366|Suraj Mal Gurjar|Distribution|Driver|E|Suraj_66
1801728|SURENDER SINGH|Production|Helper|E|Surender_28
1802352|SURESH VERMA|Distribution|Driver|E|Suresh_52
1801768|SURGYAN|Production|Helper|E|Surgyan_68
1800361|SUSHEEL KUMAR MAHAWAR|Distribution|Officer|E|Susheel_61
1801746|SUSHILA DEVI|Production|Helper|E|Sushila_46
1801025|SUSHILA PRAJAPAT|Production|Helper|E|Sushila_25
1800046|SYOJI RAM JAT|Production|Supervisor|S|Syoji_46
1802383|TARACHAND BHEEL|Production|Helper|E|Tarachand_83
1802250|TEJA RAM GURJAR|Distribution|Driver|E|Teja_50
1801259|TUFAN MEENA|Production|Helper|E|Tufan_59
1800143|UGANTI DEVI|Production|Helper|E|Uganti_43
1802254|UMESH|Production|Helper|E|Umesh_54
1801298|UMMED SINGH|Distribution|Driver|E|Ummed_98
1801598|VEDPRAKASH MEENA|Distribution|Supervisor|S|Vedprakash_98
1802287|VIJAY PAL MEENA|Production|Helper - Production|E|Vijay_87
1801759|VIJAY SHANKAR MEENA|Distribution|Driver|E|Vijay_59
1801427|Vijay Vikram Singh|Production|Operator|E|Vijay_27
1802345|VIKAS KUMAR MEENA|Production|Helper|E|Vikas_45
1801938|VIKAS MEENA|Production|Helper|E|Vikas_38
1802347|VIKASH SINGH|Maintenance|Operator|E|Vikash_47
1800079|VIMAL PRAKASH SHARMA|Finance|Senior Executive|E|Vimal_79
1801545|VIMALA DEVI|Production|Helper|E|Vimala_45
1801853|VINOD KUMAR MEENA|Production|Helper|E|Vinod_53
1801260|VINOD RAIGAR|Production|Helper|E|Vinod_60
1800474|VIRENDRA KUMAR|Production|Helper|E|Virendra_74
1802283|VISHAL SHARMA|Distribution|Assistant Supervisor|S|Vishal_83
1802359|VISHANU YOGI|Distribution|Driver|E|Vishanu_59
1801299|YADRAM MEENA|Distribution|Driver|E|Yadram_99
1802281|YADRAM MEENA|Production|Helper|E|Yadram_81
1802369|YASHPAL JATAV|Production|Helper|E|Yashpal_69
1801442|Yogesh Dadhich|Finance|Senior Executive - Accounts|E|Yogesh_42`;
module.exports = raw.trim().split('\n').map(l => {
  const [empCode, name, department, designation, role, password] = l.split('|');
  return { empCode, name, department, designation, role: R[role], password };
});
