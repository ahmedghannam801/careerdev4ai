/**
 * Arabic strings for the career identity and the diagnostic knowledge checks.
 *
 * Every entry is keyed by the exact English source string used in the
 * components. Keep the two identical.
 *
 * The placeholders matter: the runtime substitutes them into the Arabic
 * sentence, so a translation that drops `{skill}` or `{level}` leaves the
 * reader with a sentence that has a hole in it.
 */

export const careerIdentityAr: Record<string, string> = {
  // ---- The identity panel ------------------------------------------------
  'Where you are now': 'أين أنت الآن',
  'Current status': 'الحالة الحالية',
  'Who you are right now. It decides which goal fits you.':
    'من أنت الآن. هذا يحدد الهدف المناسب لك.',
  'Current job title': 'المسمى الوظيفي الحالي',
  'Leave empty if you are a student': 'اتركه فارغًا إذا كنت طالبًا',
  'Your title as it is today. Students leave this empty.':
    'مسماك الوظيفي كما هو اليوم. ويتركه الطلاب فارغًا.',
  'Education status': 'حالة التعليم',
  'Currently studying': 'تدرس حاليًا',
  'Graduated': 'تخرجت',
  'If your graduation year is still in the future, you are marked as studying automatically.':
    'إذا كانت سنة التخرج في المستقبل، فسيتم اعتبارك طالبًا تلقائيًا.',
  'Expected graduation year': 'سنة التخرج المتوقعة',
  'For example 2028': 'مثال: 2028',
  'A year in the future always means you are still studying.':
    'السنة في المستقبل تعني دائمًا أنك ما زلت تدرس.',
  'Saved. Everything on the platform now uses this identity.':
    'تم الحفظ. كل شيء في المنصة أصبح يستخدم هذه الهوية الآن.',
  'Could not save that change. Please try again.':
    'تعذر حفظ هذا التغيير. حاول مرة أخرى.',

  // ---- The diagnostic knowledge checks ------------------------------------
  'Diagnostic Knowledge Checks': 'فحوص معرفية تشخيصية',
  'Diagnostic Knowledge Check: five practical questions that place your current level on the 1-5 scale. Calibrated for roadmap and readiness tailoring. Not an accredited third-party certification.':
    'فحص معرفي تشخيصي: خمسة أسئلة عملية تضع مستواك الحالي على مقياس من 1 إلى 5. معاير لتخصيص خارطة الطريق والجاهزية. وليس اعتمادًا من طرف ثالث.',
  'Calibrate your actual proficiency through practical, scenario-based questions. Your result is saved to your skill profile the moment you finish, and your readiness, blockers and roadmap are recalculated automatically.':
    'اضبط مستواك الحقيقي من خلال أسئلة عملية قائمة على المواقف. تُحفظ نتيجتك في ملف مهاراتك فور الانتهاء، وتُعاد حسابات الجاهزية والعوائق وخارطة الطريق تلقائيًا.',
  'These are five-question diagnostic knowledge checks, not professional certifications. They place you on the 1-5 scale so your roadmap and readiness figures are measured against real evidence.':
    'هذه فحوص معرفية تشخيصية من خمسة أسئلة وليست شهادات مهنية. تضعك على مقياس 1-5 ليُقاس خارطة طريقك وأرقام جاهزيتك على أساس أدلة حقيقية.',
  'Your role readiness, the career blockers and your roadmap were recalculated from this result.':
    'أُعيد حساب جاهزيتك للويفة والعوائق المهنية وخارطة الطريق بناءً على هذه النتيجة.',

  // ---- What the save did --------------------------------------------------
  'Assessment saved to your skill profile': 'تم حفظ التقييم في ملف مهاراتك',
  '{skill} is now measured at level {level}/5. Your role readiness, career blockers and roadmap were recalculated.':
    'تم قياس {skill} الآن بمستوى {level}/5. وأُعيد حساب جاهزيتك للويفة والعوائق المهنية وخارطة الطريق.',
  'The assessment could not be saved': 'تعذر حفظ التقييم',
  'Your score is safe. Use "Re-sync skill profile" to try again.':
    'نتيجتك محفوظة. استخدم «إعادة مزامنة ملف المهارات» للمحاولة مرة أخرى.',
  'Skill profile updated': 'تم تحديث ملف المهارات',
  '{skill} was saved as a self-reported level of {level}/5.':
    'تم حفظ {skill} كمستوى معلن ذاتيًا {level}/5.',
  'Saving to your skill profile…': 'جارٍ الحفظ في ملف مهاراتك…',
  'Saved to your skill profile': 'تم الحفظ في ملف مهاراتك',
  'Not saved yet — use Re-sync below': 'لم يتم الحفظ بعد — استخدم إعادة المزامنة أدناه',
  'Re-sync skill profile': 'إعادة مزامنة ملف المهارات',

  // ---- What a change to the target did ------------------------------------
  'Target role updated': 'تم تحديث الوظيفة المستهدفة',
  'Your roadmap, skill gaps, role readiness and CV target were rebuilt for the new role.':
    'أُعيد بناء خارطة طريقك وفجوات مهاراتك وجاهزيتك للوظيفة وهدف سيرتك الذاتية للوظيفة الجديدة.',
  'Experience level updated': 'تم تحديث مستوى الخبرة',
  'Your roadmap and skill gaps were recalculated for the new level.':
    'أُعيد حساب خارطة طريقك وفجوات مهاراتك على المستوى الجديد.',
  'Career goal updated': 'تم تحديث الهدف المهني',
  'Your plan now reflects the goal you chose.': 'خطة تعكس الآن الهدف الذي اخترته.',

  // ---- The empty sections -------------------------------------------------
  'No certifications yet': 'لا توجد شهادات بعد',
  'A certificate is proof a hiring manager can check. Add one you already hold, and it appears on your CV and in your portfolio.':
    'الشهادة دليل يمكن لصاحب العمل التحقق منه. أضف شهادة واحدة لديك بالفعل، فتظهر في سيرتك الذاتية ومعرض أعمالك.',
  'Add your first certification': 'أضف شهادتك الأولى',

  // ---- The score explanations --------------------------------------------
  'What does this score mean?': 'ماذا يقيس هذه الدرجة؟',
  'It does not measure:': 'ما لا يقيسه:',
  'Last checked: {time}': 'آخر فحص: {time}',
  'Current level {current} of 5. Target level {target} of 5.':
    'المستوى الحالي {current} من 5. المستوى المطلوب {target} من 5.',
};
