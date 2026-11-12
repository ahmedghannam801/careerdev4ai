/**
 * Arabic translations for Subscriptions, Pricing, Checkout, Tokens, and Billing.
 * Keyed by the exact English source strings.
 */

export const subscriptionsAr: Record<string, string> = {
  // Plans & Pricing
  'Subscriptions & Pricing': 'الاشتراكات والأسعار',
  'Choose the plan that fits your career ambitions': 'اختر الخطة المناسبة لطموحاتك المهنية',
  'Monthly': 'شهرياً',
  'Annual': 'سنوياً',
  'Billing Cycle': 'دورة الفوترة',
  'Plan': 'الخطة',
  'Discount': 'الخصم',
  'Total Amount': 'المبلغ الإجمالي',
  'Default Account': 'الحساب الافتراضي',
  'Save up to 17% with annual billing': 'وفر حتى ١٧٪ مع الاشتراك السنوي',
  'Current Plan': 'خطتك الحالية',
  'Upgrade Now': 'ترقية الآن',
  'Get Started': 'ابدأ الآن',
  'Free Explorer': 'المستكشف المجاني',
  'Student & Early Career': 'الطلاب والبدايات المهنية',
  'Professional': 'المحترف',
  'Career Plus': 'المسار المتقدم (Plus)',
  'per month': 'شهرياً',
  'per year': 'سنوياً',
  'Billed monthly': 'دفع شهري',
  'Billed annually': 'دفع سنوي',
  'Tokens included': 'توكنات مشمولة',
  'Popular': 'الأكثر طلباً',
  'Best Value': 'أفضل قيمة',
  'All core platform features are 100% free': 'جميع مميزات المنصة الأساسية مجانية بالكامل ١٠٠٪',
  'Provisional Access Active': 'الوصول المؤقت مفعل',
  'Temporary 24h provisional access is active while your payment is being verified':
    'الوصول المؤقت لمدة ٢٤ ساعة مفعل بينما يتم التحقق من عملية الدفع',

  // Checkout & Payment Modal
  'Complete Your Subscription': 'إتمام الاشتراك',
  'Select Payment Method': 'اختر طريقة الدفع',
  'Vodafone Cash': 'فودافون كاش',
  'InstaPay': 'إنستاباي',
  'Transfer Instructions': 'تعليمات التحويل',
  'Submit Payment Evidence': 'إرسال إثبات التحويل',
  'Transaction Reference ID': 'الرقم المرجعي للعملية (Reference ID)',
  'Sender Phone Number / Handle': 'رقم محفظة أو حساب الراسل',
  'Upload Transfer Receipt / Screenshot': 'إرفاق صورة إيصال التحويل / لقطة الشاشة',
  'Drag and drop receipt here, or click to browse': 'اسحب صورة الإيصال هنا، أو انقر للاختيار',
  'Receipt image uploaded': 'تم إرفاق صورة الإيصال',
  'Have a promo coupon?': 'هل لديك كود خصم ترويجي؟',
  'Apply Coupon': 'تطبيق الكود',
  'Coupon applied successfully!': 'تم تطبيق كود الخصم بنجاح!',
  'Birthday Reward': 'مكافأة عيد الميلاد',
  'Claim 30% Birthday Discount': 'الحصول على خصم عيد الميلاد ٣٠٪',
  'Confirm and Submit Evidence': 'تأكيد وإرسال الإثبات',
  'Payment Under Review': 'الدفعة قيد المراجعة',
  'Your payment proof has been submitted. A provisional 24-hour access has been unlocked.':
    'تم إرسال إثبات الدفع بنجاح. تم تفعيل وصول تجريبي مؤقت لمدة ٢٤ ساعة.',
  'Amount to Transfer': 'المبلغ المطلوب تحويله',
  'I Have Transferred the Money': 'لقد قمت بالتحويل بالفعل',
  'Payment Proof Submitted!': 'تم إرسال إثبات الدفع بنجاح!',
  'Your payment evidence has been submitted and is currently being verified by an administrator.':
    'تم إرسال إثبات الدفع وجاري التحقق منه بواسطة المشرف.',
  'Done': 'تم',
  'Cancel': 'إلغاء',
  'Back': 'رجوع',
  'Next': 'التالي',
  'Copy': 'نسخ',
  'Copied!': 'تم النسخ!',

  // Tokens Badge & Modal
  //
  // The currency is called TOKENS in the interface. The ledger underneath
  // still calls it a credit, but a candidate never sees the ledger, and two
  // names for one currency is one name too many.
  'Tokens': 'توكن',
  // The singular, for the cost a button shows: "(1 Token)".
  'Token': 'توكن',
  'Your balance': 'رصيدك الحالي',
  'Monthly Allowance': 'الرصيد الشهري المخصص',
  'Used this cycle': 'المستخدم في هذه الدورة',
  'Daily tokens': 'التوكنات اليومية',
  'Remaining today': 'المتاح اليوم',
  'Next claim in': 'الاستلام التالي بعد',
  'Daily free tokens': 'التوكنات المجانية اليومية',
  'Top up tokens': 'شحن توكنات إضافية',
  'Token Packs': 'باقات التوكنات',
  'Top up extra tokens without changing your current plan. Extra tokens never expire and stay in your wallet.':
    'اشحن توكنات إضافية دون تغيير خطتك الحالية. التوكنات الإضافية لا تنتهي صلاحيتها وتبقى في محفظتك.',
  'Premium CV template': 'قالب السيرة الذاتية المميز',
  'Insufficient tokens': 'التوكنات غير كافية',
  'You need more tokens to run this AI model. Top up or upgrade your plan.':
    'تحتاج إلى توكنات إضافية لتشغيل هذا النموذج الذكي. اشحن رصيدك أو قم بترقية خطتك.',

  // The pricing FAQ.
  //
  // This section used to be hard-coded Arabic inside an otherwise bilingual
  // page, so an English speaker read Arabic in the one place on the Token Hub
  // that should have spoken their language.
  'Frequently asked questions about plans and payments':
    'الأسئلة الشائعة حول الاشتراكات والمدفوعات',
  'Everything you need to know about pricing and how a subscription is activated in Egypt.':
    'كل ما تحتاج معرفته عن سياسة الأسعار وتفعيل الاشتراكات في مصر.',
  'Are the core features of the platform actually free?':
    'هل الميزات الأساسية للمنصة مجانية بالفعل؟',
  'Yes — the core platform is completely free: job discovery, goal tracking and the basic learning maps. Paid plans exist to cover the running cost of the advanced AI models (Gemini), document processing and interview simulation.':
    'نعم — المنصة الأساسية مجانية بالكامل: استكشاف الوظائف وتتبع الأهداف وخرائط التعلم الأساسية. باقات الاشتراك مخصصة لتغطية تكاليف نماذج الذكاء الاصطناعي المتقدمة (Gemini) ومعالجة الوثائق ومحاكاة المقابلات.',
  'How is my account activated after I pay with Vodafone Cash or InstaPay?':
    'كيف يتم تفعيل الحساب بعد التحويل عبر فودافون كاش أو إنستاباي؟',
  'As soon as you enter the transfer reference and upload a screenshot of the receipt, the system gives you temporary access for 24 hours so you can carry on straight away, while an administrator makes the final confirmation during working hours.':
    'بمجرد إدخال الرقم المرجعي للتحويل ورفع لقطة الشاشة للإيصال، يمنحك النظام وصولاً مؤقتاً لمدة ٢٤ ساعة لمتابعة مهامك على الفور، بينما يقوم المشرف بالتأكيد النهائي خلال ساعات العمل.',
  'What happens if the AI call fails? Do I lose my tokens?':
    'ماذا يحدث إذا فشل استدعاء الذكاء الاصطناعي؟ هل أخسر توكناتي؟',
  'Never. The platform runs a secure double-entry ledger. If there is any network interruption or a model error, the tokens that were held are automatically refunded to your account straight away.':
    'مستحيل. المنصة تطبّق نظام دفتر الأستاذ المزدوج الآمن. إذا حدث أي انقطاع للشبكة أو خطأ في النموذج، تُسترد التوكنات المخصومة تلقائياً إلى حسابك فوراً.',
  'Can I pay by bank card?': 'هل يمكنني الدفع بالبطاقة البنكية؟',
  'Yes. Choose “Bank card” when you subscribe and you will be taken to Stripe’s secure page to enter your card details. The platform never sees or stores your card number, the subscription activates as soon as Stripe confirms the payment, and you can manage the card or cancel the renewal from “Manage invoices” on this page.':
    'نعم. اختر «بطاقة بنكية» عند الاشتراك لتنتقل إلى صفحة Stripe الآمنة لإدخال بيانات البطاقة. المنصة لا ترى رقم بطاقتك ولا تخزنه، ويتفعل الاشتراك تلقائياً بعد تأكيد الدفع، ويمكنك إدارة البطاقة أو إلغاء التجديد من زر «إدارة الفواتير» في هذه الصفحة.',

  // The daily claim.
  //
  // The reward is CLAIMED, so the wording is about an action the candidate
  // takes — "Claim", "Claimed today" — rather than about a grant that arrives
  // on its own.
  'Claim': 'استلم',
  'Claiming...': 'جارٍ الاستلام...',
  'Claim daily tokens': 'استلم التوكنات اليومية',
  'Claimed today': 'تم الاستلام اليوم',
  'Already claimed today': 'تم الاستلام اليوم بالفعل',
  'Your daily tokens are already waiting for you.': 'توجد توكناتك اليومية في انتظارك بالفعل.',
  'Daily tokens claimed': 'تم استلام التوكنات اليومية',
  'You received': 'لقد استلمت',
  'tokens': 'توكن',
  'Free tokens every day': 'توكنات مجانية كل يوم',
  'Could not claim the daily tokens': 'تعذّر استلام التوكنات اليومية',
  'Nothing was taken. Please try again.': 'لم يُخصم شيء. يُرجى المحاولة مرة أخرى.',

  // Admin Panels
  'Subscriptions': 'الاشتراكات',
  'Payments': 'المدفوعات',
  'Subscription Management': 'إدارة الاشتراكات',
  'Payment Requests': 'طلبات الدفع',
  'Revenue & Finance': 'الإيرادات والمالية',
  'Pending Review': 'قيد المراجعة',
  'Provisional Access': 'وصول مؤقت',
  'Confirmed & Paid': 'مؤكد ومدفوع',
  'Rejected': 'مرفوض',
  'Confirm Payment': 'تأكيد الدفعة',
  'Reject Payment': 'رفض الدفعة',
  'Restore Payment': 'استعادة الدفعة',
  'View Receipt': 'عرض الإيصال',
  'Risk Score': 'درجة المخاطرة',
  'Fraud Risk': 'مخاطر الاحتيال',
  'Total Collected Revenue': 'إجمالي الإيرادات المحصلة',
  'Transactions': 'المعاملات',
  'Manual Token Grant': 'منح توكنات يدوي',
  'Grant Tokens': 'منح التوكنات',
  'Amount (Tokens)': 'الكمية (توكن)',
  'Reason for Grant': 'سبب المنح',

  // Card payments (Stripe)
  'Card': 'بطاقة بنكية',
  'Continue to secure card payment': 'المتابعة إلى الدفع الآمن بالبطاقة',
  'Card payments are not available right now. Please choose Vodafone Cash or InstaPay.':
    'الدفع بالبطاقة غير متاح حالياً. يرجى اختيار فودافون كاش أو إنستاباي.',
  'Failed to start card checkout': 'تعذر بدء الدفع بالبطاقة',
  'You will enter your card details and any promotion code on Stripe’s secure page. We never see or store your card number.':
    'ستُدخل بيانات بطاقتك وأي كود خصم في صفحة Stripe الآمنة. نحن لا نرى رقم بطاقتك ولا نخزنه.',
  'Charged in Egyptian pounds on Stripe. Your bank may add a cross-border or currency-conversion fee.':
    'يُحصَّل المبلغ بالجنيه المصري عبر Stripe. قد يضيف بنكك رسوم تحويل دولي أو فرق عملة.',
  'Payment received': 'تم استلام الدفع',
  'Card checkout cancelled': 'تم إلغاء الدفع بالبطاقة',
  'Your plan and credits activate as soon as Stripe confirms the payment — usually within a few seconds.':
    'يتم تفعيل خطتك ورصيدك بمجرد تأكيد Stripe للدفع — عادةً خلال ثوانٍ.',
  'Nothing was charged. You can try again, or pay with Vodafone Cash or InstaPay.':
    'لم يتم خصم أي مبلغ. يمكنك المحاولة مرة أخرى، أو الدفع عبر فودافون كاش أو إنستاباي.',
  'Card subscription': 'اشتراك البطاقة',
  'Cancels on': 'يُلغى في',
  'Renews on': 'يتجدد في',
  'Test mode': 'وضع الاختبار',
  'Manage billing': 'إدارة الفواتير',
  'Failed to open the billing portal': 'تعذر فتح بوابة إدارة الفواتير',
  'Card invoices (Stripe)': 'فواتير البطاقات (Stripe)',
  'paid invoices': 'فواتير مدفوعة',
  'test-mode invoices are excluded from revenue': 'فاتورة اختبار مستبعدة من الإيرادات',
  'Stripe invoice history is not available on this deployment.':
    'سجل فواتير Stripe غير متاح على هذا الإصدار.',
  'No card invoices yet. Test-mode invoices are listed here but excluded from revenue.':
    'لا توجد فواتير بطاقات بعد. تُعرض فواتير وضع الاختبار هنا لكنها مستبعدة من الإيرادات.',
  'Test': 'اختبار',
  'Open invoice': 'فتح الفاتورة',

  // Card subscription states and portal return
  'Card billing': 'فواتير البطاقة',
  'Payment failed': 'فشل الدفع',
  'Unpaid': 'غير مدفوع',
  'Payment incomplete': 'الدفع غير مكتمل',
  'Expired': 'منتهي',
  'Cancelled': 'ملغي',
  'Paused': 'متوقف مؤقتاً',
  'Ended on': 'انتهى في',
  'Current period ends': 'تنتهي الفترة الحالية في',
  'Your saved card can be reused for future purchases.':
    'يمكن إعادة استخدام بطاقتك المحفوظة للمشتريات القادمة.',
  'Billing updated': 'تم تحديث الفواتير',
  'Your subscription and payment method changes have been refreshed from Stripe.':
    'تم تحديث حالة اشتراكك وطريقة الدفع من Stripe.',
  'Stripe could not collect the latest payment. Update your card to restore access.':
    'تعذر على Stripe تحصيل الدفعة الأخيرة. حدّث بطاقتك لاستعادة الوصول.',
  'Update payment method': 'تحديث طريقة الدفع',
  'Secure local payment methods — and card payment via Stripe':
    'طرق دفع محلية آمنة — ودفع بالبطاقة عبر Stripe',
  'Secure local payment methods': 'طرق دفع محلية آمنة',
  'Pay directly with Vodafone Cash or InstaPay, or by card on Stripe’s secure page. Wallet access is activated after the receipt is reviewed; a card subscription activates as soon as Stripe confirms the payment.':
    'ادفع مباشرة عبر فودافون كاش أو إنستاباي، أو بالبطاقة على صفحة Stripe الآمنة. يتم تفعيل الوصول بعد مراجعة الإيصال، ويتفعل اشتراك البطاقة بمجرد تأكيد Stripe للدفع.',
  'Pay directly with Vodafone Cash or InstaPay. Access is activated after the receipt is reviewed.':
    'ادفع مباشرة عبر فودافون كاش أو إنستاباي. يتم تفعيل الوصول بعد مراجعة الإيصال.',

  // Admin revenue additions
  'Refresh': 'تحديث',
  'From date': 'من تاريخ',
  'To date': 'إلى تاريخ',
  'Apply': 'تطبيق',
  'All time': 'كل الفترات',
  'Net collected revenue': 'صافي الإيرادات المحصلة',
  'After refunds': 'بعد خصم المبالغ المستردة',
  'Gross collected': 'إجمالي التحصيل',
  'Before refunds': 'قبل المبالغ المستردة',
  'Refunds': 'المبالغ المستردة',
  'refunds': 'عملية استرداد',
  'pending': 'قيد الانتظار',
  'failed': 'فاشلة',
  'refunded': 'مستردة',
  'Revenue by payment method': 'الإيرادات حسب طريقة الدفع',
  'Subscription revenue': 'إيرادات الاشتراكات',
  'Credit pack revenue': 'إيرادات حزم النقاط',
  'Credit packs': 'حزم النقاط',
  'Credit pack': 'حزمة نقاط',
  'Pending': 'قيد الانتظار',
  'Failed': 'فاشلة',
  'Disputes': 'النزاعات',
  'Recent card refunds': 'أحدث عمليات استرداد البطاقات',
  'Wallet transactions (Vodafone Cash / InstaPay)':
    'معاملات المحافظ (فودافون كاش / إنستاباي)',
  'No wallet transactions in this period.': 'لا توجد معاملات محافظ في هذه الفترة.',
  'No reference': 'بدون رقم مرجعي',

  // Checkout state machine & premium checkout surface
  'Method': 'الطريقة',
  'Instructions': 'التعليمات',
  'Checkout progress': 'مراحل الدفع',
  'Select a payment method to continue': 'اختر طريقة الدفع للمتابعة',
  'Secure checkout': 'صفحة دفع آمنة',
  'Checking…': 'جارٍ التحقق…',
  'Preparing checkout…': 'جارٍ تجهيز الدفع…',
  'Please wait…': 'يرجى الانتظار…',
  'Invalid coupon': 'كود خصم غير صالح',
  'Validation failed': 'فشل التحقق',
  'Failed to initialize payment': 'تعذر بدء عملية الدفع',
  'Failed to submit payment evidence': 'تعذر إرسال إثبات الدفع',
  'Wallet number': 'رقم المحفظة',
  'InstaPay address': 'عنوان إنستاباي',
  'Account holder': 'اسم المستلم',
  'Copy the account details and complete the transfer from your banking app.':
    'انسخ بيانات الحساب وأكمل التحويل من تطبيق البنك.',
  'The reference number shown in the confirmation message or the transfer receipt':
    'الرقم المرجعي الظاهر في رسالة تأكيد العملية أو في إيصال التحويل',
  'Receipt preview': 'معاينة الإيصال',
  'PNG, JPG up to 5 MB': 'صيغة PNG أو JPG حتى ٥ ميجابايت',
  'Receipt file size must be less than 5 MB': 'يجب أن يكون حجم ملف الإيصال أقل من ٥ ميجابايت',
  'Transaction reference is required': 'الرقم المرجعي للعملية مطلوب',
  'Sender phone or handle is required': 'رقم أو حساب الراسل مطلوب',
  'Please upload a screenshot or photo of your transfer receipt':
    'يرجى رفع لقطة شاشة أو صورة لإيصال التحويل',
  'Submitting the receipt unlocks provisional access for 24 hours while the team confirms the transfer.':
    'إرسال الإيصال يفعّل الوصول المؤقت لمدة ٢٤ ساعة بينما يؤكد الفريق عملية التحويل.',
  'Submitting your payment evidence…': 'جارٍ إرسال إثبات الدفع…',
  'Please keep this window open for a moment.': 'يرجى إبقاء هذه النافذة مفتوحة لفترة وجيزة.',
  'Your payment has been confirmed and your subscription is now active.':
    'تم تأكيد الدفع الخاص بك وأصبح اشتراكك فعالاً الآن.',
  'The payment could not be confirmed. Nothing was charged — you can try again or contact support.':
    'لم يتم تأكيد الدفع. لم يتم خصم أي مبلغ — يمكنك المحاولة مرة أخرى أو التواصل مع الدعم.',
  'Payment request expired': 'انتهت صلاحية طلب الدفع',
  'This payment request expired before it was completed. Please start a new checkout.':
    'انتهت صلاحية طلب الدفع قبل اكتماله. يرجى بدء عملية دفع جديدة.',
  'Payment refunded': 'تم استرداد المبلغ',
  'The payment was refunded, so nothing was charged for your subscription.':
    'تم استرداد مبلغ الدفع، لذلك لم يتم خصم أي مبلغ لاشتراكك.',
  'Start a new checkout': 'ابدأ عملية دفع جديدة',
};
