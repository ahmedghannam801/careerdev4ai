/**
 * Arabic strings for the public landing page.
 *
 * Every entry is keyed by the exact English source string used in the
 * components. Keep the two identical.
 *
 * The public page carries the product's first impression, so it is
 * translated in full rather than left to fall back to English.
 */

export const landingAr: Record<string, string> = {
  // ---- Interactive product preview ------------------------------------
  'Live preview': 'معاينة حية',
  'Pick a role to preview': 'اختر وظيفة لمعاينتها',
  'Product preview': 'معاينة المنتج',
  'Phases': 'المراحل',
  'Open gaps': 'فجوات مفتوحة',
  'Requirements this role opens first, compared against no recorded skills yet.':
    'المتطلبات التي تبدأ بها هذه الوظيفة، مقارنةً بمهارات لم تُسجَّل بعد.',
  'critical': 'حرجة',
  'Next best action': 'أفضل خطوة تالية',
  'This role needs no closing tasks yet.': 'لا تحتاج هذه الوظيفة إلى مهام إغلاق حاليًا.',
  'The same reason is attached to every suggestion: it names the record that produced it, so you can check the recommendation instead of trusting it.':
    'كل اقتراح يحمل سببه: يذكر السجل الذي أنتجه، لتتحقق من التوصية بنفسك بدلًا من الوثوق بها.',
  'Generated live by the CareerDev4AI planning engine from the role catalogue — not a mock-up.':
    'يُنتَج مباشرةً بواسطة محرّك التخطيط في CareerDev4AI من دليل الوظائف — وليس نموذجًا توضيحيًا.',

  // ---- Features --------------------------------------------------------
  'Career Intelligence': 'الذكاء المهني',
  'CV Studio': 'استوديو السيرة الذاتية',
  'Job Matching': 'مطابقة الوظائف',
  'Career Roadmaps': 'خارطات المسار المهني',
  'Learning': 'التعلّم',
  'Projects': 'المشاريع',
  'Portfolio': 'معرض الأعمال',
  'Application Tracking': 'متابعة الطلبات',
  'Interview Preparation': 'التحضير للمقابلات',
  'AI Career Mentor': 'المرشد المهني الذكي',
  'Career Analysis': 'تحليل المسار المهني',
  'Roadmap': 'خارطة الطريق',
  'Skill gaps': 'فجوات المهارات',
  'My Profile': 'ملفي الشخصي',
  'Applications': 'الطلبات',
  'Interviews': 'المقابلات',
  'AI Copilot': 'المساعد الذكي',
  'AI-assisted': 'مدعوم بالذكاء الاصطناعي',

  'A readiness score computed from your own records, with the gaps it is based on shown next to it.':
    'درجة جاهزية محسوبة من سجلاتك أنت، مع عرض الفجوات التي بُنيت عليها إلى جانبها.',
  'Parse your CV, work on it, and produce role-targeted versions without ever overwriting the original.':
    'حلّل سيرتك الذاتية، وحرّرها، وأنتج نسخًا موجّهة للوظيفة من دون الكتابة فوق الأصل أبدًا.',
  'Paste a job description and see the match score, the evidence behind it, and what is still missing.':
    'الصق وصف الوظيفة وشاهد درجة المطابقة والأدلة التي تقف خلفها وما يبقى ناقصًا.',
  'A phased plan of real tasks, with prerequisites, hour estimates and the reason each task is in your plan.':
    'خطة على مراحل من مهام حقيقية، مع المتطلبات السابقة وتقديرات الساعات وسبب وجود كل مهمة في خطتك.',
  'A curated catalogue filtered to the gaps your target role actually has, with the source shown for each one.':
    'دليل مُنتقى يُرشَّح وفق الفجوات التي تتطلبها وظيفتك المستهدفة فعلًا، مع إظهار المصدر لكل عنصر.',
  'Turn a skill into finished work, submit the deliverable and get a structured evaluation you can point at.':
    'حوّل مهارة إلى عمل منجز، وسلّم المخرجات واحصل على تقييم منظّم يمكنك الإشارة إليه.',
  'A shareable profile that carries your projects, verified skills and the evidence behind them.':
    'ملف شخصي قابل للمشاركة يحمل مشاريعك ومهاراتك الموثّقة والأدلة التي تقف خلفها.',
  'Every application with its tailored CV, cover letter, stage, follow-up date and full history.':
    'كل طلب مع سيرته الذاتية المعدّلة ورسالة التقديم ومرحلة الطلب وتاريخ المتابعة وسجلّه الكامل.',
  'Role-specific questions, mock interviews, a structured evaluation and what to work on next.':
    'أسئلة خاصة بالوظيفة، ومقابلات تجريبية، وتقييم منظّم، وما ينبغي أن تعمل عليه بعد ذلك.',
  'An assistant that answers from your verified records and shows you the evidence behind each answer.':
    'مساعد يجيب من سجلاتك الموثّقة ويعرض لك الأدلة التي تقف خلف كل إجابة.',

  // ---- Trust and transparency -----------------------------------------
  'How career readiness is calculated': 'كيف تُحتسب درجة الجاهزية المهنية',
  'How AI recommendations work': 'كيف تعمل توصيات الذكاء الاصطناعي',
  'How your data is handled': 'كيف تُعالَج بياناتك',
  'What the platform cannot guarantee': 'ما لا يمكن للمنصة ضمانه',

  'Readiness is a measured comparison between the skills a role requires and the skills you have actually recorded, weighted by which requirements are core and which are preferred. It is a score against a benchmark, not a prediction of how an interview will go.':
    'الجاهزية مقارنة محسوبة بين المهارات التي تتطلبها الوظيفة والمهارات التي سجّلتها فعلًا، مرجّحة بحسب ما إذا كان الشرط أساسيًا أم تفضيليًا. إنها درجة مقابل معيار مرجعي، وليست تنبؤًا بنتيجة المقابلة.',
  'Recommendations are drawn from your own goals, skills, evidence, roadmap and application history. When the assistant reasons about something it cannot source from those records, it says so instead of filling the gap. Nothing you did not enter is treated as something you did.':
    'تستمد التوصيات من أهدافك ومهاراتك وأدلتك وخارطة طريقك وسجل طلباتك. وحين يستدل المساعد على أمر لا يجد مصدره في تلك السجلات، فإنه يصرّح بذلك بدلًا من ملء الفراغ. ولا يُعامل شيء لم تُدخله على أنك أدخلته.',
  'Your records are private to your account. Access is enforced by row-level security on the database, and your CV files live in a private storage bucket that only your account can read. Consent is versioned and recorded, and you can export or delete your data at any time.':
    'سجلاتك خاصة بحسابك. يُفرض الوصول عبر سياسات أمان على مستوى الصفوف في قاعدة البيانات، وملفات سيرتك الذاتية موجودة في حاوية تخزين خاصة لا يقرأها إلا حسابك. والموافقة مُصدَّرة بالإصدارات ومسجّلة، ويمكنك تصدير بياناتك أو حذفها في أي وقت.',
  'It cannot promise you a job, an interview, a salary or an offer. It cannot verify a certificate you did not earn. It has no live vacancy feed, so it will not show you a job that may already be closed. What it does is make your own position clearer and keep the next step honest.':
    'لا يمكنها أن تعدك بوظيفة أو مقابلة أو راتب أو عرض. ولا يمكنها التحقق من شهادة لم تكسبها. وليست لديها تغذية مباشرة للوظائف الشاغرة، لذا لن تعرض عليك وظيفة قد تكون أُغلقت بالفعل. ما تفعله هو أن تجعل وضعك أوضح، وأن تُبقي الخطوة التالية صادقة.',

  // ---- FAQ -------------------------------------------------------------
  'Do I need to already know which career I want?':
    'هل أحتاج أن أعرف مسبقًا المسار المهني الذي أريده؟',
  'No. You can start from a domain, a set of skills you already have, or a role you are curious about. The platform compares what you have recorded against the role and shows you the gap, so the direction can sharpen as you go.':
    'لا. يمكنك البدء من مجال، أو من مجموعة مهارات تمتلكها بالفعل، أو من وظيفة تثير اهتمامك. تقارن المنصة ما سجّلته بما تتطلبه الوظيفة وتعرض لك الفجوة، فيتجهّد اتجاهك وأنت تتقدّم.',
  'Where does the learning content come from?':
    'من أين يأتي المحتوى التعليمي؟',
  'Each resource in the catalogue carries the provider that published it and a link to the original page. The catalogue only shows resources that address a gap in your profile for your target role, and nothing is recommended to you that the platform cannot point you to.':
    'كل مورد في الدليل يحمل الجهة التي نشرته ورابطًا إلى صفحته الأصلية. ولا يعرض الدليل إلا الموارد التي تعالج فجوة في ملفك بالنسبة لوظيفتك المستهدفة، ولا يُقترح عليك شيء لا تستطيع المنصة أن تدلّك عليه.',
  'Can I get a job or an offer through CareerDev4AI?':
    'هل يمكنني الحصول على وظيفة أو عرض عمل عبر CareerDev4AI؟',
  'No, and no career platform can honestly promise that. The platform keeps your applications, your tailored documents and your interview preparation in one place so you can apply consistently and prepare properly. It also has no live vacancy feed, so it will not show you a vacancy it cannot verify.':
    'لا، ولا يمكن لأي منصة مهنية أن تَعِد بذلك بأمانة. تجمع المنصة طلباتك ووثائقك المعدّلة وتحضيرك للمقابلات في مكان واحد، فتتقدّم بطلبات متسقة وتستعدّ كما ينبغي. كما أنها لا تملك تغذية مباشرة للوظائف الشاغرة، لذا لن تعرض عليك شاغرة لا تستطيع التحقق منها.',
  'What happens to my original CV?':
    'ماذا يحدث لسيرتي الذاتية الأصلية؟',
  'It is never overwritten. A tailored version is created as a separate record that keeps a snapshot of the CV it was built from, so you can always see what changed and revert to the original.':
    'لا تُكتب فوقها أبدًا. تُنشأ النسخة المعدّلة سجلًا منفصلًا يحتفظ بلقطة من السير الذاتية التي بُنيت عليها، فترى دائمًا ما تغيّر وتعود إلى الأصل متى شئت.',
  'Is my data private?':
    'هل بياناتي خاصة؟',
  'Your records are private to your account, enforced by row-level security on the database. Your uploaded documents live in a private storage bucket. You can export your data, review your consents, or delete your account and your data from Settings.':
    'سجلاتك خاصة بحسابك، وتفرض ذلك سياسات أمان على مستوى الصفوف في قاعدة البيانات. وتوجد مستنداتك المرفوعة في حاوية تخزين خاصة. ويمكنك تصدير بياناتك، أو مراجعة موافقاتك، أو حذف حسابك وبياناتك من الإعدادات.',
  'Does it work in Arabic?':
    'هل يعمل بالعربية؟',
  'Yes. The entire interface is available in English and Arabic, including right-to-left layout, and the platform is built for the Egyptian and regional market rather than translated into it after the fact.':
    'نعم. الواجهة بالكامل متاحة بالإنجليزية والعربية، بما في ذلك التخطيط من اليمين إلى اليسار، والمنصة مبنية للسوق المصرية والسوق الإقليمي بدلًا من أن تُترجم إليها بعد ذلك.',
  'Do I need a paid plan?':
    'هل أحتاج إلى خطة مدفوعة؟',
  'There is no paid plan and no billing. Everything the platform offers is available from the moment you finish onboarding.':
    'لا توجد خطة مدفوعة ولا فوترة. كل ما تقدّمه المنصة متاح منذ لحظة إتمامك للتهيئة.',
  'Can I start on my phone?':
    'هل يمكنني البدء من الهاتف؟',
  'Yes. The dashboard, roadmaps, CV upload, application tracking and the AI assistant are all built to work on a phone, and the same product is available as an Android application.':
    'نعم. لوحة المعلومات وخارطات الطريق ورفع السيرة الذاتية ومتابعة الطلبات والمساعد الذكي جميعها مبنية للعمل على الهاتف، والمنتج نفسه متاح كتطبيق أندرويد.',

  // ---- Contact ---------------------------------------------------------
  'Support and feedback': 'الدعم والملاحظات',
  'Questions, bug reports and feature requests go to the same address the app publishes in Settings.':
    'تصل الأسئلة وتقارير الأخطاء وطلبات المزايا إلى العنوان نفسه الذي ينشره التطبيق في الإعدادات.',
  'Published legal documents': 'المستندات القانونية المنشورة',
  'The Terms and the Privacy Policy are published in full, at their own addresses, and are versioned.':
    'يُنشر الشروط وسياسة الخصوصية بنصهما الكامل، على عناوينهما الخاصة، وبإصدارات موثّقة.',
  'Who builds CareerDev4AI': 'من يبني CareerDev4AI',
  'The product is built and published by Ahmed Ebrahim, who is also the contact for the legal documents.':
    'يبني المنتج وينشره أحمد إبراهيم، وهو أيضًا جهة التواصل الخاصة بالمستندات القانونية.',
  'LinkedIn profile': 'ملف LinkedIn',

  // ---- Section headings ------------------------------------------------
  'What you get': 'ما تحصل عليه',
  'One workspace, ten connected capabilities.':
    'مساحة عمل واحدة، وعشر قدرات مترابطة.',
  'Each one is a real part of the signed-in product, and each one feeds the next. Nothing here is a promise about a feature that does not exist.':
    'كل واحدة منها جزء حقيقي من المنتج بعد تسجيل الدخول، وكل واحدة منها تُغذّي التي تليها. لا شيء هنا وعدٌ بميزة غير موجودة.',
  'Trust and transparency': 'الثقة والشفافية',
  'How the platform reaches its conclusions.':
    'كيف تصل المنصة إلى استنتاجاتها.',
  'A platform that tells you what you are missing should be equally clear about how it knows, and honest about what it cannot know.':
    'المنصة التي تخبرك بما ينقصك ينبغي أن تكون واضحة تمامًا بشأن كيفية علمها، وصادقة بشأن ما لا تستطيع معرفته.',
  'Questions': 'أسئلة',
  'Frequently asked questions': 'الأسئلة الشائعة',
  'Talk to the people who build it.':
    'تحدّث إلى من بنوه.',
  'The same support address, the same published legal documents, and the same operator the Terms name.':
    'عنوان الدعم نفسه، والمستندات القانونية المنشورة نفسها، والمشغّل نفسه الذي تذكره الشروط.',
  'Try it on a real role. Right now.':
    'جرّبه على وظيفة حقيقية. الآن.',
  'This is not a screenshot. Pick a role and the platform’s own planning engine builds the roadmap, the skill gaps and the next step in front of you.':
    'هذا ليس صورة ثابتة. اختر وظيفة فيبني لك محرّك التخطيط نفسه في المنصة خارطة الطريق والفجوات والخطوة التالية أمامك مباشرةً.',
  'About': 'عن المنصة',
  'Career roles': 'الوظائف المهنية',
  'Contact Us': 'اتصل بنا',
  'Switch interface language': 'تغيير لغة الواجهة',

  // ---- Navigation ------------------------------------------------------
  'Skip to content': 'تخطَّ إلى المحتوى',
  'How It Works': 'كيف يعمل',
  'Preview': 'معاينة',
  'Features': 'المميزات',
  'AI Guidance': 'إرشاد الذكاء الاصطناعي',
  'Personas': 'الشخصيات',
  'Target Roles': 'الوظائف المستهدفة',
  'FAQ': 'الأسئلة الشائعة',

  // ---- Dashboard: recent activity -------------------------------------
  'Recent activity': 'النشاط الأخير',
  'What you have actually done': 'ما أنجزته بالفعل',
  'See all activity': 'عرض كل النشاط',
  'Nothing is recorded yet. Complete a roadmap task, submit an application or finish a mock interview and it will appear here.':
    'لم يُسجَّل شيء بعد. أكمل مهمة من خارطة الطريق، أو قدّم طلبًا، أو أنهِ مقابلة تجريبية ليظهر هنا.',

  // ---- AI mentor: the evidence it reasons over -------------------------
  'What the assistant can see': 'ما يمكن للمساعد رؤيته',
  'The assistant reads these verified records when it answers. It cannot see anything you have not recorded here, and it is told to say so when a record is missing.':
    'يقرأ المساعد هذه السجلات الموثّقة عند الإجابة. لا يرى شيئًا لم تسجّله هنا، ومُعلَم أن يقول ذلك صراحةً حين ينقص سجل.',
  'Not set': 'غير محدّد',
  'Skills recorded': 'المهارات المسجّلة',
  'Roadmap steps': 'خطوات خارطة الطريق',
  'Learning items': 'عناصر التعلّم',
  'Evidence entries': 'سجلات الأدلة',
  'Work experience': 'الخبرات العملية',
  'Skill gaps it reasons about': 'فجوات المهارات التي يستند إليها',
  'Account': 'الحساب',

  // ---- Career Journey Visual & Real Photography ----------------------
  'Career Journey': 'المسار المهني',
  'From direction to destination.': 'من تحديد الوجهة إلى تحقيق الهدف.',
  'A step-by-step path that connects your ambition to concrete evidence and career momentum.':
    'مسار خطوة بخطوة يربط طموحك بالأدلة العملية والتقدم المهني.',
  'Real Careers in Action': 'مسارات مهنية واقعية',
  'Built for students, switchers, and rising leaders.': 'مصمم للطلاب ومغيري المسار والقادة الصاعدين.',
  'Whether preparing for your first internship, transitioning into tech, or managing a high-impact team.':
    'سواء كنت تستعد لتدريبك الأول، أو تنتقل إلى مجال التقنية، أو تقود فريقًا مؤثرًا.',
  'Students & Fresh Grads': 'الطلاب والخريجون الجدد',
  'Academic Learning to Industry Readiness': 'من التحصيل الأكاديمي إلى الجاهزية لسوق العمل',
  'Turn semester coursework into targeted portfolios and resume-ready technical evidence.':
    'حوّل دراستك الجامعية إلى معرض أعمال وأدلة تقنية تدعم سيرتك الذاتية.',
  'Working Professionals': 'المحترفون العاملون',
  'Measurable Impact & Skill Progression': 'تأثير ملموس وتطور مستمر في المهارات',
  'Benchmark existing proficiencies against senior and lead job specifications.':
    'قارن كفاءاتك الحالية بمتطلبات الوظائف المتقدمة والقيادية.',
  'Career Switchers': 'مغيرو المسار المهني',
  'Transferable Skills & Interview Mastery': 'مهارات قابلة للنقل وتميز في المقابلات',
  'Practice behavioral and technical STAR responses tailored to your transition path.':
    'تدرب على إجابات المقابلات السلوكية والتقنية بأسلوب STAR وفق مسارك الجديد.',

  // ---- Hero visual & trust badges -------------------------------------
  'Illustrative Preview': 'معاينة توضيحية',
  'Full-Stack Engineer': 'مهندس برمجيات شامل',
  'Next: System Architecture & APIs': 'التالي: بنية النظم وواجهات البرمجة',
  'Core Fundamentals': 'الأساسيات الجوهرية',
  'Verified': 'موثّق',
  'Architecture & APIs': 'البنية والواجهات البرمجية',
  'In Progress': 'قيد التقدم',
  'Market Skill Benchmark': 'معيار مهارات السوق',
  'Grounded in verified requirements': 'مبني على متطلبات معتمدة',
  '100% Free & Open Access': 'مجاني 100% ومتاح للجميع',
  'Open Career Dashboard': 'فتح لوحة التحكم المهنية',
  'Bilingual English & Arabic': 'بالإنجليزية والعربية',
  'Professional reviewing career roadmap and learning path on laptop in modern workspace':
    'متخصصة تراجع خارطة الطريق المهنية ومسار التعلم على الحاسوب في بيئة عمل عصرية',
  'CareerDev4AI 3D Architectural Composition': 'تكوين معماري ثلاثي الأبعاد لمنصة CareerDev4AI',
  'University student studying with a laptop in a modern educational environment':
    'طالبة جامعية تدرس على جهاز حاسوب محمول في بيئة تعليمية عصرية',
  'Professional job interview and recruitment discussion in a modern office':
    'مقابلة توظيف مهنية ونقاش عمل في مكتب عصري',
  'Diverse professional team collaborating and problem-solving together':
    'فريق مهني متنوع يتعاون ويحل المشكلات معًا',

  // ---- Reference visual showcase -------------------------------------
  'Visual Showcase': 'معرض بصري',
  'Authentic Workplace & Learning Imagery': 'مشاهد تعليمية وبيئات عمل حقيقية',
  'Authentic educational photography.': 'صور تعليمية فوتوغرافية حقيقية.',
  'Primary element before registration.': 'العنصر الرئيسي قبل التسجيل.',
  'Interviews and career opportunities.': 'مقابلات وفرص عمل.',
  'Collaboration and real work environments.': 'تعاون وبيئة عمل حقيقية.',
  'Hero 3D': 'Hero 3D',
  'Career Opportunities': 'Career Opportunities',
  'Professional Growth': 'Professional Growth',
};
