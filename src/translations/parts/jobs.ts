/**
 * Arabic strings for the live jobs screen.
 *
 * Every entry is keyed by the exact English source string used in the
 * components. Keep the two identical.
 */

export const jobsAr: Record<string, string> = {
  // Header
  'Real openings, from real job boards':
    'وظائف حقيقية من لوحات توظيف حقيقية',
  'Every vacancy below is a live posting taken from a public job board. The fit shown is calculated from the skills in your own profile.':
    'كل وظيفة أدناه إعلان حي مأخوذ من لوحة توظيف عامة. درجة الملاءمة المعروضة محسوبة من المهارات الموجودة في ملفك الشخصي.',
  'Curated opportunities': 'فرص منتقاة',
  'Learning resources': 'موارد تعليمية',

  // Scope notice
  'These are live openings, not courses and not curated programmes.':
    'هذه فرص مباشرة، وليست دورات ولا برامج منتقاة.',
  'The platform does not edit these postings, so the employer’s own page is where you read the full description and apply. Saving a vacancy here keeps it in your account, and tracking an application records it in your applications.':
    'المنصة لا تحرّر هذه الإعلانات، لذلك فقراءة الوصف الكامل والتقديم تكونان في صفحة صاحب العمل نفسه. حفظ الوظيفة هنا يبقيها في حسابك، وتتبع الطلب يسجّله ضمن طلباتك.',
  'The platform does not edit these postings, and it is not a party to any application.':
    'المنصة لا تحرّر هذه الإعلانات، وليست طرفًا في أي طلب توظيف.',

  // Search
  'Job title, role or skill': 'المسمى الوظيفي أو المهارة',
  'City': 'المدينة',
  'Search jobs': 'ابحث عن وظائف',
  'Posted': 'تاريخ النشر',
  'Remote only': 'عن بُعد فقط',
  'Any time': 'أي وقت',
  'Posted today': 'نُشرت اليوم',
  'Last 3 days': 'آخر 3 أيام',
  'Last 7 days': 'آخر 7 أيام',
  'Last 30 days': 'آخر 30 يومًا',

  // Result list
  'live vacancies': 'وظيفة مباشرة',
  '({count} expired)': '({count} منتهية)',
  'Provider quota left: {count}': 'الحصة المتبقية من المزوّد: {count}',
  'Sort by': 'ترتيب حسب',
  'Best fit first': 'الأعلى ملاءمة أولًا',
  'Newest first': 'الأحدث أولًا',
  'Searching live job boards…': 'جارٍ البحث في لوحات التوظيف…',

  // Errors
  'Jobs & Internships could not be loaded.': 'تعذّر تحميل الوظائف والتدريبات.',
  'The job provider is not configured on this server yet. The owner has to add the provider credential before live vacancies appear here.':
    'لم يتم إعداد مزوّد الوظائف على هذا الخادم بعد. على المالك إضافة بيانات المزوّد قبل ظهور الوظائف المباشرة هنا.',
  'The job provider rejected this server’s credential. The owner has to replace it before live vacancies appear here.':
    'رفض مزوّد الوظائف بيانات اعتماد هذا الخادم. على المالك استبدالها قبل ظهور الوظائف المباشرة هنا.',
  'The provider is limiting how often this server may search. Wait a moment and try again.':
    'المزوّد يحدّ من عدد عمليات البحث التي يمكن للخادم تنفيذها. انتظر قليلًا ثم أعد المحاولة.',
  'The job provider is not answering right now. Try again in a few minutes.':
    'مزوّد الوظائف لا يستجيب حاليًا. أعد المحاولة بعد بضع دقائق.',
  'The job provider took too long to answer. Try again in a few minutes.':
    'استغرق مزوّد الوظائف وقتًا طويلًا للإجابة. أعد المحاولة بعد بضع دقائق.',
  'The job provider sent an answer this server could not read. Try again in a few minutes.':
    'أرسل مزوّد الوظائف إجابة تعذّر على هذا الخادم قراءتها. أعد المحاولة بعد بضع دقائق.',

  // Empty
  'No openings matched this search':
    'لا توجد فرص مطابقة لهذا البحث',
  'Try a broader title, a nearby city, a longer date range, or another country. The provider only returns openings it can currently find.':
    'جرّب مسمىً أعمّ أو مدينة قريبة أو نطاقًا زمنيًا أطول أو بلدًا آخر. لا يُرجع المزوّد إلا الوظائف التي يستطيع العثور عليها حاليًا.',

  // Card
  'Apply on {publisher}': 'قدّم على {publisher}',
  'Apply for this job': 'قدّم لهذه الوظيفة',
  'This posting has expired': 'انتهت صلاحية هذا الإعلان',
  'Posted {date}': 'نُشر في {date}',
  'Closes {date}': 'يُغلق في {date}',
  'No date given by the posting': 'لم يذكر الإعلان أي تاريخ',
  'This posting does not list the skills it asks for, so your fit cannot be compared. Read the description and apply on the employer’s own page.':
    'هذا الإعلان لا يذكر المهارات المطلوبة، لذلك لا يمكن مقارنة ملاءمتك. اقرأ الوصف وقدّم من صفحة صاحب العمل نفسه.',
  'Your fit: {score}%': 'ملاءمتك: {score}%',
  '({matched} of {total} skills in your profile)':
    '({matched} من {total} مهارة في ملفك)',
  'Skills to build': 'مهارات تحتاج إلى بناء',
  '+{count} more': '+{count} أخرى',
  'Salary': 'الراتب',
  'This posting gives no application link.':
    'لا يذكر هذا الإعلان أي رابط للتقديم.',
  'Track application': 'تتبّع الطلب',
  'Tracking…': 'جارٍ التتبّع…',
  'Preparing…': 'جارٍ التحضير…',
  'Tracked in your applications': 'تم تسجيله ضمن طلباتك',
  'This application could not be saved. Try again.':
    'تعذّر حفظ هذا الطلب. حاول مرة أخرى.',

  // Tailored CV
  'Create Tailored CV': 'إنشاء سيرة ذاتية مخصصة',
  'Create a tailored CV for {title}': 'إنشاء سيرة ذاتية مخصصة لوظيفة {title}',
  'This posting gives no description, so there is nothing to tailor a CV from.':
    'لا يذكر هذا الإعلان أي وصف، لذلك لا يوجد ما تُبنى عليه سيرة ذاتية مخصصة.',
  'Opening the CV Studio with this posting…':
    'جارٍ فتح استوديو السيرة الذاتية بهذا الإعلان…',
  'Brought over from Jobs & Internships': 'مُنقول من الوظائف والتدريبات',
  '{title} at {company}': '{title} لدى {company}',
  'The posting has been filled in for you. Edit it here if you want to change anything before the CV is tailored to it.':
    'تم ملء الإعلان نيابةً عنك. عدّله هنا إذا أردت تغيير أي شيء قبل تخصيص السيرة الذاتية له.',

  // Countries
  'Egypt': 'مصر',
  'Saudi Arabia': 'السعودية',
  'United Arab Emirates': 'الإمارات العربية المتحدة',
  'Qatar': 'قطر',
  'Kuwait': 'الكويت',
  'Bahrain': 'البحرين',
  'Oman': 'عُمان',
  'Jordan': 'الأردن',
  'United Kingdom': 'المملكة المتحدة',
  'Germany': 'ألمانيا',
  'United States': 'الولايات المتحدة',

  // Location suggestions
  'Cairo, Egypt': 'القاهرة، مصر',
  'Alexandria, Egypt': 'الإسكندرية، مصر',
  'Giza, Egypt': 'الجيزة، مصر',
  'Riyadh, Saudi Arabia': 'الرياض، السعودية',
  'Dubai, United Arab Emirates': 'دبي، الإمارات العربية المتحدة',
  'Doha, Qatar': 'الدوحة، قطر',
  'Kuwait City, Kuwait': 'مدينة الكويت، الكويت',
  'Manama, Bahrain': 'المنامة، البحرين',
  'Muscat, Oman': 'مسقط، عُمان',
  'Amman, Jordan': 'عمّان، الأردن',

  // LinkedIn Search Entry
  'External Search': 'بحث خارجي',
  'Search verified vacancies directly on LinkedIn matching your target role and keywords.':
    'ابحث عن شواغر موثقة مباشرةً على LinkedIn تطابق مسارك الوظيفي وكلماتك المفتاحية.',
  'Search on LinkedIn': 'ابحث عبر LinkedIn',
  'Search on': 'ابحث عبر',

  // The screen covers jobs and internships together, so its name describes the
  // candidate's need rather than treating a placement as a standard job.
  //
  // "Live" is part of the name because the feed shows the postings that are
  // open right now, and because this screen is the EMPLOYMENT half of the
  // platform: a vacancy or a placement, and nothing that is a course or a
  // volunteering programme.
  'Live Jobs & Internships': 'الوظائف والتدريبات الحالية',
  'Jobs & Internships': 'الوظائف والتدريبات',
  'Full-Time / Part-Time Jobs': 'وظائف بدوام كامل / جزئي',
  'Internships': 'التدريبات',
  'openings': 'فرصة',
  'via {publisher}': 'عبر {publisher}',
  'Every vacancy below is a live posting taken from a public job board — a job or an internship, as the posting itself states. The fit shown is calculated from the skills in your own profile.':
    'كل فرصة أدناه إعلان حيّ مأخوذ من لوحة وظائف عامة — وظيفة أو تدريب، كما ذكر الإعلان نفسه. نسبة الملاءمة المعروضة محسوبة من المهارات الموجودة في ملفك.',
  'The boards behind these postings': 'اللوحات التي جاءت منها هذه الإعلانات',
  'Every posting below was fetched from these boards by the job provider, and each card names the board it came from.':
    'جُلب كل إعلان أدناه من هذه اللوحات بواسطة مزوّد الوظائف، وكل بطاقة تذكر اللوحة التي جاء منها.',
  'Search the boards directly': 'ابحث في اللوحات مباشرة',
  'Search on Wonderin.ai': 'ابحث في Wonderin.ai',
  'Show Senior and Lead roles': 'إظهار الوظائف العليا والقيادية',
  'Based on your profile: {level}': 'بناءً على ملفك الشخصي: {level}',
  'Not set': 'غير محدد',
  'Fit Score': 'درجة الملاءمة',
  'Why this Match Score?': 'لماذا درجة الملاءمة هذه؟',
  'Semantic match': 'التطابق الدلالي',
  'Required skills': 'المهارات المطلوبة',
  'Preferred skills': 'المهارات المفضلة',
  'Matched': 'مطابقة',
  'Still needed': 'لا تزال مطلوبة',
  'None': 'لا شيء',
  'Experience / seniority': 'الخبرة / الأقدمية',
  'Education': 'التعليم',
  'Location / work type': 'الموقع / نوع العمل',

  // Recommendations and comparison
  'Recommended for you': 'مقترحة لك',
  'Finding openings that fit your record…': 'جارٍ البحث عن وظائف تناسب سجلك…',
  'Chosen from your own record': 'اختيرت من سجلّك الخاص',
  '{count} skills, {level}': '{count} مهارة، {level}',
  'level not stated': 'المستوى غير محدد',
  'no skills recorded yet': 'لا توجد مهارات مسجلة بعد',
  'Compare': 'قارن',
  'In the comparison': 'في المقارنة',
  'Compare vacancies': 'مقارنة الوظائف',
  'You meet': 'ما تتقنه',
  'Only this one asks for': 'يطلب هذا الإعلان فقط',
  'Strongest on': 'الأقوى في',
  'No factor stands out on this posting.': 'لا يتفوق هذا الإعلان في أي معيار بشكل واضح.',
  'Every posting here asks for': 'كل إعلان هنا يطلب',
  'Location not given': 'لم يُذكر الموقع',

  // The job discovery dashboard
  'Job discovery': 'استكشاف سوق العمل',
  'Reading the live job market…': 'جارٍ قراءة سوق العمل الحي…',
  'The job market could not be read': 'تعذّرت قراءة سوق العمل',
  'The job market could not be read.': 'تعذّرت قراءة سوق العمل.',
  'Every figure below comes from the openings this platform really read, and states how it was worked out.':
    'كل رقم أدناه مصدره الفرص التي قرأتها المنصة فعليًا، مع بيان طريقة احتسابه.',
  'Boards read': 'اللوحات المقروءة',
  'Boards that failed': 'اللوحات التي تعذّرت',
  'Openings read': 'الفرص المقروءة',
  'How many openings the platform read from the boards above.':
    'عدد الفرص التي قرأتها المنصة من اللوحات المذكورة أعلاه.',
  'Measured against your record': 'مقيسة مقابل سجلك',
  'How many of those could be compared with your own record.':
    'عدد الفرص التي أمكن مقارنتها بسجلك الخاص.',
  'Strong matches': 'تطابقات قوية',
  'How many scored at or above {threshold} out of 100.':
    'عدد الفرص التي حصلت على {threshold} من 100 أو أكثر.',
  'Remote share': 'نسبة الوظائف عن بُعد',
  '{percent}%': '{percent}%',
  'Not stated': 'غير محدد',
  '{remote} of the {of} openings that said whether they are remote.':
    '{remote} من أصل {of} فرصة ذكرت إن كانت عن بُعد.',
  'No opening said whether it is remote, so no share can be worked out.':
    'لم تذكر أي فرصة إن كانت عن بُعد، لذلك لا يمكن احتساب النسبة.',
  'What the market asks for that your record does not show':
    'ما يطلبه السوق ولا يظهر في سجلك',
  'Each skill is counted once per opening that asks for it, across the openings read.':
    'تُحتسب كل مهارة مرة واحدة لكل فرصة تطلبها، عبر الفرص المقروءة.',
  'No opening asked for a skill your record does not show.':
    'لم تطلب أي فرصة مهارة لا تظهر في سجلك.',
  'Work on these in the Skills Centre': 'اعمل على هذه في مركز المهارات',
  'What the market asks for that your record already shows':
    'ما يطلبه السوق ويظهر في سجلك بالفعل',
  'No opening asked for a skill your record shows yet.':
    'لم تطلب أي فرصة مهارة تظهر في سجلك بعد.',
  'in {count} openings': 'في {count} فرصة',
  'Openings per board': 'الفرص حسب اللوحة',
  'Openings per level': 'الفرص حسب المستوى',
  'Openings per employment type': 'الفرص حسب نوع العمل',
  'The openings that ask for the most you do not have':
    'الفرص التي تطلب أكثر ما لا تملكه',
  'skills': 'مهارة',
};
