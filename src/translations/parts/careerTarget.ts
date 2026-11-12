/**
 * Arabic strings for the career target: the goal, the track, the role and the
 * experience level.
 *
 * This file also carries the Arabic names of the career DOMAINS and of the
 * career GOALS. Those labels live in `shared/careerDomains.ts` and in the
 * goal list, and they are the vocabulary the whole taxonomy is built from —
 * so they are translated here, once, rather than in each surface that shows
 * them.
 *
 * Every entry is keyed by the exact English source string used in the
 * components. Keep the two identical.
 */

export const careerTargetAr: Record<string, string> = {
  // -------------------------------------------------------------------
  // THE PANEL
  // -------------------------------------------------------------------
  'Career Goal & Target Role': 'الهدف المهني والدور المستهدف',
  'This is the target the whole platform measures you against — your roadmap, skill gaps, learning plan and job matches all follow it.':
    'هذا هو الهدف الذي تقيسك المنصة بالكامل في ضوئه — خارطة طريقك وفجوات مهاراتك وخطة التعلم ومطابقاتك الوظيفية تتبعه جميعًا.',
  'Your target role, career track and experience level. Your roadmap, skill gaps, learning plan and job matches are all measured against this — change it here and the whole platform follows.':
    'دورك المستهدف ومجال مسارك المهني ومستوى خبرتك. تُقاس خارطة طريقك وفجوات مهاراتك وخطة التعلم ومطابقاتك الوظيفية جميعًا مقابل هذا — غيّره هنا وتتابع المنصة بأكملها التغيير فورًا.',
  'Career goal': 'الهدف المهني',
  'Experience level': 'مستوى الخبرة',
  'The level you are aiming at. It tells the platform which rung to write for.':
    'المستوى الذي تستهدفه. يخبر المنصة أي مستوى من السُلّم تكتب له.',
  'Career track': 'المسار المهني',
  'Choose a track': 'اختر مسارًا',
  'The field your target role sits in. It narrows the role list below.':
    'المجال الذي يقع فيه دورك المستهدف. وهو يضيّق قائمة الأدوار أدناه.',
  'Target job title': 'المسمى الوظيفي المستهدف',
  'Choose a role': 'اختر دورًا',
  'Current track:': 'المسار الحالي:',
  'No target role yet — pick one and the platform will plan around it.':
    'لا يوجد دور مستهدف بعد — اختر واحدًا وستبني المنصة خطتك حوله.',
  'Your current target': 'هدفك الحالي',
  'You have not chosen a target role yet. Until you do, the roadmap, the skill gaps and the job matches stay generic.':
    'لم تختر دورًا مستهدفًا بعد. حتى تفعل ذلك تبقى خارطة الطريق وفجوات المهارات ومطابقات الوظائف عامة.',
  'Browse every role': 'تصفّح كل الأدوار',
  'Close': 'إغلاق',
  'Saving...': 'جارٍ الحفظ...',
  'Saved. Everything on the platform now uses this target.':
    'تم الحفظ. كل شيء في المنصة يستخدم هذا الهدف الآن.',
  'Could not save that change. Please try again.':
    'تعذّر حفظ التغيير. حاول مرة أخرى.',
  'Changes are saved as you make them — and everywhere on the platform updates at once.':
    'تُحفظ التغييرات فور إجرائها — ويتحدّث كل مكان في المنصة في الوقت نفسه.',
  'Not set': 'غير محدّد',

  // -------------------------------------------------------------------
  // THE DASHBOARD PROMPT
  // -------------------------------------------------------------------
  'No target role yet': 'لا يوجد دور مستهدف بعد',
  'Pick the role you are aiming at and everything below — your roadmap, your skill gaps, your learning plan and your job matches — is built around it.':
    'اختر الدور الذي تستهدفه، وسيُبنى كل ما بالأسفل — خارطة طريقك وفجوات مهاراتك وخطة تعلمك ومطابقاتك الوظيفية — حوله.',
  'Set my target role': 'حدّد دوري المستهدف',
  'Choose your target role to get your plan': 'اختر دورك المستهدف للحصول على خطتك',
  'Switch Target Role': 'تغيير الدور المستهدف',
  'Skip the getting-started tour? You can restart it later from Settings, and you can set your target role at any time from Profile or Settings.':
    'هل تريد تخطي الجولة التعريفية؟ يمكنك إعادة تشغيلها لاحقًا من الإعدادات، ويمكنك تحديد دورك المستهدف في أي وقت من الملف الشخصي أو الإعدادات.',

  // -------------------------------------------------------------------
  // THE EXPERIENCE LEVELS
  // -------------------------------------------------------------------
  Student: 'طالب',
  Intern: 'متدرب',
  Junior: 'مبتدئ',
  'Mid-level': 'مستوى متوسط',
  Senior: 'خبير',
  Lead: 'قيادي',

  // -------------------------------------------------------------------
  // THE CAREER GOALS
  // -------------------------------------------------------------------
  'Land a first full-time role': 'الحصول على أول وظيفة بدوام كامل',
  'Secure an internship': 'الحصول على تدريب عملي',
  'Switch careers': 'تغيير المسار المهني',
  'Get promoted': 'الترقية',
  'Become a domain specialist': 'أن تصبح متخصصًا في مجالك',
  'Move into management': 'الانتقال إلى الإدارة',
  'Build a verifiable portfolio': 'بناء معرض أعمال قابل للتحقق',
  'Go freelance': 'العمل الحر',
  'Explore career options': 'استكشاف الخيارات المهنية',
  'Reach a custom goal': 'تحقيق هدف مخصص',

  // -------------------------------------------------------------------
  // THE CAREER DOMAINS (level 1 of the taxonomy)
  // -------------------------------------------------------------------
  'Technology & Software': 'التقنية والبرمجيات',
  'Engineering & Manufacturing': 'الهندسة والتصنيع',
  'Data & Analytics': 'البيانات والتحليلات',
  'Design & Creative': 'التصميم والإبداع',
  'Product & Leadership': 'المنتج والقيادة',
  'Business & Management': 'الأعمال والإدارة',
  'Operations & Supply Chain': 'العمليات وسلسلة التوريد',
  'Finance & Accounting': 'المحاسبة والتمويل',
  'Marketing & Growth': 'التسويق والنمو',
  'Sales & Revenue': 'المبيعات والإيرادات',
  'People & Human Resources': 'الموارد البشرية',
  'Healthcare & Life Sciences': 'الرعاية الصحية والعلوم الحيوية',
  'Education & Training': 'التعليم والتدريب',
  'Legal & Regulation': 'القانون والتنظيم',
  'Security & Compliance': 'الأمن والامتثال',
};
