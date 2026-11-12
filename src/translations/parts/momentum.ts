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
};
