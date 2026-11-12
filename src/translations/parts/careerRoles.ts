/**
 * Arabic names for the career catalogue's roles.
 *
 * The catalogue is the platform's shared vocabulary — the same 81 roles drive
 * the picker, the roadmap generator, the skill catalogue, the learning map and
 * the job matcher. Their titles are therefore shown in many places, and in
 * Arabic mode they must not fall back to English: the role a candidate picks
 * in Arabic is the role they get in Arabic.
 *
 * Keyed by the exact English source string, like every other catalogue in
 * this directory.
 */

export const careerRolesAr: Record<string, string> = {
  // --- Business & Management ---
  'Business Analyst': 'محلل أعمال',
  'Management Consultant': 'استشاري إداري',
  'Operations Manager': 'مدير العمليات',
  'Project Manager': 'مدير مشاريع',
  'Business Development Manager': 'مدير تطوير الأعمال',
  'Entrepreneur / Founder': 'رائد أعمال / مؤسس',

  // --- Operations & Supply Chain ---
  'Supply Chain Manager': 'مدير سلسلة التوريد',
  'Inventory Planner': 'مخطط المخزون',
  'Procurement Specialist': 'أخصائي المشتريات',
  'Logistics Coordinator': 'منسق الخدمات اللوجستية',

  // --- Finance & Accounting ---
  'Financial Analyst': 'محلل مالي',
  Accountant: 'محاسب',
  'Financial Planner': 'مستشار مالي',
  'Investment Analyst': 'محلل استثمارات',
  'Tax Advisor': 'مستشار ضرائب',
  'Treasury Analyst': 'محلل خزينة',
  Bookkeeper: 'محاسب دفاتر',
  'Audit Assistant': 'مساعد تدقيق',

  // --- Sales & Revenue ---
  'Sales Representative': 'مندوب مبيعات',
  'Account Executive': 'مدير حساب',
  'Sales Operations Analyst': 'محلل عمليات المبيعات',
  'Customer Success Manager': 'مدير نجاح العملاء',

  // --- Design & Creative ---
  'Product / UI-UX Designer': 'مصمم منتج / واجهة وتجربة المستخدم',
  'Product Designer': 'مصمم منتجات',
  'Graphic Designer': 'مصمم جرافيك',
  'Brand Designer': 'مصمم علامات تجارية',
  'Motion & Video Designer': 'مصمم موشن وجيديو',

  // --- Product & Leadership ---
  'Product Manager': 'مدير منتج',
  'Product Owner': 'مالك المنتج',
  'Program Manager': 'مدير برنامج',

  // --- Marketing & Growth ---
  'Marketing Manager': 'مدير تسويق',
  'Digital Marketing Specialist': 'أخصائي تسويق رقمي',
  'SEO Specialist': 'أخصائي تحسين محركات البحث',
  'Content Marketing Specialist': 'أخصائي تسويق بالمحتوى',
  'Social Media Manager': 'مدير وسائل التواصل الاجتماعي',
  'Brand Manager': 'مدير علامة تجارية',
  'Product Marketing Manager': 'مدير تسويق المنتج',

  // --- People & Human Resources ---
  'Recruiter / Talent Acquisition Specialist': 'متعِدِ موارد / أخصائي استقطاب المواهب',
  'Talent Acquisition Specialist': 'أخصائي استقطاب المواهب',
  'HR Specialist': 'أخصائي موارد بشرية',
  'HR Business Partner': 'شريك أعمال الموارد البشرية',
  'Learning & Development Specialist': 'أخصائي التعلم والتطوير',
  'Compensation & Benefits Analyst': 'محلل التعويضات والمزايا',
  'People Operations Specialist': 'أخصائي عمليات الموظفين',
  'HR Analyst': 'محلل الموارد البشرية',

  // --- Healthcare & Life Sciences ---
  'Registered Nurse': 'ممرض مرخّص',
  'Medical Assistant': 'مساعد طبي',
  'Healthcare Administrator': 'مسؤول إدارة الرعاية الصحية',
  'Pharmacy Technician': 'فني صيدلة',
  'Public Health Analyst': 'محلل الصحة العامة',

  // --- Education & Training ---
  Teacher: 'معلم',
  'Secondary School Teacher': 'معلم ثانوي',
  'Special Education Teacher': 'معلم تعليم خاص',
  'Curriculum Designer': 'مصمم مناهج',
  'Training Specialist': 'أخصائي تدريب',

  // --- Legal & Regulation ---
  'Legal Assistant': 'مساعد قانوني',
  Paralegal: 'موظف قانوني مساعد',
  'Contract & Commercial Manager': 'مدير العقود والتجارة',
  'Compliance Analyst': 'محلل الامتثال',
  'Risk Management Analyst': 'محلل إدارة المخاطر',

  // --- Engineering & Manufacturing ---
  'Mechanical Engineer': 'مهندس ميكانيكا',
  'Civil Engineer': 'مهندس مدني',
  'Electrical Engineer': 'مهندس كهرباء',
  'Manufacturing & Process Engineer': 'مهندس التصنيع والعمليات',
  'Quality Engineer': 'مهندس جودة',
  Architect: 'مهندس معماري',

  // --- Technology & Software ---
  'Frontend Engineer': 'مهندس واجهات أمامية',
  'Full-Stack Engineer': 'مهندس برمجيات متكامل',
  'Software Engineer': 'مهندس برمجيات',
  'Mobile Engineer': 'مهندس تطبيقات جوال',
  'Quality Assurance Engineer': 'مهندس ضمان الجودة',
  'Site Reliability Engineer': 'مهندس موثوقية الأنظمة',
  'AI / Machine Learning Engineer': 'مهندس ذكاء اصطناعي / تعلّم آلة',
  'Cloud & DevOps Engineer': 'مهندس سحابة و DevOps',
  'Cybersecurity Analyst': 'محلل أمن سيبراني',

  // --- Data & Analytics ---
  'Data Analyst': 'محلل بيانات',
  'Data Scientist': 'عالم بيانات',
  'Analytics Engineer': 'مهندس تحليلات',
  'Business Intelligence Analyst': 'محلل ذكاء الأعمال',

  // --- Security & Compliance ---
  'Security Engineer': 'مهندس أمن',
  'Security & Risk Consultant': 'مستشار أمن ومخاطر',

  // --- The catalogue's seniority levels ---
  Entry: 'مبتدئ',
  'Entry-Mid': 'مبتدئ إلى متوسط',
  Mid: 'متوسط',
  Senior: 'خبير',
  Lead: 'قيادي',
};
