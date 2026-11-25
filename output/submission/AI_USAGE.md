# استخدام الذكاء الاصطناعي

استُخدم **OpenAI Codex** في العمل على الشيفرة والتوثيق والتحقق من خلال أدوات Git وNode.js وPlaywright وواجهات الخدمات. استُخدم **eSpeak NG** محليًا لتركيب رسالتي الترحيب من نصّين أصليين. استُخدمت تسجيلات تشخيصية صُنعت للاختبار، وتُسند الموسيقى والتلاوات إلى ناشريها في [ملف الإسناد](AUDIO-SOURCES.md).

| أمثلة من تعليمات المستخدم | كيف استُخدمت وما الذي تحقّق |
| --- | --- |
| “Identify any conflicts between the plan and assessment before implementation.” | قارن Codex صفحات الاختبار الثلاث بخطة التنفيذ. سُجل أن الاستمرارية تتطلب العودة لليومي أثناء الدوام، وأن الثلاث ثوانٍ هدف هندسي لا رقم مطلوب في نص الاختبار. |
| “never infer audible success from metadata” | قارن Codex تسجيل MP3 وسجل المحطة بالمواعيد المحفوظة. سُجل البدء المبكر والمقاطع الإضافية وتجربة تكرار التسجيل الواحد. حالة قراءة الجدولة منفصلة عن التسجيل السمعي. |
| “reconcile the saved schedule, station timezone, server clock, recorder timestamps, and queue/playback events” | طابق Codex تواريخ عمّان مع UTC وطوابع التسجيل ومعرّفات سجل المحطة. بقي قرار إدراج المقاطع في الطابور بحاجة إلى سجلات المزوّد. |
| “Insert collection contents as snapshots of consecutive individual entries.” | أعاد Codex استخدام محرّر الترتيب والرفع، وأضاف تخزين المجموعات منفصلًا. اختبر حفظ برنامج يتضمن مجموعة وتغيير ترتيب المجموعة ثم إعادة فتح البرنامج ومقارنة الترتيب. |
| “Reuse valid existing evidence, including the one-hour capture.” | تُنسب الساعة إلى رابط البث ووقت التقاطه. أفاد صاحب المشروع بملاحظته على Windows وiPhone. سُجل فرق التوقيت العددي على أنه غير مقاس. |
| “Distinguish mocks, hosted read-back, audible verification, and physical-device observations.” | نشر Codex النسخة ثم قارَن ملفاتها المنشورة بالبناء المحلي، وقرأ إعداد المحطة، وأجرى اختبارات المتصفح على الاستضافة. أبقى نتائج التسجيل والملاحظة الميدانية مرتبطة بوقت إجراء الاختبارات الأصلية. |
