/**
 * Arabic strings for the momentum, recommendation and breakdown surfaces.
 *
 * Every entry is keyed by the exact English source string used in the
 * components. Keep the two identical.
 *
 * These strings come from the shared modules — the roadmap time breakdown and
 * the skill gap explanation — as well as from the new momentum panel, so they
 * live in their own file rather than being scattered across the roadmap,
 * skills and career files.
 */

export const momentumAr: Record<string, string> = {
  // ---- The roadmap's hours, split by the kind of work ---------------------
  'Learning Courses': 'دورات تعلّم',
  'Hands-on Practice': 'تطبيق عملي',
  'Mini-Project / Assessment': 'مشروع مصغّر / تقييم',
  'Application & Interview Prep': 'التقديم والتحضير للمقابلات',
  'WHERE THESE HOURS GO': 'إلى أين تذهب هذه الساعات',
  'Why we recommend this': 'لماذا نرشّح هذا',

  // ---- Momentum: the pace, measured from the activity log ----------------
  'Your Momentum': 'زخمك',
  'Measured from your own recorded activity, not from the plan.':
    'مقاس من نشاطك المسجّل، لا من الخطة.',
  'active day': 'يوم نشِط',
  'active days in a row': 'أيام نشِطة متتالية',
  'Longest streak': 'أطول سلسلة',
  'Days with activity': 'أيام فيها نشاط',
  'Last active day': 'آخر يوم نشِط',
  'Not yet': 'لا يوجد بعد',

  // ---- The milestone timeline -------------------------------------------
  'Milestone Timeline': 'خط الزمن للمحطات',
  'Every milestone you recorded, newest first.':
    'كل محطة سجّلتها، الأحدث أولًا.',
  'No milestones recorded yet. Record the moments that matter — an offer, a certification, a finished project — and they appear here.':
    'لم تُسجَّل أي محطات بعد. سجّل اللحظات المهمة — عرض عمل، شهادة، مشروع منتهٍ — وستظهر هنا.',

  // ---- Empty states -------------------------------------------------------
  'No skill has reached the target level yet. Rate your skills to see what is already there.':
    'لم تصل أي مهارة إلى المستوى المستهدف بعد. قيّم مهاراتك لترى ما تحقق منها بالفعل.',
  'assessed or verified': 'تم تقييمها أو التحقق منها',
  'at target without evidence': 'عند المستوى المستهدف دون دليل',
  'No evidence attached yet. Add a project, certificate or document to prove a skill.':
    'لم تُرفَق أي أدلة بعد. أضف مشروعًا أو شهادة أو مستندًا لإثبات مهارة.',

  // ---- Why a skill is prioritised ----------------------------------------
  'Why this skill is prioritised': 'لماذا أُعطيت هذه المهارة الأولوية',
  'You already meet the {level}/5 this role expects for {skill}.':
    'أنت تحقق بالفعل المستوى {level}/5 الذي تتوقعه هذه الوظيفة في {skill}.',
  '{skill} is at {current}/5 and this role expects {required}/5 — {urgency}.':
    '{skill} عند {current}/5 وهذه الوظيفة تتوقع {required}/5 — {urgency}.',
  'blocks the role': 'تمنع الحصول على الوظيفة',
  'is a major requirement': 'من المتطلبات الأساسية',
  'is worth closing next': 'تجدر سدّها تاليًا',
  'is a nice-to-have': 'إضافة تُحسّن الملاءمة',

  // ---- Confirmations ------------------------------------------------------
  'Step completed.': 'اكتملت الخطوة.',
  'Step updated.': 'تم تحديث الخطوة.',
  'Skill level saved.': 'تم حفظ مستوى المهارة.',
  '{skill} is now rated {level}/5. Your roadmap was rebuilt from it.':
    'تقييّم {skill} أصبح الآن {level}/5. أُعيد بناء خارطة الطريق بناءً عليه.',

  // ---- The Progress Dashboard --------------------------------------------
  // The page states its own rule: every figure comes from a stored record and
  // every card opens the section it counts.
  'This page is built only from your own records. Every card opens the section it counts.':
    'هذه الصفحة مبنية من سجلاتك وحدها. كل بطاقة تفتح القسم الذي تُحصيه.',
  'Open roadmap': 'افتح خارطة الطريق',
  'No target role selected yet.': 'لم تختر وظيفة مستهدفة بعد.',
  'tasks remaining': 'مهام متبقية',
  'Career readiness': 'جاهزية المسار المهني',
  'from your skills and CV': 'من مهاراتك وسيرتك الذاتية',

  // The accessible names of the cards' navigation actions.
  'open your skills': 'افتح مهاراتك',
  'open the roadmap stages': 'افتح مراحل خارطة الطريق',
  'open your projects': 'افتح مشاريعك',
  'see how it is calculated': 'اعرف كيف يُحسب',
  'open the interview history': 'افتح سجل المقابلات',
  'open the live jobs board': 'افتح لوحة الوظائف',
  'open the application list': 'افتح قائمة الطلبات',
  'open your certificates': 'افتح شهاداتك',
  'open your evidence': 'افتح أدلتك',

  // Learning, counted by status.
  'Learning at a glance': 'التعلّم في لمحة',
  'Each count opens the Learning Hub already filtered to it.':
    'كل رقم يفتح مركز التعلّم مفلترًا عليه.',
  'Average progress of started courses': 'متوسط تقدّم الدورات التي بدأتها',
  'Resume where you left off': 'أكمل من حيث توقفت',
  'Your course in progress': 'دورتك قيد التقدّم',
  'No course in progress right now.': 'لا توجد دورة قيد التقدّم الآن.',

  // The pipeline and the proof.
  'Saved jobs': 'وظائف محفوظة',
  'Opportunities you kept to review': 'فرص احتفظت بها للمراجعة',
  'tracked in total': 'إجمالي ما تتابعه',
  'applications that reached an offer': 'طلبات وصلت إلى عرض عمل',
  'recorded on your profile': 'مسجّلة في ملفك',
  'Evidence records': 'سجلات الأدلة',
  'artifacts that prove a skill': 'أعمال تثبت مهارة',

  // The weekly activity chart.
  'Weekly activity': 'النشاط الأسبوعي',
  'Recorded actions per week, last 8 weeks.': 'الإجراءات المسجّلة كل أسبوع، آخر 8 أسابيع.',
  'actions in 8 weeks': 'إجراء في 8 أسابيع',
  'Nothing recorded yet. Your activity appears here as soon as you act.':
    'لا يوجد نشاط مسجّل بعد. سيظهر هنا بمجرد أن تبدأ.',
  'Week of': 'أسبوع',
  'this week': 'هذا الأسبوع',

  // The two lists that close the page.
  'View all skills': 'عرض كل المهارات',
  'View all evidence': 'عرض كل الأدلة',
};
