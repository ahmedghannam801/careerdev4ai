/**
 * Arabic strings for email delivery: the admin delivery screen, the candidate
 * preference centre and the payment messages that share the same surface.
 *
 * Every entry is keyed by the exact English source string used in the
 * components. Keep the two identical.
 */

export const emailAr: Record<string, string> = {
  // Admin delivery screen
  'The email overview could not be loaded.': 'تعذّر تحميل نظرة عامة على البريد الإلكتروني.',
  'The email log could not be loaded.': 'تعذّر تحميل سجل البريد الإلكتروني.',
  'The action failed.': 'فشل الإجراء.',
  'The audience could not be previewed.': 'تعذّرت معاينة الجمهور.',
  'The preview could not be rendered.': 'تعذّر عرض المعاينة.',
  'A title and a message are required.': 'العنوان والرسالة مطلوبان.',
  'The campaign is scheduled. Email will be queued when it publishes.':
    'تمت جدولة الحملة. سيُدرج البريد في قائمة الانتظار عند نشرها.',
  'The campaign was published and its email was queued.':
    'نُشرت الحملة وأُضيف بريدها إلى قائمة الانتظار.',
  'The campaign could not be sent.': 'تعذّر إرسال الحملة.',
  'Sending domain': 'نطاق الإرسال',
  'Not ready for all users': 'غير جاهز لجميع المستخدمين',
  'Reading configuration…': 'جارٍ قراءة الإعدادات…',
  'The sender domain is verified. Messages can be delivered to any recipient.':
    'نطاق المرسل موثّق. يمكن تسليم الرسائل إلى أي مستلم.',
  'A test message was accepted by the provider.': 'قبل المزوّد رسالة الاختبار.',
  'Send test': 'إرسال اختبار',
  'Add a sending domain': 'إضافة نطاق إرسال',
  'Enter a domain first.': 'أدخل نطاقًا أولًا.',
  'The domain was added. Publish the DNS records, then verify.':
    'أُضيف النطاق. انشر سجلات DNS ثم وثّقه.',
  'Add domain': 'إضافة النطاق',
  'The domain is verified. Email is now production-ready.':
    'تم توثيق النطاق. البريد جاهز للإنتاج الآن.',
  'Resend has not verified the domain yet. Check the DNS records.':
    'لم يوثّق Resend النطاق بعد. تحقّق من سجلات DNS.',
  'Verify now': 'تحقّق الآن',
  'Add these records at your DNS provider. SPF and DKIM are required; DMARC is strongly recommended.':
    'أضف هذه السجلات لدى مزوّد DNS. سجلا SPF وDKIM مطلوبان، ويُوصى بشدة بسجل DMARC.',
  'Value': 'القيمة',
  'No DNS records were returned. Refresh the domain.':
    'لم تُرجع أي سجلات DNS. حدّث النطاق.',
  'A DMARC record is not created by Resend automatically. Recommended: v=DMARC1; p=none; rua=mailto:support@yourdomain':
    'لا ينشئ Resend سجل DMARC تلقائيًا. الموصى به: v=DMARC1; p=none; rua=mailto:support@yourdomain',
  'Bounced': 'مرتدة',
  'Suppressed': 'محظورة',
  'Provider-reported': 'بحسب المزوّد',
  'Opened': 'مفتوحة',
  'Opens and clicks are recorded only when Resend sends the webhook for them.':
    'تُسجَّل الفتحات والنقرات فقط عندما يرسل Resend خطاف الويب الخاص بها.',
  'Queue controls': 'أدوات التحكم في قائمة الانتظار',
  'The queue runs on the cron every five minutes. These controls run a pass immediately.':
    'تعمل قائمة الانتظار عبر المهمة المجدولة كل خمس دقائق. هذه الأدوات تشغّل دورة فورية.',
  'The queue was processed.': 'تمت معالجة قائمة الانتظار.',
  'Process now': 'معالجة الآن',
  'Digest generation ran. Any new digest is queued.':
    'تم إنشاء الملخصات. أي ملخص جديد يُضاف إلى قائمة الانتظار.',
  'Run digests': 'تشغيل الملخصات',
  'blocked messages were released.': 'رسالة محجوبة تم إطلاقها.',
  'Release blocked': 'إطلاق المحجوب',
  'Email announcement': 'إعلان بالبريد الإلكتروني',
  'Publishes an in-app announcement and queues the same message by email. Target it, preview it, then send now or schedule it.':
    'ينشر إعلانًا داخل التطبيق ويضع الرسالة نفسها في قائمة انتظار البريد. حدّد الجمهور، عاين الرسالة، ثم أرسلها الآن أو جدولها.',
  'What is new?': 'ما الجديد؟',
  'Message': 'الرسالة',
  'Write the message the candidate will receive.': 'اكتب الرسالة التي سيتلقاها المرشح.',
  'Button label': 'نص الزر',
  'Open Aionvia': 'افتح Aionvia',
  'Schedule (optional)': 'الجدولة (اختياري)',
  'Button URL': 'رابط الزر',
  'All users': 'جميع المستخدمين',
  'By target role': 'حسب الدور المستهدف',
  'Target roles (comma separated)': 'الأدوار المستهدفة (مفصولة بفواصل)',
  'Preview email': 'معاينة البريد',
  'Schedule campaign': 'جدولة الحملة',
  'Publish & queue email': 'نشر وإدراج البريد',
  'Email preview': 'معاينة البريد',
  'Campaign performance': 'أداء الحملة',
  'From Resend events': 'من أحداث Resend',
  'Not published': 'غير منشورة',
  'No email campaigns yet.': 'لا توجد حملات بريد بعد.',
  'Email log': 'سجل البريد',
  'Search recipient or template': 'ابحث عن مستلم أو قالب',
  'All statuses': 'كل الحالات',
  'No messages match this view.': 'لا توجد رسائل تطابق هذا العرض.',
  'The message was put back in the queue.': 'أُعيدت الرسالة إلى قائمة الانتظار.',

  // Candidate preference centre
  'Your email preferences could not be loaded.': 'تعذّر تحميل تفضيلات البريد الإلكتروني.',
  'New opportunities': 'فرص جديدة',
  'Jobs, programmes and opportunities that match your target role.':
    'وظائف وبرامج وفرص تطابق دورك المستهدف.',
  'Job alerts': 'تنبيهات الوظائف',
  'New vacancies relevant to your role and skills.': 'وظائف شاغرة جديدة تناسب دورك ومهاراتك.',
  'Learning updates': 'تحديثات التعلّم',
  'New courses and resources, and course completions.': 'دورات وموارد جديدة، وإتمام الدورات.',
  'New volunteering opportunities.': 'فرص تطوع جديدة.',
  'Projects & challenges': 'المشاريع والتحديات',
  'New projects, challenges and experience programmes.':
    'مشاريع وتحديات وبرامج خبرة جديدة.',
  'Assessment results': 'نتائج التقييم',
  'When a skill assessment result is recorded.': 'عند تسجيل نتيجة تقييم مهارة.',
  'Career recommendations': 'توصيات المسار المهني',
  'Recommendations for your roadmap and next step.': 'توصيات لخارطة طريقك وخطوتك التالية.',
  'Application updates': 'تحديثات الطلبات',
  'When an application moves to a new stage.': 'عند انتقال طلب إلى مرحلة جديدة.',
  'Interview feedback': 'ملاحظات المقابلة',
  'When interview feedback or a report is ready.': 'عندما تصبح ملاحظات المقابلة أو تقريرها جاهزة.',
  'Roadmap milestones': 'محطات خارطة الطريق',
  'Roadmap tasks, milestones and generated plans.': 'مهام خارطة الطريق ومحطاتها والخطط المنشأة.',
  'Platform announcements': 'إعلانات المنصة',
  'Important product news and service updates.': 'أخبار المنتج المهمة وتحديثات الخدمة.',
  'Email notifications': 'إشعارات البريد الإلكتروني',
  'Choose what Aionvia emails you about. Your choices are saved to your account and apply immediately on every device.':
    'اختر ما يرسله إليك Aionvia بالبريد. تُحفظ اختياراتك في حسابك وتُطبَّق فورًا على كل الأجهزة.',
  'Loading your email preferences…': 'جارٍ تحميل تفضيلات بريدك…',
  'You are unsubscribed from opportunity, digest and announcement email.':
    'أنت غير مشترك في بريد الفرص والملخصات والإعلانات.',
  'Turn email back on': 'إعادة تشغيل البريد',
  'All optional email': 'كل البريد الاختياري',
  'The master switch for everything except account, security and activity email.':
    'المفتاح الرئيسي لكل شيء عدا بريد الحساب والأمان والنشاط.',
  'Digests': 'الملخصات',
  'A short summary of what is new and relevant. Sent even when you are not signed in.':
    'ملخص قصير لما هو جديد وذو صلة. يُرسل حتى عندما لا تكون مسجلًا للدخول.',
  'Daily digest': 'الملخص اليومي',
  'One email a day, only when there is something relevant.':
    'رسالة واحدة يوميًا، فقط عند وجود ما يستحق.',
  'Weekly digest': 'الملخص الأسبوعي',
  'A weekly career summary with progress and next recommendations.':
    'ملخص أسبوعي للمسار المهني مع التقدم والتوصيات التالية.',
  'Delivery hour (UTC)': 'ساعة الإرسال (UTC)',
  'Consent recorded': 'تم تسجيل الموافقة',
  'Unsubscribing stops opportunity, digest and announcement email immediately. Account and security email continues.':
    'إلغاء الاشتراك يوقف بريد الفرص والملخصات والإعلانات فورًا، ويستمر بريد الحساب والأمان.',
  'Confirm unsubscribe': 'تأكيد إلغاء الاشتراك',
  'Unsubscribe': 'إلغاء الاشتراك',
  'We only email you when the event actually happens. A digest with nothing new is not sent, and the same event never produces two messages.':
    'لا نرسل إليك بريدًا إلا عند حدوث الحدث فعليًا. لا يُرسل ملخص بلا جديد، ولا ينتج الحدث نفسه رسالتين.',
  'Choose which notification types appear in your Notifications drawer. In-app alerts are stored on this device; email preferences below are stored on your account.':
    'اختر أنواع الإشعارات التي تظهر في درج الإشعارات. تُحفظ تنبيهات التطبيق على هذا الجهاز، وتُحفظ تفضيلات البريد أدناه في حسابك.',

  // Payment states shown while an XPay/Fawry payment settles,
  'Account, security and activity email':
    'بريد الحساب والأمان والنشاط',
  'Password changes, sign-in email changes and security alerts are part of your account and cannot be turned off. They never contain marketing.':
    'تغييرات كلمة المرور، وتغييرات بريد تسجيل الدخول، وتنبيهات الأمان جزء من حسابك ولا يمكن إيقافها. وهي لا تحتوي على أي محتوى تسويقي.',
};
