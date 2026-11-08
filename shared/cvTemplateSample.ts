/**
 * A complete sample CV for the template library.
 *
 * The previews must show a real document, not a colour swatch. Every section
 * the engine can render is present, so a candidate can see how a template
 * handles a long document before choosing it. The names, employers and awards
 * are fictional; nothing here is a claim about a real person.
 */

import type { CVProfile } from '../src/types/career.ts';
import type { ResumeLanguage } from './resumeLanguage.ts';

export const CV_TEMPLATE_SAMPLE_EN: CVProfile = {
  fullName: 'Layla Hassan',
  email: 'layla.hassan@example.com',
  phone: '+20 100 000 0000',
  location: 'Cairo, Egypt',
  title: 'Senior Product Engineer',
  summary:
    'Product engineer with seven years building reliable payment and data platforms. Leads small teams through discovery, delivery and measurement, and writes the systems they run on.',
  experiences: [
    {
      id: 'exp-1',
      company: 'Nile Commerce',
      role: 'Senior Product Engineer',
      period: 'Mar 2022 – Present',
      location: 'Cairo, Egypt',
      bullets: [
        'Led a four-engineer team rebuilding checkout, cutting payment failures by 28%.',
        'Designed the reconciliation service that settles 1.2M monthly transactions.',
        'Introduced release health dashboards that reduced rollback time to under ten minutes.',
      ],
    },
    {
      id: 'exp-2',
      company: 'Meridian Health',
      role: 'Backend Engineer',
      period: 'Jan 2020 – Feb 2022',
      location: 'Remote',
      bullets: [
        'Built the billing API used by three hospital groups across two countries.',
        'Cut reporting time by 30% by replacing nightly batch jobs with incremental views.',
      ],
    },
  ],
  education: [
    {
      id: 'edu-1',
      institution: 'Cairo University',
      degree: 'BSc',
      field: 'Computer Engineering',
      period: '2014 – 2018',
      gpa: '3.8 / 4.0',
      description: 'Graduation project: a fault-tolerant queue for clinic appointment reminders.',
    },
  ],
  projects: [
    {
      id: 'proj-1',
      title: 'OpenLedger',
      role: 'Creator',
      link: 'https://github.com/example/openledger',
      technologies: ['TypeScript', 'PostgreSQL', 'Cloudflare Workers'],
      bullets: [
        'An open-source double-entry ledger with 900 GitHub stars and 14 contributors.',
        'Runs the reference reconciliation suite for two fintech startups.',
      ],
      description: 'A small, auditable ledger for teams that need to explain every balance.',
    },
    {
      id: 'proj-2',
      title: 'Demand Forecast',
      role: 'Data lead',
      technologies: ['Python', 'SQL', 'dbt'],
      bullets: ['Forecast quarterly demand for 40 retail categories with a 12% error.'],
    },
  ],
  skillsList: [
    'TypeScript',
    'React',
    'Node.js',
    'PostgreSQL',
    'Cloudflare Workers',
    'Python',
    'System design',
    'Product discovery',
  ],
  certifications: ['AWS Solutions Architect Associate', 'Certified Scrum Product Owner'],
  certificationDetails: [
    {
      id: 'cert-1',
      name: 'AWS Solutions Architect Associate',
      issuer: 'Amazon Web Services',
      issueDate: '2023',
      description: 'Designing resilient, cost-aware cloud architectures.',
      credentialUrl: 'https://example.com/credentials/aws',
      skills: ['AWS', 'Architecture'],
    },
    {
      id: 'cert-2',
      name: 'Certified Scrum Product Owner',
      issuer: 'Scrum Alliance',
      issueDate: '2021',
    },
  ],
  links: [
    {
      id: 'link-1',
      kind: 'linkedin',
      label: 'LinkedIn',
      url: 'https://linkedin.com/in/example-layla',
      enabled: true,
    },
    {
      id: 'link-2',
      kind: 'github',
      label: 'GitHub',
      url: 'https://github.com/example-layla',
      enabled: true,
    },
    {
      id: 'link-3',
      kind: 'portfolio',
      label: 'Portfolio',
      url: 'https://layla.example.com',
      enabled: true,
    },
  ],
  volunteering: [
    {
      id: 'vol-1',
      organization: 'Mentor Egypt',
      role: 'Career mentor',
      period: '2021 – Present',
      location: 'Cairo, Egypt',
      description: 'Mentors early-career engineers from non-traditional backgrounds.',
      bullets: ['Mentored 18 engineers; nine moved into their first technical role.'],
    },
  ],
  courses: [
    {
      id: 'course-1',
      title: 'Designing Data-Intensive Applications',
      provider: 'O’Reilly',
      description: 'Distributed systems, consistency and storage engines.',
    },
    {
      id: 'course-2',
      title: 'Inclusive Leadership',
      provider: 'Coursera',
      description: 'Running teams where disagreement is safe and decisions are explicit.',
    },
  ],
  internships: [
    {
      id: 'intern-1',
      organization: 'Vodafone Egypt',
      role: 'Software Engineering Intern',
      period: 'Summer 2017',
      location: 'Cairo, Egypt',
      description: 'Worked on the internal customer-support tooling team.',
      bullets: ['Shipped a ticket-triage dashboard used by 120 agents.'],
    },
  ],
  languages: [
    { id: 'lang-1', name: 'Arabic', level: 'Native' },
    { id: 'lang-2', name: 'English', level: 'Fluent' },
    { id: 'lang-3', name: 'French', level: 'Conversational' },
  ],
  awards: [
    {
      id: 'award-1',
      title: 'Engineering Excellence Award',
      issuer: 'Nile Commerce',
      date: '2024',
      description: 'For the checkout reliability programme.',
    },
  ],
  publications: [
    {
      id: 'pub-1',
      title: 'Incremental reconciliation for high-volume payment systems',
      publisher: 'Egyptian Software Engineering Conference',
      date: '2023',
      url: 'https://example.com/papers/reconciliation',
      description: 'A practical account of replacing nightly settlement batches.',
    },
  ],
  research: [
    {
      id: 'res-1',
      title: 'Fault-tolerant scheduling for clinic reminders',
      institution: 'Cairo University',
      period: '2018',
      description: 'Undergraduate research on queue durability under intermittent connectivity.',
      bullets: ['Presented at the faculty research day.'],
    },
  ],
  leadership: [
    {
      id: 'lead-1',
      organization: 'Nile Commerce Engineering Guild',
      role: 'Backend guild lead',
      period: '2023 – 2024',
      description: 'Set the technical direction for 22 backend engineers.',
      bullets: ['Ran the architecture review forum and the incident retrospective programme.'],
    },
  ],
  hiddenSkills: [],
};

export const CV_TEMPLATE_SAMPLE_AR: CVProfile = {
  fullName: 'ليلى حسن',
  email: 'layla.hassan@example.com',
  phone: '٠١٠٠ ٠٠٠ ٠٠٠٠+',
  location: 'القاهرة، مصر',
  title: 'مهندسة منتجات أولى',
  summary:
    'مهندسة منتجات بخبرة سبع سنوات في بناء منصات مدفوعات وبيانات موثوقة. تقود فرقًا صغيرة من الاستكشاف إلى التسليم والقياس، وتكتب الأنظمة التي تعمل عليها.',
  experiences: [
    {
      id: 'exp-1',
      company: 'نايل كوميرس',
      role: 'مهندسة منتجات أولى',
      period: 'مارس ٢٠٢٢ – الآن',
      location: 'القاهرة، مصر',
      bullets: [
        'قادت فريقًا من أربعة مهندسين لإعادة بناء صفحة الدفع، فانخفضت حالات فشل الدفع بنسبة ٢٨٪.',
        'صممت خدمة التسوية التي تعالج ١٫٢ مليون معاملة شهريًا.',
        'أدخلت لوحات صحة الإصدارات التي خفضت زمن التراجع إلى أقل من عشر دقائق.',
      ],
    },
    {
      id: 'exp-2',
      company: 'ميريديان للرعاية الصحية',
      role: 'مهندسة خدمات خلفية',
      period: 'يناير ٢٠٢٠ – فبراير ٢٠٢٢',
      location: 'عن بُعد',
      bullets: [
        'بنَت واجهة الفوترة التي تستخدمها ثلاث مجموعات مستشفيات في بلدين.',
        'خفضت زمن إعداد التقارير بنسبة ٣٠٪ باستبدال المهام الليلية بعروض تدريجية.',
      ],
    },
  ],
  education: [
    {
      id: 'edu-1',
      institution: 'جامعة القاهرة',
      degree: 'بكالوريوس',
      field: 'هندسة الحاسبات',
      period: '٢٠١٤ – ٢٠١٨',
      gpa: '٣٫٨ / ٤٫٠',
      description: 'مشروع التخرج: طابور تحمل الأعطال لتذكير المرضى بالمواعيد.',
    },
  ],
  projects: [
    {
      id: 'proj-1',
      title: 'أوبن ليدجر',
      role: 'المُنشئة',
      link: 'https://github.com/example/openledger',
      technologies: ['TypeScript', 'PostgreSQL', 'Cloudflare Workers'],
      bullets: [
        'دفتر قيود مزدوج مفتوح المصدر حصل على ٩٠٠ نجمة وشارك فيه ١٤ مساهمًا.',
        'يشغّل مجموعة اختبارات التسوية المرجعية لشركتين ناشئتين في التقنية المالية.',
      ],
      description: 'دفتر صغير قابل للتدقيق للفرق التي تحتاج إلى تفسير كل رصيد.',
    },
    {
      id: 'proj-2',
      title: 'توقع الطلب',
      role: 'قائدة البيانات',
      technologies: ['Python', 'SQL', 'dbt'],
      bullets: ['توقع الطلب الربعي لأربعين فئة تجزئة بخطأ ١٢٪.'],
    },
  ],
  skillsList: [
    'TypeScript',
    'React',
    'Node.js',
    'PostgreSQL',
    'Cloudflare Workers',
    'Python',
    'تصميم الأنظمة',
    'استكشاف المنتج',
  ],
  certifications: ['AWS Solutions Architect Associate', 'Certified Scrum Product Owner'],
  certificationDetails: [
    {
      id: 'cert-1',
      name: 'AWS Solutions Architect Associate',
      issuer: 'Amazon Web Services',
      issueDate: '٢٠٢٣',
      description: 'تصميم معماريات سحابية مرنة وواعية بالتكلفة.',
      credentialUrl: 'https://example.com/credentials/aws',
      skills: ['AWS', 'المعمارية'],
    },
    {
      id: 'cert-2',
      name: 'Certified Scrum Product Owner',
      issuer: 'Scrum Alliance',
      issueDate: '٢٠٢١',
    },
  ],
  links: [
    {
      id: 'link-1',
      kind: 'linkedin',
      label: 'لينكدإن',
      url: 'https://linkedin.com/in/example-layla',
      enabled: true,
    },
    {
      id: 'link-2',
      kind: 'github',
      label: 'GitHub',
      url: 'https://github.com/example-layla',
      enabled: true,
    },
    {
      id: 'link-3',
      kind: 'portfolio',
      label: 'ملف الأعمال',
      url: 'https://layla.example.com',
      enabled: true,
    },
  ],
  volunteering: [
    {
      id: 'vol-1',
      organization: 'منتور إيجيبت',
      role: 'مرشدة مهنية',
      period: '٢٠٢١ – الآن',
      location: 'القاهرة، مصر',
      description: 'ترشد مهندسين في بداية مسارهم من خلفيات غير تقليدية.',
      bullets: ['أرشدت ١٨ مهندسًا؛ انتقل تسعة منهم إلى أول دور تقني لهم.'],
    },
  ],
  courses: [
    {
      id: 'course-1',
      title: 'تصميم تطبيقات كثيفة البيانات',
      provider: 'O’Reilly',
      description: 'الأنظمة الموزعة والاتساق ومحركات التخزين.',
    },
    {
      id: 'course-2',
      title: 'القيادة الشاملة',
      provider: 'Coursera',
      description: 'إدارة فرق يكون فيها الاختلاف آمنًا والقرارات واضحة.',
    },
  ],
  internships: [
    {
      id: 'intern-1',
      organization: 'فودافون مصر',
      role: 'متدربة هندسة برمجيات',
      period: 'صيف ٢٠١٧',
      location: 'القاهرة، مصر',
      description: 'عملت في فريق أدوات دعم العملاء الداخلية.',
      bullets: ['أطلقت لوحة فرز تذاكر يستخدمها ١٢٠ موظفًا.'],
    },
  ],
  languages: [
    { id: 'lang-1', name: 'العربية', level: 'اللغة الأم' },
    { id: 'lang-2', name: 'الإنجليزية', level: 'بطلاقة' },
    { id: 'lang-3', name: 'الفرنسية', level: 'محادثة' },
  ],
  awards: [
    {
      id: 'award-1',
      title: 'جائزة التميز الهندسي',
      issuer: 'نايل كوميرس',
      date: '٢٠٢٤',
      description: 'عن برنامج موثوقية الدفع.',
    },
  ],
  publications: [
    {
      id: 'pub-1',
      title: 'التسوية التدريجية لأنظمة المدفوعات عالية الحجم',
      publisher: 'مؤتمر هندسة البرمجيات المصري',
      date: '٢٠٢٣',
      url: 'https://example.com/papers/reconciliation',
      description: 'سرد عملي لاستبدال دفعات التسوية الليلية.',
    },
  ],
  research: [
    {
      id: 'res-1',
      title: 'جدولة تحمل الأعطال لتذكير المرضى',
      institution: 'جامعة القاهرة',
      period: '٢٠١٨',
      description: 'بحث جامعي عن متانة الطوابير في ظل الاتصال المتقطع.',
      bullets: ['قُدّم في يوم البحث بالكلية.'],
    },
  ],
  leadership: [
    {
      id: 'lead-1',
      organization: 'نقابة هندسة نايل كوميرس',
      role: 'قائدة نقابة الخدمات الخلفية',
      period: '٢٠٢٣ – ٢٠٢٤',
      description: 'حددت الاتجاه التقني لـ ٢٢ مهندسًا للخدمات الخلفية.',
      bullets: ['أدارت منتدى مراجعة المعمارية وبرنامج مراجعات الحوادث.'],
    },
  ],
  hiddenSkills: [],
};

/** The sample document in the requested resume language. */
export function cvTemplateSample(language: ResumeLanguage): CVProfile {
  return language === 'ar' ? CV_TEMPLATE_SAMPLE_AR : CV_TEMPLATE_SAMPLE_EN;
}
