/**
 * The Arabic catalogue of the extraction review.
 *
 * The review is the part of the CV journey a candidate reads most carefully,
 * so every sentence in it is translated — including the ones the server
 * produces. The server writes its messages as templates with `{placeholders}`
 * where a value goes, because the catalogue is keyed by the English text:
 * a sentence with the values already written into it would be a new string
 * every time and would never be found.
 */

export const cvExtractionAr: Record<string, string> = {
  /* -- the review screen ------------------------------------------------- */

  'Review what was extracted': 'راجع ما تم استخراجه',
  'Nothing has been saved to your profile yet. Check each value, correct anything that is wrong, and then apply the CV.':
    'لم يتم حفظ أي شيء في ملفك بعد. راجع كل قيمة، صحّح ما هو خاطئ، ثم اعتمد السيرة الذاتية.',
  'High': 'عالية',
  'Medium': 'متوسطة',
  'Low': 'منخفضة',
  'Missing': 'مفقودة',
  'Pasted text': 'نص ملصوق',
  'page(s)': 'صفحة',
  'Arabic': 'العربية',
  'English': 'الإنجليزية',
  'Arabic and English': 'العربية والإنجليزية',
  'Unknown language': 'لغة غير معروفة',
  'This document has no text layer': 'هذا المستند لا يحتوي على طبقة نصية',
  'Accept the high-confidence values': 'اعتمد القيم عالية الثقة',
  'Issues': 'الملاحظات',
  'Show the original document': 'أظهر المستند الأصلي',
  'What needs a look': 'ما يحتاج إلى مراجعة',
  'The original document': 'المستند الأصلي',
  'value(s)': 'قيمة',
  'Not in the document': 'غير موجود في المستند',
  'Applying the CV fills in the sections you kept. Anything you already have is never overwritten.':
    'تطبيق السيرة الذاتية يملأ الأقسام التي أبقَيتها فقط، ولا يُستبدل أي شيء لديك بالفعل.',
  'Applying…': 'جارٍ التطبيق…',
  'Apply this CV': 'اعتمد هذه السيرة الذاتية',
  'Read this section again from the document': 'أعد قراءة هذا القسم من المستند',
  'Read again': 'أعد القراءة',
  'Keep this section': 'أبقِ هذا القسم',
  'Skip this section': 'تخطَّ هذا القسم',
  'Collapse': 'طيّ',
  'Expand': 'توسيع',
  'This document does not have this section.': 'هذا المستند لا يحتوي على هذا القسم.',
  'Corrected': 'مُصحَّحة',
  'Accepted': 'مقبولة',
  'Not found in the document — type it here': 'غير موجود في المستند — اكتبه هنا',
  'Hide the source': 'أخفِ المصدر',
  'Where this came from': 'من أين جاءت هذه القيمة',
  'That section could not be read again.': 'تعذّرت إعادة قراءة هذا القسم.',
  'The reviewed CV could not be saved.': 'تعذّر حفظ السيرة الذاتية بعد المراجعة.',
  'This document could not be read.': 'تعذّرت قراءة هذا المستند.',
  'Failed': 'فشل',

  /* -- the import -------------------------------------------------------- */

  'The CV was applied, but some sections could not be saved.':
    'تم تطبيق السيرة الذاتية، لكن بعض الأقسام لم تُحفظ.',
  'The CV is now your CV.': 'السيرة الذاتية الآن هي سيرتك الذاتية.',
  'Added': 'أُضيف',
  'Already there': 'موجود مسبقاً',
  'Import another CV': 'استورد سيرة ذاتية أخرى',
  'Import your CV': 'استورد سيرتك الذاتية',
  'Upload the CV you already have. It is read and shown to you section by section, with the original text beside every value, before anything is saved.':
    'ارفع السيرة الذاتية التي لديك. تُقرأ وتُعرض لك قسماً بقسم، مع النص الأصلي بجانب كل قيمة، قبل حفظ أي شيء.',
  'Upload a file': 'ارفع ملفاً',
  'Paste your CV text': 'الصق نص سيرتك الذاتية',
  'Paste the full text of your CV here…': 'الصق النص الكامل لسيرتك الذاتية هنا…',
  'Reading…': 'جارٍ القراءة…',
  'Read my CV': 'اقرأ سيرتي الذاتية',
  'Reading your CV…': 'جارٍ قراءة سيرتك…',
  'Choose a file': 'اختر ملفاً',
  'This CV could not be read. Please try another file.':
    'تعذّرت قراءة هذه السيرة الذاتية. جرّب ملفاً آخر.',
  'The CV was uploaded but could not be measured.':
    'تم رفع السيرة الذاتية لكن تعذّر قياسها.',

  /* -- the analyzer, now part of the studio ------------------------------ */

  'Import a CV and review it before it is used':
    'استورد سيرة ذاتية وراجعها قبل استخدامها',
  'CV Studio reads a document you already have, shows every value it found with the text it came from, and waits for you to accept it before anything is saved.':
    'يقرأ استوديو السيرة الذاتية مستنداً لديك، ويعرض كل قيمة وجدها مع النص الذي جاءت منه، وينتظر موافقتك قبل حفظ أي شيء.',
  'Import & Review': 'استيراد ومراجعة',
  'Choose your CV': 'اختر سيرتك الذاتية',
  'Analyze my CV': 'حلّل سيرتي الذاتية',
  'Measure this CV': 'قِس هذه السيرة الذاتية',
  'The score is counted from your own document, so it does not depend on a model being available.':
    'الدرجة تُحسب من مستندك نفسه، لذلك لا تعتمد على توفّر نموذج خارجي.',
  'Measure now': 'قِس الآن',
  'Measured score': 'الدرجة المقاسة',
  'The CV could not be measured right now.': 'تعذّر قياس السيرة الذاتية الآن.',
  'Stop': 'إيقاف',

  /* -- the advice beside a section ---------------------------------------- */

  'What to improve here': 'ما يمكن تحسينه هنا',
  'Rewrite this section': 'أعد كتابة هذا القسم',
  'and {count} more': 'و{count} أخرى',

  /* -- the sections ------------------------------------------------------ */

  'Personal details': 'البيانات الشخصية',
  'Professional summary': 'النبذة المهنية',
  'Work experience': 'الخبرة العملية',
  'Internships': 'التدريبات',
  'Education': 'التعليم',
  'Projects': 'المشاريع',
  'Skills': 'المهارات',
  'Certifications': 'الشهادات',
  'Courses': 'الدورات',
  'Languages': 'اللغات',
  'Volunteering': 'العمل التطوعي',
  'Awards': 'الجوائز',
  'Publications': 'المنشورات',
  'Research': 'الأبحاث',
  'Leadership': 'القيادة',
  'Links': 'الروابط',

  /* -- the fields -------------------------------------------------------- */

  'Full name': 'الاسم الكامل',
  'Professional title': 'المسمى المهني',
  'Issuer': 'الجهة المانحة',
  'Publisher': 'الناشر',
  'Link': 'رابط',
  'url': 'الرابط',
  'Period': 'المدة',
  'High confidence': 'ثقة عالية',
  'Medium confidence': 'ثقة متوسطة',
  'Low confidence': 'ثقة منخفضة',
  'Needs review': 'يحتاج مراجعة',

  /* -- the field notes --------------------------------------------------- */

  'This value was assembled from the document rather than copied out of it, so please check it.':
    'هذه القيمة جُمِّعت من المستند بدل نسخها منه، لذا راجعها.',
  'This value was read out of the document and may need a little tidying.':
    'قُرئت هذه القيمة من المستند وقد تحتاج إلى بعض التعديل.',
  'The document does not contain this value verbatim.':
    'المستند لا يحتوي على هذه القيمة كنص حرفي.',
  'The document did not state this value.': 'لم يذكر المستند هذه القيمة.',
  'This date was read out of the document and could not be matched to it exactly.':
    'قُرئ هذا التاريخ من المستند ولم يُطابَق عليه بدقة.',

  /* -- the validation messages ------------------------------------------- */

  'No candidate name was found in the document.':
    'لم يُعثر على اسم صاحب السيرة الذاتية في المستند.',
  'Type your name in the header so the CV can be addressed to you.':
    'اكتب اسمك في الترويسة حتى تُخاطَب به سيرتك الذاتية.',
  'No email address was found in the document.':
    'لم يُعثر على بريد إلكتروني في المستند.',
  'Add an email address — most employers contact you through it.':
    'أضف بريداً إلكترونياً — معظم أصحاب العمل يتواصلون معك عبره.',
  'The email address "{email}" does not look like a valid email address.':
    'البريد الإلكتروني «{email}» لا يبدو عنواناً صحيحاً.',
  'Check it for a missing @ or a misspelled domain.':
    'تحقق من وجود علامة @ ومن كتابة النطاق بشكل صحيح.',
  'No phone number was found in the document.':
    'لم يُعثر على رقم هاتف في المستند.',
  'Add a phone number if you want employers to call you.':
    'أضف رقم هاتف إن أردت أن يتصل بك أصحاب العمل.',
  'The phone number "{phone}" does not look like a complete phone number.':
    'رقم الهاتف «{phone}» لا يبدو رقماً كاملاً.',
  'Include the country or area code.':
    'أدرج رمز الدولة أو المنطقة.',
  'No location was found in the document.':
    'لم يُعثر على موقع في المستند.',
  'Add the city you are based in — many employers filter on it.':
    'أضف المدينة التي تقيم فيها — كثير من أصحاب العمل يفلترون حسبها.',
  'No job title was found in the document.':
    'لم يُعثر على مسمى وظيفي في المستند.',
  'Add the role you are aiming at; it is the first thing a reader looks for.':
    'أضف الدور الذي تستهدفه؛ فهو أول ما يبحث عنه القارئ.',
  'No professional summary was found in the document.':
    'لم يُعثر على نبذة مهنية في المستند.',
  'A short summary at the top of the CV makes the rest easier to read.':
    'نبذة قصيرة في أعلى السيرة الذاتية تجعل بقية النص أسهل في القراءة.',
  'The professional summary is longer than most readers will read.':
    'النبذة المهنية أطول مما سيقرأه معظم القراء.',
  'Consider keeping it to four lines and moving the detail into the experience.':
    'فكّر في اختصارها في أربعة أسطر ونقل التفاصيل إلى الخبرة العملية.',
  'The {kind} link "{url}" is not a complete web address.':
    'رابط {kind} «{url}» ليس عنواناً ويب كاملاً.',
  'Links written as "linkedin.com/in/name" are added automatically, but a link that was cut short needs fixing.':
    'الروابط المكتوبة بصيغة "linkedin.com/in/name" تُضاف تلقائياً، لكن الرابط المبتور يحتاج إلى تصحيح.',
  'The link "{url}" appears more than once on the CV.':
    'الرابط «{url}» مكرر أكثر من مرة في السيرة الذاتية.',
  'Remove the duplicate.': 'احذف النسخة المكررة.',
  'The link "{url}" does not start with http:// or https://.':
    'الرابط «{url}» لا يبدأ بـ http:// أو https://.',
  'Add the full address, including the protocol.': 'أضف العنوان كاملاً مع البروتوكول.',
  'An experience entry has neither a role nor a company.':
    'أحد مدخلات الخبرة العملية بلا مسمى وظيفي وبلا جهة عمل.',
  'Fill it in or remove it.': 'أكمله أو احذفه.',
  '"{label}" appears more than once in the work history.':
    '«{label}» مكرر أكثر من مرة في سجل العمل.',
  'Two entries for the same role are usually one entry written twice.':
    'مدخلان لنفس الدور غالباً ما يكونان مدخلاً واحداً كُتب مرتين.',
  '"{label}" ends before it starts.': '«{label}» ينتهي قبل أن يبدأ.',
  'Check the two dates against each other.': 'قارن التاريخين مع بعضهما.',
  '"{label}" is marked as current and also has an end date.':
    '«{label}» مُعلَّم كوظيفة حالية وفيه تاريخ انتهاء.',
  'A role that is still running has no end date.': 'الوظيفة التي ما زالت قائمة لا لها تاريخ انتهاء.',
  '"{label}" has no dates.': '«{label}» بلا تواريخ.',
  'Applicant systems read dates as a filter, so an undated role is often skipped.':
    'أنظمة التقديم تقرأ التواريخ كعامل تصفية، لذا تُتجاهل الوظيفة بلا تواريخ كثيراً.',
  '"{label}" has no bullet points describing what was done.':
    '«{label}» بلا نقاط تصف ما تم إنجازه.',
  'One or two lines of what you actually did makes the role legible.':
    'سطر أو سطران عما أنجزته يجعلان الوظيفة مفهومة.',
  '"{first}" and "{second}" overlap in time.':
    '«{first}» و«{second}» متداخلتان في الوقت.',
  'Overlapping roles are normal when one was a promotion, but the dates should show that.':
    'تداخل الوظائف طبيعي عندما تكون إحداها ترقية، لكن التواريخ يجب أن تُظهر ذلك.',
  'An education entry has neither a degree nor an institution.':
    'أحد مدخلات التعليم بلا شهادة وبلا مؤسسة تعليمية.',
  '"{label}" appears more than once in the education section.':
    '«{label}» مكرر أكثر من مرة في قسم التعليم.',
  '"{value}" appears more than once in the {section} section.':
    '«{value}» مكرر أكثر من مرة في قسم {section}.',
  '"{skill}" is listed more than once in the skills section.':
    '«{skill}» مذكورة أكثر من مرة في قسم المهارات.',
  'A certificate has no name.': 'أحد الشهادات بلا اسم.',
  '"{name}" has no issuing body.': '«{name}» بلا جهة مانحة.',
  'An employer checks the body that gave the certificate.': 'يتحقق صاحب العمل من الجهة التي منحت الشهادة.',
};
