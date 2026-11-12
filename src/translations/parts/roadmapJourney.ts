/**
 * Arabic strings for the roadmap journey and the score explanations.
 *
 * Every entry is keyed by the exact English source string used in the shared
 * modules. Keep the two identical.
 *
 * The journey strings are read through a variable rather than a literal, so
 * the localisation test cannot find them by scanning the source. The
 * `tests/qa-scenarios.test.ts` file checks that each one has an Arabic
 * entry, and `scripts/write-roadmap-journey-ar.ts` regenerates this file
 * from the modules themselves.
 */

export const roadmapJourneyAr: Record<string, string> = {
  "Foundation": "الأساسيات",
  "Find out where you really stand and close the basic gaps.": "اعرف أين تقف فعلًا وسدّ الفجوات الأساسية.",
  "Take a diagnostic knowledge check for the role’s core skills": "خُض فحصًا معرفيًا تشخيصيًا للمهارات الأساسية للوظيفة",
  "Learn the fundamentals the check exposes as missing": "تعلّم الأساسيات التي كشف الفحص نقصها",
  "Record what you already know so it is not planned again": "سجّل ما تعرفه بالفعل حتى لا يُخطط له مرة أخرى",
  "Every core skill has a measurement, not a guess": "لكل مهارة أساسية قياس، لا تخمين",
  "Foundational gaps are closed or explicitly deferred": "تم سدّ فجوات الأساسيات أو تأجيلها بوضوح",
  "Core Skills": "المهارات الأساسية",
  "Reach the level the target role expects on its required skills.": "ابلغ المستوى الذي تتوقعه الوظيفة المستهدفة في مهاراتها المطلوبة.",
  "Work through the required skills in priority order": "اعمل على المهارات المطلوبة حسب الأولوية",
  "Complete one course or guided track per open skill": "أكمل دورة أو مسارًا موجّهًا لكل مهارة مفتوحة",
  "Re-check each skill after the learning block": "أعد فحص كل مهارة بعد كتلة التعلّم",
  "Required skills are at or above their target level": "المهارات المطلوبة عند مستواها المستهدف أو أعلى منه",
  "No required skill is left unmeasured": "لا تُترك أي مهارة مطلوبة بلا قياس",
  "Practice": "التطبيق",
  "Turn knowledge into work you can show.": "حوّل معرفتك إلى عمل يمكنك عرضه.",
  "Build a mini-project that uses the skills you just learned": "ابنِ مشروعًا صغيرًا يستخدم المهارات التي تعلمتها للتو",
  "Practise the role’s recurring tasks on realistic material": "تدرب على المهام المتكررة للوظيفة على مواد واقعية",
  "Attach the project as evidence for the skills it proves": "أرفق المشروع كدليل على المهارات التي يثبتها",
  "At least one project is in progress or completed": "مشروع واحد على الأقل قيد التنفيذ أو مكتمل",
  "The project is linked to the skills it demonstrates": "المشروع مرتبط بالمهارات التي يثبتها",
  "Job Prep": "التحضير للتوظيف",
  "Package the work into applications that get read.": "حوّل عملك إلى طلبات تُقرأ فعلًا.",
  "Write the CV for the target role and run an alignment check": "اكتب السيرة الذاتية للوظيفة المستهدفة وأجرِ فحصًا للمطابقة",
  "Prepare answers for the questions this role is asked": "جهّز إجاباتك عن الأسئلة التي تُطرح في هذه الوظيفة",
  "Apply to matched roles and record each application": "قدّم على الوظائف المطابقة وسجّل كل طلب",
  "A CV exists for the target role and scores above the review threshold": "توجد سيرة ذاتية للوظيفة المستهدفة تتجاوز حد المراجعة",
  "At least one application is submitted": "تم تقديم طلب واحد على الأقل",
  "Job Ready": "جاهز للتوظيف",
  "Keep the pipeline moving and prove readiness with evidence.": "حافظ على حركة مسار التقديم وأثبت جاهزيتك بالدليل.",
  "Track every application through interview stages": "تابع كل طلب عبر مراحل المقابلات",
  "Turn interview feedback into the next learning step": "حوّل ملاحظات المقابلة إلى الخطوة التعليمية التالية",
  "Keep the portfolio and skills current as you apply": "حدّث معرض أعمالك ومهاراتك أثناء تقديمك",
  "Applications are progressing, not stalled": "الطلبات في تقدّم وليست متوقفة",
  "Required skills remain at target as the role evolves": "تبقى المهارات المطلوبة عند مستواها المستهدف مع تطور الوظيفة",
  "Role readiness": "الجاهزية للوظيفة",
  "How much of your target role’s required skill level you already meet. 100% means every required skill is at or above the level the role expects.": "كم من مستوى المهارات المطلوب في وظيفتك المستهدفة تحققته بالفعل. 100% تعني أن كل مهارة مطلوبة عند المستوى الذي تتوقعه الوظيفة أو أعلى منه.",
  "sum(min(your level, required level)) ÷ sum(required level) × 100": "مجموع(أصغر(مستواك، المستوى المطلوب)) ÷ مجموع(المستوى المطلوب) × 100",
  "Preferred (stretch) skills are shown in the gap list but are not counted. Evidence, projects and courses are not counted twice: they only raise the level they support.": "المهارات المفضلة (الإضافية) تظهر في قائمة الفجوات لكنها لا تُحتسب. والأدلة والمشاريع والدورات لا تُحتسب مرتين: فهي ترفع فقط المستوى الذي تدعمه.",
  "The required skills of your chosen target role": "المهارات المطلوبة في وظيفتك المستهدفة المختارة",
  "Your effective level for each skill (best of self-reported, assessed and evidenced)": "مستواك الفعلي لكل مهارة (الأفضل بين المعلن والمقاس والمُثبت)",
  "Roadmap completion": "إنجاز خارطة الطريق",
  "The share of roadmap steps you have finished. Each step is a concrete learning or practice action, not a phase.": "نسبة خطوات خارطة الطريق التي أنجزتها. كل خطوة هي عمل تعلّم أو تطبيق محدد، وليست مرحلة.",
  "completed steps ÷ total steps × 100": "الخطوات المكتملة ÷ إجمالي الخطوات × 100",
  "Steps you skipped are counted as not completed, because the plan still has that work in it.": "الخطوات التي تخطيتها تُحتسب غير مكتملة، لأن الخطة ما زالت تحمل ذلك العمل.",
  "Roadmap tasks marked completed": "مهام خارطة الطريق الموسومة كمكتملة",
  "All roadmap tasks in the plan": "كل مهام خارطة الطريق في الخطة",
  "CV alignment score": "درجة توافق السيرة الذاتية",
  "How well your CV matches the target role or the job description it was analysed against: keywords, measurable impact, structure and relevance.": "مدى تطابق سيرتك الذاتية مع الوظيفة المستهدفة أو وصف الوظيفة الذي حُللت بالنسبة له: الكلمات المفتاحية والأثر القابل للقياس والبنية والملاءمة.",
  "0.30 × keyword match + 0.25 × measurable impact + 0.20 × structure + 0.25 × relevance, rounded": "0.30 × مطابقة الكلمات المفتاحية + 0.25 × الأثر القابل للقياس + 0.20 × البنية + 0.25 × الملاءمة، مع التقريب",
  "A score belongs to the role it was generated for. After you change target role, the old score is marked stale rather than reused.": "الدرجة تخص الوظيفة التي وُلدت لها. وبعد تغيير وظيفتك المستهدفة تُعلَّم الدرجة القديمة كقديمة ولا تُعاد استخدام.",
  "Keywords in the CV that the role or job description asks for": "الكلمات المفتاحية في السيرة الذاتية التي تطلبها الوظيفة أو وصف الوظيفة",
  "Quantified achievements": "الإنجازات المُرقّمة",
  "Section structure and formatting": "بنية الأقسام والتنسيق",
  "Relevance of the experience to the role": "ملاءمة الخبرة للوظيفة",
  "Profile completeness": "اكتمال الملف الشخصي",
  "A weighted checklist of the sections an employer expects to find. Missing items are listed with the points they are worth, so the number always has an explanation.": "قائمة مرجّحة بالأوزان للأقسام التي يتوقع صاحب العمل وجودها. وتُدرج العناصر الناقصة بنقاطها، فيكون للرقم دائمًا تفسير.",
  "earned points ÷ 100, where every checklist item is worth a fixed number of points": "النقاط المكتسبة ÷ 100، حيث كل عنصر في القائمة يساوي عددًا ثابتًا من النقاط",
  "A roadmap project suggestion does not count as a project. Rate at least three skills; the role’s unrated requirements do not count as yours.": "اقتراح مشروع من خارطة الطريق لا يُحتسب مشروعًا. قيّم ثلاث مهارات على الأقل؛ ومتطلبات الوظيفة غير المقيمة لا تُحتسب مهاراتك.",
  "Basic information and summary": "المعلومات الأساسية والملخص",
  "Target role and education": "الوظيفة المستهدفة والتعليم",
  "Experience, skills and projects": "الخبرة والمهارات والمشاريع",
  "Certifications, professional links and a saved CV": "الشهادات والروابط المهنية وسيرة ذاتية محفوظة",
};
