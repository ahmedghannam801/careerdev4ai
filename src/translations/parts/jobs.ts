/**
 * Arabic strings for the live jobs screen.
 *
 * Every entry is keyed by the exact English source string used in the
 * components. Keep the two identical.
 */

export const jobsAr: Record<string, string> = {
  // Header
  'Live Jobs': 'وظائف مباشرة',
  'Real openings, from real job boards':
    'وظائف حقيقية من لوحات توظيف حقيقية',
  'Every vacancy below is a live posting taken from a public job board. The fit shown is calculated from the skills in your own profile.':
    'كل وظيفة أدناه إعلان حي مأخوذ من لوحة توظيف عامة. درجة الملاءمة المعروضة محسوبة من المهارات الموجودة في ملفك الشخصي.',
  'Curated opportunities': 'فرص منتقاة',
  'Learning resources': 'موارد تعليمية',

  // Scope notice
  'These are live vacancies, not courses and not curated programmes.':
    'هذه وظائف مباشرة، وليست دورات ولا برامج منتقاة.',
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
  'Live jobs could not be loaded.': 'تعذّر تحميل الوظائف المباشرة.',
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
  'No live vacancies matched this search':
    'لا توجد وظائف مباشرة مطابقة لهذا البحث',
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
  'Brought over from Live Jobs': 'مُنقول من الوظائف المباشرة',
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
};
