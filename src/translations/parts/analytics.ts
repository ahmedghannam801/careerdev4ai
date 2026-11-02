/**
 * Arabic strings for the traffic analytics panel of the Admin Center.
 *
 * Every entry is keyed by the exact English source string used in
 * `src/components/admin/TrafficAnalyticsPanel.tsx` and in the Admin Center
 * tab list. Keep the two identical.
 */

export const analyticsAr: Record<string, string> = {
  // The tab and its headings
  'Traffic': 'الزيارات',
  'Traffic sources': 'مصادر الزيارات',
  'Top pages': 'أكثر الصفحات زيارة',
  'Devices': 'الأجهزة',
  'Geography': 'الجغرافيا',
  'Conversion funnel': 'مسار التحويل',

  // The overview figures
  'Visitors today': 'زوار اليوم',
  'Visitors this week': 'زوار هذا الأسبوع',
  'Visitors this month': 'زوار هذا الشهر',
  'Total users': 'إجمالي المستخدمين',
  'Sessions this month': 'الجلسات هذا الشهر',
  'Page views this month': 'مشاهدات الصفحات هذا الشهر',
  'New users': 'مستخدمون جدد',
  'Returning users': 'مستخدمون عائدون',

  // The table headings and the units
  'Page': 'الصفحة',
  'Views': 'مشاهدات',
  'Country': 'الدولة',
  'Sessions': 'الجلسات',
  'sessions': 'جلسة',
  'users': 'مستخدم',
  'events': 'حدث',

  // The panel's own state
  'Refresh': 'تحديث',
  'Last measured': 'آخر قياس',
  'No data for this period': 'لا توجد بيانات لهذه الفترة',
  'Reading the analytics property…': 'جارٍ قراءة خاصية التحليلات…',

  // The "not connected" state and how to leave it
  'Google Analytics is not connected': 'جرائدل أناليتيكس غير متصل',
  'To connect it': 'للتوصيل',
  'the numeric property id': 'معرّف الخاصية الرقمي',
  'the OAuth client id': 'معرّف عميل OAuth',
  'the OAuth client secret': 'سر عميل OAuth',
  'the refresh token': 'رمز التحديث',
  'The measurement works on the browser side, but the property is not readable from the server yet.':
    'القياس يعمل من جانب المتصفح، لكن الخاصية غير قابلة للقراءة من الخادم بعد.',
  'The authorisation must include the analytics read-only scope, and the account that granted it needs "Read & analyze" access to the property in Google Analytics. The credentials stay on the server and are never sent to the browser.':
    'يجب أن يتضمن التفويض نطاق القراءة فقط للتحليلات، وأن يملك الحساب الذي منحه صلاحية «القراءة والتحليل» على الخاصية في جرائدل أناليتيكس. تبقى بيانات الاعتماد على الخادم ولا تُرسل إلى المتصفح أبدًا.',
};
