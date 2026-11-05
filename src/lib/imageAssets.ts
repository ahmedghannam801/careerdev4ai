/**
 * Authoritative Centralized Platform Visual Asset Inventory & Resolver
 *
 * Provides typed metadata, authentic Unsplash photographer attribution,
 * and stable category-to-asset resolution for all 15 career domains and
 * 20+ key specializations across CareerDev4AI.
 */

export interface PlatformVisualAsset {
  id: string;
  category: string;
  domainId: string;
  titleEn: string;
  titleAr: string;
  altEn: string;
  altAr: string;
  src: string;
  srcSm: string;
  photographer: string;
  source: string;
  license: string;
}

export const PLATFORM_ASSETS: Record<string, PlatformVisualAsset> = {
  // --- Core Technology & Specializations ---
  'software-engineering': {
    id: 'software-engineering',
    category: 'Software Engineering',
    domainId: 'technology',
    titleEn: 'Software Engineering & Development',
    titleAr: 'هندسة وتطوير البرمجيات',
    altEn: 'Software engineer writing code at modern dual-monitor workstation',
    altAr: 'مهندس برمجيات يكتب الأكواد في بيئة عمل عصرية',
    src: '/images/industries/software-engineering.webp',
    srcSm: '/images/industries/software-engineering-sm.webp',
    photographer: 'Christopher Gower',
    source: 'Unsplash',
    license: 'Unsplash License (Free commercial & non-commercial use)',
  },
  frontend: {
    id: 'frontend',
    category: 'Frontend Development',
    domainId: 'technology',
    titleEn: 'Frontend & Web Development',
    titleAr: 'تطوير واجهات المستخدم والويب',
    altEn: 'Frontend web developer designing responsive interface layout',
    altAr: 'مطور واجهات أمامية يصمم تجربة ويب تفاعلية ومتجاوبة',
    src: '/images/industries/frontend.webp',
    srcSm: '/images/industries/frontend-sm.webp',
    photographer: 'Igor Miske',
    source: 'Unsplash',
    license: 'Unsplash License',
  },
  backend: {
    id: 'backend',
    category: 'Backend Development',
    domainId: 'technology',
    titleEn: 'Backend Systems & Server Architecture',
    titleAr: 'الأنظمة الخلفية وبنية الخوادم وواجهات البرمجة',
    altEn: 'Server infrastructure and system architecture configuration',
    altAr: 'بنية الخوادم وقواعد البيانات وإعدادات الأنظمة الخلفية',
    src: '/images/industries/backend.webp',
    srcSm: '/images/industries/backend-sm.webp',
    photographer: 'Taylor Vick',
    source: 'Unsplash',
    license: 'Unsplash License',
  },
  ai: {
    id: 'ai',
    category: 'Artificial Intelligence',
    domainId: 'technology',
    titleEn: 'Artificial Intelligence & Machine Learning',
    titleAr: 'الذكاء الاصطناعي وتعلم الآلة',
    altEn: 'Artificial intelligence neural network model visualization',
    altAr: 'تصور لشبكات عصبية ونماذج الذكاء الاصطناعي المتقدمة',
    src: '/images/industries/ai.webp',
    srcSm: '/images/industries/ai-sm.webp',
    photographer: 'DeepMind',
    source: 'Unsplash',
    license: 'Unsplash License',
  },
  cybersecurity: {
    id: 'cybersecurity',
    category: 'Cybersecurity',
    domainId: 'security',
    titleEn: 'Cybersecurity & Security Operations',
    titleAr: 'الأمن السيبراني وعمليات حماية النظم والشبكات',
    altEn: 'Cybersecurity analyst monitoring network traffic and threat analysis',
    altAr: 'محلل أمن سيبراني يراقب حركة الشبكة وتحليلات التهديدات',
    src: '/images/industries/cybersecurity.webp',
    srcSm: '/images/industries/cybersecurity-sm.webp',
    photographer: 'FLY:D',
    source: 'Unsplash',
    license: 'Unsplash License',
  },
  cloud: {
    id: 'cloud',
    category: 'Cloud Computing',
    domainId: 'technology',
    titleEn: 'Cloud Computing & DevOps',
    titleAr: 'الحوسبة السحابية وعمليات DevOps',
    altEn: 'Global cloud infrastructure and distributed network connections',
    altAr: 'البنية التحتية السحابية العالمية والشبكات الموزعة',
    src: '/images/industries/cloud.webp',
    srcSm: '/images/industries/cloud-sm.webp',
    photographer: 'NASA',
    source: 'Unsplash',
    license: 'Unsplash License',
  },
  'it-support': {
    id: 'it-support',
    category: 'IT Support',
    domainId: 'technology',
    titleEn: 'IT Support & Systems Administration',
    titleAr: 'الدعم التقني وإدارة نظم تقنية المعلومات',
    altEn: 'IT systems administrator configuring hardware infrastructure',
    altAr: 'مسؤول نظم تقنية المعلومات يعد البنية التحتية للأجهزة',
    src: '/images/industries/it-support.webp',
    srcSm: '/images/industries/it-support-sm.webp',
    photographer: 'Compare Fibre',
    source: 'Unsplash',
    license: 'Unsplash License',
  },

  // --- Data & Analytics ---
  'data-analysis': {
    id: 'data-analysis',
    category: 'Data Analysis',
    domainId: 'data',
    titleEn: 'Data Analysis & BI',
    titleAr: 'تحليل البيانات وذكاء الأعمال',
    altEn: 'Data analyst analyzing business intelligence dashboard charts',
    altAr: 'محلل بيانات يستعرض لوحة مؤشرات وتحليلات ذكاء الأعمال',
    src: '/images/industries/data-analysis.webp',
    srcSm: '/images/industries/data-analysis-sm.webp',
    photographer: 'Luke Chesser',
    source: 'Unsplash',
    license: 'Unsplash License',
  },
  'data-science': {
    id: 'data-science',
    category: 'Data Science',
    domainId: 'data',
    titleEn: 'Data Science & Statistical Modeling',
    titleAr: 'علم البيانات والنمذجة الإحصائية',
    altEn: 'Data scientist examining predictive algorithms and dataset code',
    altAr: 'عالم بيانات يفحص خوارزميات التنبؤ والتحليلات الإحصائية',
    src: '/images/industries/data-science.webp',
    srcSm: '/images/industries/data-science-sm.webp',
    photographer: 'Markus Spiske',
    source: 'Unsplash',
    license: 'Unsplash License',
  },

  // --- Design & Creative ---
  'ui-ux': {
    id: 'ui-ux',
    category: 'UI/UX Design',
    domainId: 'design',
    titleEn: 'UI/UX & Product Design',
    titleAr: 'تصميم تجربة وواجهة المستخدم',
    altEn: 'Product designer sketching wireframes and mobile application flow',
    altAr: 'مصمم منتجات يخطط مسارات وتجربة تطبيقات الهاتف',
    src: '/images/industries/ui-ux.webp',
    srcSm: '/images/industries/ui-ux-sm.webp',
    photographer: 'Balázs Kétyi',
    source: 'Unsplash',
    license: 'Unsplash License',
  },

  // --- Business, Product & Management ---
  'project-management': {
    id: 'project-management',
    category: 'Project Management',
    domainId: 'product',
    titleEn: 'Project & Product Management',
    titleAr: 'إدارة المشاريع والمنتجات الرشيقة',
    altEn: 'Agile project team collaborating around Kanban board',
    altAr: 'فريق عمل رشيق يخطط للمشاريع باستخدام لوحة كانبان',
    src: '/images/industries/project-management.webp',
    srcSm: '/images/industries/project-management-sm.webp',
    photographer: 'Alvaro Reyes',
    source: 'Unsplash',
    license: 'Unsplash License',
  },
  'business-admin': {
    id: 'business-admin',
    category: 'Business Administration',
    domainId: 'business',
    titleEn: 'Business Administration & Management',
    titleAr: 'إدارة الأعمال والتخطيط الاستراتيجي',
    altEn: 'Modern enterprise corporate headquarters and strategic management',
    altAr: 'إدارة المؤسسات والتخطيط الاستراتيجي للشركات',
    src: '/images/industries/business-admin.webp',
    srcSm: '/images/industries/business-admin-sm.webp',
    photographer: 'Sean Pollock',
    source: 'Unsplash',
    license: 'Unsplash License',
  },
  entrepreneurship: {
    id: 'entrepreneurship',
    category: 'Entrepreneurship',
    domainId: 'business',
    titleEn: 'Entrepreneurship & Startups',
    titleAr: 'ريادة الأعمال والشركات الناشئة',
    altEn: 'Startup founders reviewing business model in co-working incubator',
    altAr: 'رواد أعمال يناقشون نموذج العمل في مساحة عمل مشتركة',
    src: '/images/industries/entrepreneurship.webp',
    srcSm: '/images/industries/entrepreneurship-sm.webp',
    photographer: 'Austin Distel',
    source: 'Unsplash',
    license: 'Unsplash License',
  },
  finance: {
    id: 'finance',
    category: 'Finance & Accounting',
    domainId: 'finance',
    titleEn: 'Finance, Banking & Accounting',
    titleAr: 'المالية والمحاسبة والاستثمار',
    altEn: 'Financial analyst reviewing corporate balance sheets and calculations',
    altAr: 'محلل مالي يراجع القوائم المالية وحسابات الاستثمار',
    src: '/images/industries/finance.webp',
    srcSm: '/images/industries/finance-sm.webp',
    photographer: 'Towfiqu barbhuiya',
    source: 'Unsplash',
    license: 'Unsplash License',
  },
  'digital-marketing': {
    id: 'digital-marketing',
    category: 'Digital Marketing',
    domainId: 'marketing',
    titleEn: 'Digital Marketing & Growth',
    titleAr: 'التسويق الرقمي والنمو',
    altEn: 'Marketing specialist analyzing digital campaign metrics and audience growth',
    altAr: 'أخصائي تسويق رقمي يحلل أداء الحملات ونمو الجمهور',
    src: '/images/industries/digital-marketing.webp',
    srcSm: '/images/industries/digital-marketing-sm.webp',
    photographer: 'Carlos Muza',
    source: 'Unsplash',
    license: 'Unsplash License',
  },
  sales: {
    id: 'sales',
    category: 'Sales',
    domainId: 'sales',
    titleEn: 'Sales & Revenue Growth',
    titleAr: 'المبيعات وتطوير الأعمال والعلاقات',
    altEn: 'Sales professionals discussing client proposal and contract',
    altAr: 'فريق مبيعات يناقش اتفاقيات العملاء وعروض العمل',
    src: '/images/industries/sales.webp',
    srcSm: '/images/industries/sales-sm.webp',
    photographer: 'Austin Distel',
    source: 'Unsplash',
    license: 'Unsplash License',
  },
  'human-resources': {
    id: 'human-resources',
    category: 'Human Resources',
    domainId: 'human-resources',
    titleEn: 'Human Resources & Talent Management',
    titleAr: 'الموارد البشرية وإدارة المواهب والتوظيف',
    altEn: 'HR manager conducting interview with job candidate',
    altAr: 'مسؤول الموارد البشرية يجري مقابلة عمل وتطوير للمواهب',
    src: '/images/industries/human-resources.webp',
    srcSm: '/images/industries/human-resources-sm.webp',
    photographer: 'Unseen Studio',
    source: 'Unsplash',
    license: 'Unsplash License',
  },

  // --- Specialized Disciplines ---
  engineering: {
    id: 'engineering',
    category: 'Engineering & Manufacturing',
    domainId: 'engineering',
    titleEn: 'Engineering & Technical Systems',
    titleAr: 'الهندسة والأنظمة الفنية والتصنيع',
    altEn: 'Engineers working on technical hardware in testing facility',
    altAr: 'مهندسون يعملون على تطوير الأجهزة في معمل فني متقدم',
    src: '/images/industries/engineering.webp',
    srcSm: '/images/industries/engineering-sm.webp',
    photographer: 'ThisisEngineering RAEng',
    source: 'Unsplash',
    license: 'Unsplash License',
  },
  healthcare: {
    id: 'healthcare',
    category: 'Healthcare & Life Sciences',
    domainId: 'healthcare',
    titleEn: 'Healthcare & Medical Technology',
    titleAr: 'الرعاية الصحية وتكنولوجيا الطب',
    altEn: 'Healthcare professional analyzing clinical patient research',
    altAr: 'أخصائي رعاية صحية يحلل الأبحاث والبيانات الطبية',
    src: '/images/industries/healthcare.webp',
    srcSm: '/images/industries/healthcare-sm.webp',
    photographer: 'National Cancer Institute',
    source: 'Unsplash',
    license: 'Unsplash License',
  },
  education: {
    id: 'education',
    category: 'Education & Training',
    domainId: 'education',
    titleEn: 'Education & Professional Training',
    titleAr: 'التعليم والتدريب وتطوير الكفاءات',
    altEn: 'Instructor leading collaborative professional development seminar',
    altAr: 'مدرب يقود ورشة عمل تفاعلية لتطوير المهارات المهنية',
    src: '/images/industries/education.webp',
    srcSm: '/images/industries/education-sm.webp',
    photographer: 'Ksenia Chernaya',
    source: 'Unsplash',
    license: 'Unsplash License',
  },
  legal: {
    id: 'legal',
    category: 'Legal & Regulation',
    domainId: 'legal',
    titleEn: 'Legal & Regulatory Compliance',
    titleAr: 'الشؤون القانونية والامتثال والعقود',
    altEn: 'Legal documentation and corporate compliance review',
    altAr: 'الوثائق القانونية ومراجعة الامتثال التنظيمي للشركات',
    src: '/images/industries/legal.webp',
    srcSm: '/images/industries/legal-sm.webp',
    photographer: 'Tingey Injury Law Firm',
    source: 'Unsplash',
    license: 'Unsplash License',
  },
  operations: {
    id: 'operations',
    category: 'Operations & Supply Chain',
    domainId: 'operations',
    titleEn: 'Operations & Supply Chain',
    titleAr: 'العمليات وسلاسل الإمداد والخدمات اللوجستية',
    altEn: 'Modern automated supply chain logistics fulfillment warehouse',
    altAr: 'مركز حديث لعمليات سلاسل الإمداد واللوجستيات',
    src: '/images/industries/operations.webp',
    srcSm: '/images/industries/operations-sm.webp',
    photographer: 'Petre Barlea',
    source: 'Unsplash',
    license: 'Unsplash License',
  },

  // --- Personas ---
  students: {
    id: 'students',
    category: 'Students',
    domainId: 'education',
    titleEn: 'University Students & Fresh Graduates',
    titleAr: 'الطلاب والخريجون الجدد',
    altEn: 'University students studying and collaborating with laptops',
    altAr: 'طلاب جامعيون يدرسون ويتعاونون معاً باستخدام أجهزة الحاسوب',
    src: '/images/personas/students.webp',
    srcSm: '/images/personas/students-sm.webp',
    photographer: 'Priscilla Du Preez',
    source: 'Unsplash',
    license: 'Unsplash License',
  },
  professionals: {
    id: 'professionals',
    category: 'Working Professionals',
    domainId: 'business',
    titleEn: 'Working Professionals & Leaders',
    titleAr: 'المحترفون العاملون والقيادات',
    altEn: 'Working professional presenting in corporate meeting room',
    altAr: 'محترفة تشارك في عرض تقديمي داخل غرفة اجتماعات عمل',
    src: '/images/personas/professionals.webp',
    srcSm: '/images/personas/professionals-sm.webp',
    photographer: 'Christina @ wocintechchat',
    source: 'Unsplash',
    license: 'Unsplash License',
  },
  switchers: {
    id: 'switchers',
    category: 'Career Switchers',
    domainId: 'business',
    titleEn: 'Career Switchers & Transitioners',
    titleAr: 'مغيرو المسار المهني',
    altEn: 'Career mentor advising professional during career transition discussion',
    altAr: 'مرشد مهني يوجه أحد المتخصصين خلال مرحلة تغيير المسار',
    src: '/images/personas/switchers.webp',
    srcSm: '/images/personas/switchers-sm.webp',
    photographer: 'Christina @ wocintechchat',
    source: 'Unsplash',
    license: 'Unsplash License',
  },

  // --- Features ---
  'cv-studio': {
    id: 'cv-studio',
    category: 'CV Studio',
    domainId: 'technology',
    titleEn: 'CV & Resume Studio',
    titleAr: 'استوديو السيرة الذاتية',
    altEn: 'Professional drafting targeted resume and career portfolio document',
    altAr: 'محترف يحرر سيرة ذاتية موجهة ووثائق التقديم المهني',
    src: '/images/features/cv-studio.webp',
    srcSm: '/images/features/cv-studio-sm.webp',
    photographer: 'Glenn Carstens-Peters',
    source: 'Unsplash',
    license: 'Unsplash License',
  },
  'interview-prep': {
    id: 'interview-prep',
    category: 'Interview Preparation',
    domainId: 'human-resources',
    titleEn: 'Interview Preparation & Practice',
    titleAr: 'التحضير للمقابلات الشخصية والتقنية',
    altEn: 'Professional participating in interactive video mock interview',
    altAr: 'محترفة تجري مقابلة تجريبية تفاعلية للتقييم الوظيفي',
    src: '/images/features/interview-prep.webp',
    srcSm: '/images/features/interview-prep-sm.webp',
    photographer: 'Christina @ wocintechchat',
    source: 'Unsplash',
  license: 'Unsplash License',
  },
  'ai-mentor': {
    id: 'ai-mentor',
    category: 'AI Mentor',
    domainId: 'technology',
    titleEn: 'AI Career Mentor & Intelligence',
    titleAr: 'المرشد المهني والذكاء الاصطناعي',
    altEn: 'Abstract digital intelligence neural pathways and reasoning lights',
    altAr: 'شبكات الذكاء الرقمي والتحليل المعرفي التفاعلي',
    src: '/images/features/ai-mentor.webp',
    srcSm: '/images/features/ai-mentor-sm.webp',
    photographer: 'Milad Fakurian',
    source: 'Unsplash',
    license: 'Unsplash License',
  },
  'skill-assessment': {
    id: 'skill-assessment',
    category: 'Skill Assessment',
    domainId: 'education',
    titleEn: 'Skill Assessment & Diagnostics',
    titleAr: 'تقييم وتشخيص المهارات المهنية',
    altEn: 'Student taking structured technical skill diagnostic test',
    altAr: 'طالب يجري اختباراً تشخيصياً دقيقاً للمهارات المهنية',
    src: '/images/features/skill-assessment.webp',
    srcSm: '/images/features/skill-assessment-sm.webp',
    photographer: 'Green Chameleon',
    source: 'Unsplash',
    license: 'Unsplash License',
  },
  'career-roadmap': {
    id: 'career-roadmap',
    category: 'Career Roadmap',
    domainId: 'product',
    titleEn: 'Career Roadmaps & Milestones',
    titleAr: 'خارطات الطريق والمحطات المهنية',
    altEn: 'Strategic milestone roadmap and milestone planner notebook',
    altAr: 'خطة استراتيجية محددة المعالم لتتبع الأهداف المهنية',
    src: '/images/features/career-roadmap.webp',
    srcSm: '/images/features/career-roadmap-sm.webp',
    photographer: 'Eric Rothermel',
    source: 'Unsplash',
    license: 'Unsplash License',
  },
};

/**
 * Resolves the best matching visual asset for any domain ID, role slug,
 * job title, learning category, or search keyword.
 */
export function getIndustryVisual(identifier: string | null | undefined): PlatformVisualAsset {
  if (!identifier) {
    return PLATFORM_ASSETS['software-engineering'];
  }

  const raw = identifier.trim().toLowerCase();
  const slug = raw.replace(/[_\s]+/g, '-');

  // Exact ID match
  if (PLATFORM_ASSETS[slug]) {
    return PLATFORM_ASSETS[slug];
  }

  // Domain ID mappings
  if (slug === 'technology' || slug.includes('software') || slug.includes('dev')) {
    if (slug.includes('front') || slug.includes('web') || slug.includes('react')) return PLATFORM_ASSETS['frontend'];
    if (slug.includes('back') || slug.includes('api') || slug.includes('node')) return PLATFORM_ASSETS['backend'];
    if (slug.includes('cloud') || slug.includes('devops') || slug.includes('aws')) return PLATFORM_ASSETS['cloud'];
    if (slug.includes('it') || slug.includes('support') || slug.includes('sysadmin')) return PLATFORM_ASSETS['it-support'];
    return PLATFORM_ASSETS['software-engineering'];
  }

  if (slug === 'data' || slug.includes('data') || slug.includes('analyst') || slug.includes('bi')) {
    if (slug.includes('science') || slug.includes('scientist') || slug.includes('machine-learning')) {
      return PLATFORM_ASSETS['data-science'];
    }
    if (slug.includes('ai') || slug.includes('artificial')) {
      return PLATFORM_ASSETS['ai'];
    }
    return PLATFORM_ASSETS['data-analysis'];
  }

  if (slug === 'security' || slug.includes('cyber') || slug.includes('soc')) {
    return PLATFORM_ASSETS['cybersecurity'];
  }

  if (slug === 'design' || slug.includes('design') || slug.includes('ux') || slug.includes('ui')) {
    return PLATFORM_ASSETS['ui-ux'];
  }

  if (slug === 'product' || slug.includes('product') || slug.includes('project') || slug.includes('agile')) {
    return PLATFORM_ASSETS['project-management'];
  }

  if (slug === 'business' || slug.includes('business') || slug.includes('management') || slug.includes('consulting')) {
    if (slug.includes('startup') || slug.includes('founder') || slug.includes('entrepreneur')) {
      return PLATFORM_ASSETS['entrepreneurship'];
    }
    return PLATFORM_ASSETS['business-admin'];
  }

  if (slug === 'finance' || slug.includes('finance') || slug.includes('account') || slug.includes('bank') || slug.includes('audit')) {
    return PLATFORM_ASSETS['finance'];
  }

  if (slug === 'marketing' || slug.includes('market') || slug.includes('seo') || slug.includes('content') || slug.includes('growth')) {
    return PLATFORM_ASSETS['digital-marketing'];
  }

  if (slug === 'sales' || slug.includes('sales') || slug.includes('revenue') || slug.includes('crm')) {
    return PLATFORM_ASSETS['sales'];
  }

  if (slug === 'human-resources' || slug.includes('hr') || slug.includes('talent') || slug.includes('people') || slug.includes('recruit')) {
    return PLATFORM_ASSETS['human-resources'];
  }

  if (slug === 'healthcare' || slug.includes('health') || slug.includes('medical') || slug.includes('nurse') || slug.includes('clinical')) {
    return PLATFORM_ASSETS['healthcare'];
  }

  if (slug === 'engineering' || slug.includes('engineer') || slug.includes('mechanical') || slug.includes('civil') || slug.includes('electrical')) {
    return PLATFORM_ASSETS['engineering'];
  }

  if (slug === 'education' || slug.includes('teach') || slug.includes('train') || slug.includes('academic') || slug.includes('school')) {
    return PLATFORM_ASSETS['education'];
  }

  if (slug === 'legal' || slug.includes('law') || slug.includes('legal') || slug.includes('compliance') || slug.includes('contract')) {
    return PLATFORM_ASSETS['legal'];
  }

  if (slug === 'operations' || slug.includes('operations') || slug.includes('supply') || slug.includes('logistics') || slug.includes('procurement')) {
    return PLATFORM_ASSETS['operations'];
  }

  // Generic keyword searches in titles/categories
  for (const asset of Object.values(PLATFORM_ASSETS)) {
    if (slug.includes(asset.id) || asset.category.toLowerCase().includes(raw)) {
      return asset;
    }
  }

  // Safe default: Software Engineering
  return PLATFORM_ASSETS['software-engineering'];
}
