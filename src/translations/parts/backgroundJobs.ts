/**
 * The vocabulary of the background-job panel.
 *
 * Every entry is keyed by the exact English source string used in the
 * component. Keep the two identical.
 */

export const backgroundJobsAr: Record<string, string> = {
  'Background jobs': 'المهام في الخلفية',
  'Queued': 'في الانتظار',
  'In progress': 'قيد التنفيذ',
  'Completed': 'مكتملة',
  'Failed': 'فشلت',
  'Stopped': 'متوقفة',
  'Attempt': 'المحاولة',
  'Nothing is running in the background.': 'لا توجد مهام قيد التشغيل في الخلفية.',
  'Environment': 'البيئة',
  'Development': 'تطوير',
  'Waiting for a runner to pick this up.': 'في انتظار عامل ينفّذ هذه المهمة.',
  'Background processing is running on the Trigger.dev Production runtime.':
    'تعمل المعالجة في الخلفية على بيئة تشغيل Trigger.dev الإنتاجية.',
  'Background processing is running in a development environment. The work is carried out by a development worker rather than by the Trigger.dev Production runtime.':
    'تعمل المعالجة في الخلفية في بيئة تطوير. выполня العمل عامل تطوير بدلًا من بيئة تشغيل Trigger.dev الإنتاجية.',
  'Background processing is not available right now, so no new background work can start. A job that is already running is unaffected.':
    'المعالجة في الخلفية غير متاحة حاليًا، لذا لا يمكن بدء أي عمل جديد في الخلفية. أما المهام التي تعمل بالفعل فغير متأثرة.',
  'Background processing is not available on this server, so no background work can be started.':
    'المعالجة في الخلفية غير متاحة على هذا الخادم، لذا لا يمكن بدء أي عمل في الخلفية.',
  'The state of background processing could not be checked just now.':
    'تعذّر التحقق من حالة المعالجة في الخلفية للتو.',
  'Vacancies found': 'الوظائف التي تم العثور عليها',
  'No vacancies were found for this search.': 'لم يتم العثور على أي وظائف لهذا البحث.',
  'Fit': 'التوافق',
};
