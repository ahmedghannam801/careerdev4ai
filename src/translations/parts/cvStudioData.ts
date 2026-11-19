// The strings of the CV studio's editor: the data manager, the order of the
// sections, the state of the save, and the draft left behind on a device.
//
// The studio is where a candidate manages the records the CV is built from,
// so the words used there are here rather than scattered through the
// components that render them.

export const cvStudioDataAr: Record<string, string> = {
  'Personal information': 'المعلومات الشخصية',
  'Languages': 'اللغات',
  'Institution': 'الجامعة أو المؤسسة',
  'Links': 'الروابط',
  'Personal website': 'الموقع الشخصي',
  'Delete this item?': 'هل تريد حذف هذا العنصر؟',
  'This cannot be undone.': 'لا يمكن التراجع عن هذا الإجراء.',
  'Resume Language': 'لغة السيرة الذاتية',
  'The language your CV is written in. It does not change the language of the interface.':
    'اللغة التي تُكتب بها سيرتك الذاتية. وهي لا تغيّر لغة الواجهة.',
  'My Data': 'بياناتي',
  'No entries yet': 'لا توجد عناصر بعد',
  'Add the first one': 'أضف أول عنصر',
  'These are the same records the profile screen edits. A change made here appears there immediately, and the CV is built from them.':
    'هذه هي السجلات نفسها التي تُحرَّر في صفحة الملف الشخصي. أي تعديل تجريه هنا يظهر هناك فوراً، وتُبنى السيرة الذاتية منها.',
  'These details appear at the top of the CV and on your public profile.':
    'تظهر هذه البيانات في أعلى السيرة الذاتية وفي ملفك العام.',
  'Each entry becomes a block on the CV. The order is the order they appear in.':
    'كل عنصر يصبح فقرة في السيرة الذاتية، وترتيب العناصر هو ترتيب ظهورها فيها.',
  'Only the skills on this list can be written on a CV, and only the ones you rated are yours to claim.':
    'لا يمكن كتابة في السيرة الذاتية إلا المهارات المدرجة هنا، وهي وحدها التي قيّمتها فتستحق أن تدّعيها.',
  'Type of employment': 'نوع العمل',
  'Field of study': 'التخصص',
  'Issue date': 'تاريخ الإصدار',
  'Expiry date': 'تاريخ الانتهاء',
  'One per line. They become the bullet points on the CV.':
    'واحد في كل سطر. وهي تتحول إلى النقاط في السيرة الذاتية.',
  'GPA': 'المعدل التراكمي',
  'I am studying here now': 'أدرس هنا حالياً',
  'Coursework': 'المقررات الدراسية',
  'One per line.': 'واحد في كل سطر.',
  'Credential URL': 'رابط الشهادة',
  'The change could not be saved.': 'تعذّر حفظ التغيير.',

  // ---- The order of the sections ------------------------------------------
  'Section order': 'ترتيب الأقسام',
  'Your CV has one section, so there is nothing to reorder.':
    'يحتوي سيرتك الذاتية على قسم واحد فقط، لذا لا يوجد ما يمكن إعادة ترتيبه.',
  'Drag a section, or use the arrows, to change the order your CV is read in. The template still decides how each section looks.':
    'اسحب القسم، أو استخدم الأسهم، لتغيير ترتيب قراءة سيرتك الذاتية. ويبقى القالب هو من يقرر شكل كل قسم.',
  'Layout': 'التخطيط',
  'Undo': 'تراجع',
  'Header': 'الترويسة',
  'Section': 'قسم',
  'Main': 'الرئيسي',
  'Side': 'الجانبي',
  'header': 'الترويسة',
  'section': 'القسم',
  'Contact details': 'بيانات التواصل',
  'Professional links': 'الروابط المهنية',
  'entry': 'عنصر',
  'Untitled': 'بدون عنوان',
  'Drag a section, or use the arrows, to change the order your CV is read in. Move a section to the side column, and reorder the entries inside it. The template still decides how each part looks.':
    'اسحب القسم أو استخدم الأسهم لتغيير ترتيب قراءة سيرتك الذاتية. انقل أي قسم إلى العمود الجانبي، وأعد ترتيب العناصر داخله. ويبقى القالب هو من يقرر شكل كل جزء.',
  'Move to the main column': 'نقل إلى العمود الرئيسي',
  'Move to the side column': 'نقل إلى العمود الجانبي',
  'Move {name} to the main column': 'نقل {name} إلى العمود الرئيسي',
  'Move {name} to the side column': 'نقل {name} إلى العمود الجانبي',
  'Show the entries of {name}': 'عرض عناصر {name}',
  'Hide the entries of {name}': 'إخفاء عناصر {name}',
  'Drag {name}': 'اسحب {name}',
  '{name} moved to the side column': 'تم نقل {name} إلى العمود الجانبي',
  '{name} moved to the main column': 'تم نقل {name} إلى العمود الرئيسي',
  '{name} moved up inside its section': 'تم نقل {name} إلى الأعلى داخل قسمه',
  '{name} moved down inside its section': 'تم نقل {name} إلى الأسفل داخل قسمه',
  '{name} moved to the {column}': 'تم نقل {name} إلى {column}',
  'Contact details moved to the header': 'نُقلت بيانات التواصل إلى الترويسة',
  'Contact details moved to a section of their own': 'نُقلت بيانات التواصل إلى قسم مستقل',
  'Links moved to the header': 'نُقلت الروابط إلى الترويسة',
  'Links moved to their own section': 'نُقلت الروابط إلى قسم مستقل',
  'Undid the last layout change': 'تم التراجع عن آخر تغيير في التخطيط',
  'The layout is back to the one the template suggests': 'عاد التخطيط إلى ما يقترحه القالب',
  'Saved with your CV. The preview, the PDF and the Word file follow this layout.':
    'محفوظ مع سيرتك الذاتية. تتبع المعاينة وملف PDF وملف Word هذا التخطيط.',
  'Reset': 'إعادة ضبط',
  'Side column': 'العمود الجانبي',
  'Drag to reorder': 'اسحب لإعادة الترتيب',
  'Move {name} up': 'نقل {name} إلى الأعلى',
  'Move {name} down': 'نقل {name} إلى الأسفل',
  '{name} moved up to position {position}': 'تم نقل {name} إلى الموضع {position}',
  '{name} moved down to position {position}': 'تم نقل {name} إلى الموضع {position}',
  '{name} moved to position {position}': 'تم نقل {name} إلى الموضع {position}',
  'The section order is back to the one the template suggests':
    'عاد ترتيب الأقسام إلى الترتيب الذي يقترحه القالب',

  // ---- Which sections the CV shows ----------------------------------------
  '{name} hidden from the document': 'تم إخفاء {name} من المستند',
  '{name} shown on the document': 'تم إظهار {name} في المستند',
  'Show this section on the CV': 'إظهار هذا القسم في السيرة الذاتية',
  'Hide this section from the CV': 'إخفاء هذا القسم من السيرة الذاتية',
  'Show {name} on the CV': 'إظهار {name} في السيرة الذاتية',
  'Hide {name} from the CV': 'إخفاء {name} من السيرة الذاتية',

  // ---- The state of the save ----------------------------------------------
  'Could not save your latest changes.': 'تعذّر حفظ آخر تعديلاتك.',
  'Retrying…': 'جارٍ إعادة المحاولة…',
  'Saved to your account': 'تم الحفظ في حسابك',

  // ---- The draft left behind on the device --------------------------------
  'An unsaved draft of this CV was found on this device.':
    'عُثر على مسودة غير محفوظة لهذه السيرة الذاتية على هذا الجهاز.',
  'It was last changed {time}. Recover it to put those changes back in the editor and save them; discard it to keep the version in your account.':
    'آخر تغيير لها كان {time}. استعدها لإرجاع تلك التعديلات إلى المحرر وحفظها، أو تجاهلها للإبقاء على النسخة الموجودة في حسابك.',
  'Recover draft': 'استعادة المسودة',

  // ---- The AI suggestions offered on each section ------------------------
  'AI Suggestions': 'اقتراحات الذكاء الاصطناعي',
  'Write it for me': 'اكتبها لي',
  'Improve what I wrote': 'حسّن ما كتبته',
  'Make it shorter': 'اختصرها',
  'Add more detail': 'أضف تفاصيل أكثر',
  'Turn it into bullet points': 'حوّلها إلى نقاط',
  'Suggest achievements': 'اقترح الإنجازات',
  'Suggest responsibilities': 'اقترح المسؤوليات',
  'Suggest relevant skills': 'اقترح مهارات ذات صلة',
  'Open the document editor to export the CV.': 'افتح محرر المستندات لتصدير السيرة الذاتية.',
  'The PDF export could not be completed. Please try again.': 'تعذّر تصدير ملف PDF. يرجى المحاولة مرة أخرى.',
  'Opens the browser print dialog. Choose "Save as PDF" as the destination.': 'يفتح نافذة الطباعة في المتصفح. اختر «حفظ كملف PDF» وجهةً للطباعة.',
  'Preparing PDF...': 'جارٍ إعداد ملف PDF...',
  'Download as PDF': 'تنزيل بصيغة PDF',
};
