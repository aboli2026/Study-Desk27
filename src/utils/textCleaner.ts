/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * پاکسازی هوشمند نشانه‌های اضافی مارک‌داون (به‌ویژه ## و ### و ** و ...)
 * هنگام کپی پیست متن از هوش مصنوعی (ChatGPT، کلود، جمینای)، جزوات و سایت‌ها به استیکی‌نوت.
 */
export function cleanPastedMarkdown(raw: string): string {
  if (!raw) return '';

  let cleaned = raw;

  // ۱. حذف علامت‌های هدر مارک‌داون (## و ### و # در ابتدای خطوط)
  cleaned = cleaned.replace(/^[ \t]*#{1,6}[ \t]+/gm, '');

  // ۲. تبدیل کدهای متنی درون‌خطی و بلوک‌های کد: ``` و `
  cleaned = cleaned.replace(/```[a-zA-Z0-9_-]*\r?\n?/g, '');
  cleaned = cleaned.replace(/```/g, '');
  cleaned = cleaned.replace(/`([^`\r\n]+)`/g, '$1');

  // ۳. حذف ستاره‌ها و آندرلاین‌های بولد و ایتالیک: ***متن*** یا **متن** یا __متن__
  cleaned = cleaned.replace(/(\*{3}|_{3})(.*?)\1/g, '$2');
  cleaned = cleaned.replace(/(\*{2}|_{2})(.*?)\1/g, '$2');
  // ستاره یا آندرلاین تکی احاطه‌شده (برای جلوگیری از حذف ستاره در ضرب ریاضی یا خط فاصله)
  cleaned = cleaned.replace(/(^|[^\w\u0600-\u06FF])[*_]([^\r\n*_]+)[*_]([^\w\u0600-\u06FF]|$)/g, '$1$2$3');

  // ۴. حذف خط‌خوردگی ~~متن~~
  cleaned = cleaned.replace(/~~(.*?)~~/g, '$1');

  // ۵. حذف علامت‌های کوت (نقل‌قول) در ابتدای خطوط: > یا >>
  cleaned = cleaned.replace(/^[ \t]*>[ \t]*/gm, '');

  // ۶. تبدیل بولت‌های ستاره‌ای و خط‌تیره مارک‌داون به بولت تمیز فارسی
  cleaned = cleaned.replace(/^[ \t]*[-*+][ \t]+\[[ xX]\][ \t]*/gm, '• ');
  cleaned = cleaned.replace(/^[ \t]*[-*+][ \t]+/gm, '• ');

  // ۷. تمیز کردن لینک‌های مارک‌داون [عنوان](url) -> عنوان
  cleaned = cleaned.replace(/\[([^\]\r\n]+)\]\([^)\r\n]+\)/g, '$1');

  // ۸. حذف تگ‌های تصویر مارک‌داون ![alt](url)
  cleaned = cleaned.replace(/!\[([^\]\r\n]*)\]\([^)\r\n]+\)/g, '');

  // ۹. حذف خطوط جداکننده مارک‌داون (--- یا ***)
  cleaned = cleaned.replace(/^[ \t]*[-*_]{3,}[ \t]*$/gm, '');

  // ۱۰. پاکسازی موجودیت‌های رایج وب HTML مانند &nbsp; و &amp;
  cleaned = cleaned
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  // ۱۱. پاکسازی کاراکترهای نامرئی نامطلوب به جز نیم‌فاصله فارسی (ZWNJ: \u200C)
  cleaned = cleaned.replace(/[\u200B\uFEFF]/g, '');

  // ۱۲. تعدیل فاصله‌های خالی متوالی بیش از حد (حداکثر ۲ اینتر متوالی)
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

/**
 * بررسی اینکه آیا متن دارای نشانه‌های مارک‌داون به‌خصوص ## یا ** یا ``` است یا خیر
 */
export function hasMarkdownArtifacts(text: string): boolean {
  if (!text) return false;
  return /(?:^[ \t]*#{1,6}[ \t]+|\*{2}|_{2}|```|^[ \t]*>[ \t]*|~~)/m.test(text);
}
