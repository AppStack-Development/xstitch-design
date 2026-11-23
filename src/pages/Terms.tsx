import type { ReactNode } from 'react';
import { t } from '../lib/i18n';
import { Icon } from '../components/Icon';
import { LangSwitch } from '../components/LangSwitch';
import { FeedbackLink } from '../components/FeedbackDialog';
import { APP_NAME } from '../lib/brand';

const CONTACT_EMAIL = 'admin@appstack-dev.io';

const Sec = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="privacy-sec">
    <h3>{title}</h3>
    {children}
  </section>
);

/** Terms for sharing patterns in the community gallery (reuses the privacy page layout). */
export function Terms() {
  return (
    <div className="privacy-page">
      <header className="site-head">
        <a className="icon-btn" href="#/community" title={t('กลับไปแกลเลอรีลายปัก', 'Back to the pattern gallery')} aria-label={t('กลับไปแกลเลอรีลายปัก', 'Back to the pattern gallery')}><Icon name="back" /></a>
        <h2><Icon name="people" size={18} /> {t('ข้อกำหนดการแชร์', 'Sharing terms')}</h2>
        <div className="spacer" />
        <LangSwitch />
      </header>
      <main className="privacy-main">
        <article className="privacy-doc">
          <h1>{t('ข้อกำหนดการแชร์ลายลงแกลเลอรี', 'Terms for sharing to the gallery')}</h1>
          <p className="hint">{t('ปรับปรุงล่าสุด 19 พ.ย. 2569', 'Last updated 19 Nov 2026')}</p>
          <p className="privacy-lead">{t(
            `ข้อกำหนดนี้ใช้เมื่อคุณแชร์ลายลงใน “แกลเลอรีลายปัก” ของ ${APP_NAME} หรือนำลายจากแกลเลอรีไปใช้ ถ้าแค่ออกแบบและเก็บลายไว้ใช้เอง ข้อกำหนดนี้ไม่เกี่ยวกับคุณ`,
            `These terms apply when you share a pattern in ${APP_NAME}’s community gallery, or use a pattern from it. If you only design patterns for yourself, they don’t apply to you.`,
          )}</p>

          <Sec title={t('เมื่อคุณแชร์ลาย คุณยืนยันว่า', 'When you share a pattern, you confirm that')}>
            <ul>
              <li>{t('คุณออกแบบลายนี้เอง หรือได้รับอนุญาตจากเจ้าของให้แชร์', 'you designed it yourself, or the owner allowed you to share it')}</li>
              <li>{t('ลายไม่ละเมิดลิขสิทธิ์หรือเครื่องหมายการค้าของใคร', 'it doesn’t infringe anyone’s copyright or trademark')}</li>
              <li>{t('ลายไม่มีเนื้อหาที่ไม่เหมาะสม และไม่มีข้อมูลส่วนตัวของคนอื่น', 'it has no inappropriate content and no one else’s personal information')}</li>
              <li>{t('คุณอายุ 10 ปีขึ้นไป หรือผู้ปกครองอนุญาตแล้ว', 'you are 10 or older, or a parent or guardian has agreed')}</li>
            </ul>
          </Sec>

          <Sec title={t('ลายยังเป็นของคุณ', 'Your pattern stays yours')}>
            <p>{t('คุณยังเป็นเจ้าของลายที่แชร์ เราได้รับสิทธิ์เพียงเพื่อเก็บ แสดง และให้คนอื่นเปิดใช้ลายนั้นในแอปนี้ จนกว่าคุณจะถอนลายออก',
              'You keep ownership of what you share. We only get permission to store and show it, and to let others use it in this app, until you take it down.')}</p>
          </Sec>

          <Sec title={t('คนอื่นใช้ลายของคุณได้แค่ไหน', 'How others may use your pattern')}>
            <ul>
              <li>{t('ปักหรือพิมพ์ใช้เอง และให้เป็นของขวัญได้', 'stitch or print it for themselves, and give it as a gift')}</li>
              <li>{t('ดัดแปลงและแชร์ต่อได้ โดยต้องให้เครดิตคุณ (แอปใส่ “ดัดแปลงจาก … โดย …” ให้อัตโนมัติ)', 'remix it and share the result, with credit to you (the app adds “Adapted from … by …” automatically)')}</li>
              <li>{t('ห้ามขายลาย หรือขายชิ้นงานที่ทำจากลายในเชิงพาณิชย์ โดยไม่ได้รับอนุญาตจากคุณ', 'not sell the pattern, or sell pieces made from it, without your permission')}</li>
            </ul>
            <p className="hint">{t('เทียบได้กับสัญญาอนุญาต Creative Commons แบบ BY-NC 4.0', 'This is similar to the Creative Commons BY-NC 4.0 licence.')}</p>
          </Sec>

          <Sec title={t('สิ่งที่ห้ามแชร์', 'What not to share')}>
            <ul>
              <li>{t('ตัวการ์ตูน โลโก้ หรือแบรนด์ของคนอื่นที่คุณไม่ได้รับอนุญาต', 'other people’s characters, logos or brands you don’t have permission for')}</li>
              <li>{t('เนื้อหาลามก รุนแรง หรือสร้างความเกลียดชัง', 'sexual, violent or hateful content')}</li>
              <li>{t('ข้อมูลส่วนตัวของคนอื่น เช่น ชื่อเต็ม เบอร์โทร ที่อยู่', 'other people’s personal details, such as full names, phone numbers or addresses')}</li>
              <li>{t('สแปมหรือโฆษณา', 'spam or advertising')}</li>
            </ul>
          </Sec>

          <Sec title={t('การถอนลาย', 'Taking a pattern down')}>
            <p>{t('ถอนลายได้ทุกเมื่อที่หน้าบัญชี ลายจะถูกลบออกจากระบบทันที แต่สำเนาที่คนอื่นบันทึกไว้ในเครื่องของเขาก่อนหน้านั้นยังอยู่ และยังใช้ได้ตามข้อกำหนดนี้',
              'You can take a pattern down at any time from your Account page; it is deleted from our systems right away. Copies other people already saved on their own devices remain, and may still be used under these terms.')}</p>
          </Sec>

          <Sec title={t('การดูแลชุมชน', 'Keeping the community safe')}>
            <p>{t('ทุกคนกด “แจ้งปัญหา” ที่ลายได้ ลายที่ถูกแจ้งจากผู้ใช้ 3 คนขึ้นไปจะถูกซ่อนไว้ก่อน ทีมงานจะตรวจสอบภายใน 7 วัน และอาจลบลาย หรือระงับการแชร์ของบัญชีที่ทำผิดข้อกำหนดซ้ำ',
              'Anyone can use “Report” on a pattern. A pattern reported by 3 or more users is hidden until the team reviews it, within 7 days. We may remove patterns, or stop accounts that repeatedly break these terms from sharing.')}</p>
          </Sec>

          <Sec title={t('แจ้งละเมิดลิขสิทธิ์', 'Copyright complaints')}>
            <p>{t('ถ้าพบลายที่ละเมิดงานของคุณ กด “แจ้งปัญหา” ที่ลายนั้น หรืออีเมลมาที่', 'If a pattern copies your work, use “Report” on it, or email')}{' '}
              <a className="acct-link" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>{' '}
              {t('พร้อมลิงก์ของลาย และหลักฐานว่าคุณเป็นเจ้าของ', 'with the pattern’s link and proof that you own the work.')}</p>
          </Sec>

          <Sec title={t('ไม่มีการรับประกัน', 'No guarantees')}>
            <p>{t('ลายในแกลเลอรีแชร์โดยผู้ใช้ เราไม่รับประกันความถูกต้องของจำนวนด้าย ขนาด หรือผลงานที่ได้',
              'Gallery patterns are shared by users. We don’t guarantee thread amounts, sizes or results.')}</p>
          </Sec>

          <Sec title={t('ติดต่อ', 'Contact')}>
            <p>{t('มีคำถามเกี่ยวกับข้อกำหนดนี้ ติดต่อ AppStack Development ที่', 'Questions about these terms: contact AppStack Development at')}{' '}
              <a className="acct-link" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>{' '}{t('หรือ', 'or')} <FeedbackLink /></p>
            <p className="hint">{t('ดูวิธีที่เราดูแลข้อมูลของคุณได้ใน', 'See how we handle your data in the')} <a className="acct-link" href="#/privacy">{t('นโยบายความเป็นส่วนตัว', 'privacy notice')}</a></p>
          </Sec>
        </article>
      </main>
    </div>
  );
}
