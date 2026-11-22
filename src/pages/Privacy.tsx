import type { ReactNode } from 'react';
import { t } from '../lib/i18n';
import { Icon } from '../components/Icon';
import { LangSwitch } from '../components/LangSwitch';
import { FeedbackLink } from '../components/FeedbackDialog';
import { feedbackEnabled } from '../lib/feedback';
import { APP_NAME } from '../lib/brand';

/** Contact address for privacy requests. Leave empty until there is a real one. */
const CONTACT_EMAIL = 'admin@appstack-dev.io';

const Sec = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="privacy-sec">
    <h3>{title}</h3>
    {children}
  </section>
);

const AccountLink = ({ children }: { children: ReactNode }) => <a className="acct-link" href="#/account">{children}</a>;

export function Privacy() {
  return (
    <div className="privacy-page">
      <header className="site-head">
        <a className="icon-btn" href="#/" title={t('กลับหน้าแรก', 'Back to home')} aria-label={t('กลับหน้าแรก', 'Back to home')}><Icon name="back" /></a>
        <h2><Icon name="shield" size={18} /> {t('ความเป็นส่วนตัว', 'Privacy')}</h2>
        <div className="spacer" />
        <LangSwitch />
      </header>
      <main className="privacy-main">
        <article className="privacy-doc">
          <h1>{t('นโยบายความเป็นส่วนตัว', 'Privacy notice')}</h1>
          <p className="hint">{t('ปรับปรุงล่าสุด 22 พ.ย. 2569', 'Last updated 22 Nov 2026')}</p>
          <p className="privacy-lead">{t(
            'ประกาศนี้อธิบายว่าเราเก็บและใช้ข้อมูลส่วนบุคคลของคุณอย่างไร ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA) สรุปสั้น ๆ: ถ้าไม่เข้าสู่ระบบ เราไม่เก็บข้อมูลส่วนบุคคลของคุณ นอกจากข้อความที่คุณเลือกส่งมาเอง และเรานับสถิติการใช้งานแบบไม่ระบุตัวตน',
            'This notice explains how we collect and use your personal data, in line with Thailand’s Personal Data Protection Act (PDPA). In short: if you don’t sign in, we don’t collect personal data about you, except feedback you choose to send us; we also count anonymous usage statistics.',
          )}</p>

          <Sec title={t('ใครดูแลบริการนี้', 'Who runs this service')}>
            <p>{t(`${APP_NAME} ดำเนินการโดย AppStack Development ซึ่งเป็นผู้ควบคุมข้อมูลส่วนบุคคลของคุณ`,
              `${APP_NAME} is operated by AppStack Development, the data controller for your personal data.`)}</p>
          </Sec>

          <Sec title={t('ใช้งานโดยไม่มีบัญชี', 'Using it without an account')}>
            <p>{t('บัญชีเป็นตัวเลือกเสริม ถ้าไม่เข้าสู่ระบบ ลาย ความคืบหน้า และรายการด้ายทั้งหมดจะเก็บไว้ในเบราว์เซอร์บนเครื่องของคุณเท่านั้น ไม่ถูกส่งมาที่เรา',
              'Accounts are optional. If you don’t sign in, your patterns, progress and thread list stay only in the browser on your device and are never sent to us.')}</p>
          </Sec>

          <Sec title={t('สถิติการใช้งาน (ไม่ระบุตัวตน)', 'Usage statistics (anonymous)')}>
            <p>{t('เราใช้ Vercel Web Analytics นับว่ามีการเปิดหน้าไหนกี่ครั้ง เช่น หน้าแรก หรือขั้นตอนของ “สร้างลายจากรูป” พร้อมข้อมูลทั่วไปอย่างประเทศ ประเภทอุปกรณ์ และเบราว์เซอร์ เพื่อดูว่าส่วนไหนใช้ง่ายหรือยาก',
              'We use Vercel Web Analytics to count how often each screen is opened — for example the home page or the steps of “Pattern from a photo” — with general details such as country, device type and browser, to see which parts are easy or hard to use.')}</p>
            <ul>
              <li>{t('ไม่ใช้คุกกี้ และไม่เก็บข้อมูลที่ระบุตัวคุณได้', 'No cookies, and nothing that identifies you')}</li>
              <li>{t('ไม่ส่งรูป ลาย หรือรหัสลายของคุณ (ที่อยู่หน้าถูกตัดรหัสลายออกก่อนนับ)', 'Your photos, patterns and pattern ids are never sent (ids are removed from the page address before counting)')}</li>
            </ul>
          </Sec>

          <Sec title={t('เมื่อคุณส่งความคิดเห็น', 'When you send feedback')}>
            <p>{t('ถ้าคุณกด “ส่งความคิดเห็น” เราจะเก็บ: ข้อความและประเภทที่คุณเลือก หน้าที่คุณอยู่ ภาษา ประเภทอุปกรณ์และความกว้างหน้าจอ อีเมลเฉพาะเมื่อคุณติ๊กให้ติดต่อกลับ และรหัสบัญชีถ้าคุณเข้าสู่ระบบอยู่ เราใช้ข้อมูลนี้เพื่อปรับปรุงและแก้ปัญหาของแอป และตอบกลับเมื่อคุณขอ',
              'If you use “Send feedback”, we keep: your message and the type you chose, the screen you were on, your language, device type and screen width, your email only if you ask for a reply, and your account id if you’re signed in. We use this to improve and fix the app, and to reply when you ask.')}</p>
          </Sec>

          <Sec title={t('เมื่อคุณสั่งผลิตชิ้นงาน', 'When you order a piece')}>
            <p>{t('การสั่งผลิตต้องเข้าสู่ระบบ เมื่อคุณสั่ง เราจะเก็บ: สำเนาลาย (ไม่มีความคืบหน้าการปัก) ตัวเลือกและราคา ชื่อผู้รับ เบอร์โทร ที่อยู่จัดส่ง ข้อความที่คุณเขียนถึงร้าน รูปสลิปการโอน และเลขพัสดุ ทั้งหมดผูกกับบัญชีของคุณ',
              'Ordering needs an account. When you order, we keep: a copy of the pattern (without your stitching progress), your options and the price, the recipient’s name, phone number and delivery address, the messages you write to the shop, your payment slip image, and the tracking number, all linked to your account.')}</p>
            <p>{t('ออเดอร์ทุกใบผลิตโดยร้านที่คุณเลือก ซึ่งอาจเป็นร้านของทีม XStitch.Design หรือร้านของผู้ใช้คนอื่นที่เปิดรับผลิต เมื่อคุณสั่ง ร้านนั้นจะเห็นลาย ตัวเลือก ข้อความ สลิป และชื่อ เบอร์โทร และที่อยู่จัดส่งของคุณ เพื่อผลิตและจัดส่งออเดอร์นั้นเท่านั้น ร้านเห็นชื่อ เบอร์โทร และที่อยู่ได้จนถึง 30 วันหลังออเดอร์ปิด หลังจากนั้นเห็นเฉพาะรายละเอียดออเดอร์ ร้านอื่นและผู้ใช้อื่นไม่เห็นข้อมูลนี้ ทีมงานเห็นเฉพาะออเดอร์ของร้านทีม และออเดอร์ที่มีการแจ้งปัญหา',
              'Every order is made by the shop you choose: the XStitch.Design team’s shop, or another user’s shop. That shop sees the pattern, your options, messages and slip, and your name, phone and delivery address, to make and send that order only. It sees your name, phone and address until 30 days after the order closes, and only the order details after that. Other shops and users never see them. Our team sees only the team shop’s orders and orders reported to us.')}</p>
            <p>{t('ร้านที่ไม่ใช่ร้านทีมเป็นผู้ขายอิสระ ไม่ใช่พนักงานของเรา ทุกร้านยอมรับข้อกำหนดผู้ขายว่าจะใช้ข้อมูลของคุณเฉพาะเพื่อออเดอร์นั้น ไม่นำไปใช้หรือส่งต่อเพื่ออย่างอื่น ที่อยู่และเบอร์โทรจะส่งต่อให้บริษัทขนส่งเฉพาะที่จำเป็นต่อการส่งพัสดุ รูปสลิปเก็บแบบส่วนตัว ไม่มีลิงก์สาธารณะ',
              'Shops other than the team’s are independent sellers, not our staff. Every shop accepts the seller terms: it uses your details for that order only and never for anything else or to pass on. Your name, address and phone number go to the delivery company only as needed to deliver the parcel. Slip images are stored privately, with no public link.')}</p>
            <p>{t('เราส่งอีเมลแจ้งความคืบหน้าของออเดอร์ไปที่อีเมลบัญชี Google ของคุณ เช่น ได้รับออเดอร์ ร้านตอบรับ ยืนยันการชำระเงิน จัดส่งแล้วพร้อมเลขพัสดุ และเมื่อร้านตอบข้อความ อีเมลมีรหัสออเดอร์ ชื่อลาย ชื่อร้าน ยอดเงิน เลขพัสดุ และข้อความจากร้าน ไม่มีที่อยู่หรือเบอร์โทร อีเมลส่งผ่าน Resend ผู้ให้บริการส่งอีเมล ซึ่งเซิร์ฟเวอร์อาจอยู่นอกประเทศไทย',
              'We email updates about your order to your Google account’s address: order received, accepted by the shop, payment confirmed, shipped with tracking number, and when the shop replies. The emails include the order code, pattern name, shop name, amount, tracking number and the shop’s message, never your address or phone number. They’re sent through Resend, an email delivery provider whose servers may be outside Thailand.')}</p>
            <p>{t('ข้อมูลการสั่งซื้อเก็บไว้ไม่เกิน 2 ปี เพื่อดูแลหลังการขายและทำบัญชี แม้คุณลบบัญชีแล้ว ออเดอร์จะยังอยู่ในระบบแต่ไม่ผูกกับบัญชีอีกต่อไป ถ้าต้องการให้ลบเร็วกว่านั้น ติดต่อเราตามช่องทางด้านล่าง',
              'Order records are kept for at most 2 years, for after-sales care and bookkeeping. If you delete your account, your orders stay but are no longer linked to it. To have them deleted sooner, contact us using the details below.')}</p>
          </Sec>

          <Sec title={t('เมื่อคุณเปิดร้านรับผลิต', 'When you open a shop')}>
            <p>{t('เราเก็บชื่อร้าน คำแนะนำร้าน ราคา ค่าส่ง ระยะเวลาผลิต และพร้อมเพย์กับชื่อบัญชีของร้าน ชื่อร้าน ราคา และจำนวนออเดอร์ที่ส่งสำเร็จแสดงต่อสาธารณะ พร้อมเพย์และชื่อบัญชีแสดงเฉพาะลูกค้าที่ร้านรับออเดอร์แล้วและกำลังรอชำระเงิน อีเมลแจ้งออเดอร์ใหม่และข้อความจากลูกค้าส่งไปที่อีเมลบัญชี Google ของเจ้าของร้าน ซึ่งลูกค้าไม่เห็น',
              'We keep your shop’s name, description, prices, shipping fee, lead time, and PromptPay with its account name. The shop name, prices and number of delivered orders are public. PromptPay and the account name are shown only to customers whose order you’ve accepted and who are about to pay. Emails about new orders and customer messages go to the shop owner’s Google account email, which customers don’t see.')}</p>
          </Sec>

          <Sec title={t('ข้อมูลที่เราเก็บ (เฉพาะเมื่อเข้าสู่ระบบ)', 'What we collect (only when you sign in)')}>
            <ul>
              <li>{t('ชื่อ อีเมล และรูปโปรไฟล์จากบัญชี Google ของคุณ', 'Your name, email address and profile picture from your Google account')}</li>
              <li>{t('ลายปักของคุณ รวมถึงความคืบหน้าการปัก', 'Your patterns, including your stitching progress')}</li>
              <li>{t('รายการ “ด้ายของฉัน”', 'Your “My threads” list')}</li>
              <li>{t('ภาษาที่คุณเลือกใช้', 'Your language preference')}</li>
              <li>{t('ถ้าคุณแชร์ลายในชุมชน: ชื่อที่แสดงที่คุณตั้งเอง ลายที่แชร์ และลายที่คุณกดหัวใจ', 'If you share in the community: the display name you choose, the patterns you share, and the patterns you like')}</li>
            </ul>
          </Sec>

          <Sec title={t('เราใช้ข้อมูลเพื่ออะไร', 'Why we use it')}>
            <p>{t('เพื่อซิงก์งานของคุณระหว่างอุปกรณ์ สำรองไว้ไม่ให้หาย และแสดงลายที่คุณเลือกแชร์ในชุมชน เท่านั้น เราประมวลผลข้อมูลนี้ตามความยินยอมของคุณเมื่อคุณเลือกเข้าสู่ระบบและเลือกแชร์',
              'Only to sync your work between your devices, keep a backup of it, and show the patterns you choose to share in the community. We process this data based on the consent you give when you choose to sign in and to share.')}</p>
          </Sec>

          <Sec title={t('ลายที่คุณแชร์ในชุมชนเป็นสาธารณะ', 'What you share in the community is public')}>
            <ul>
              <li>{t('ทุกคน รวมถึงคนที่ไม่ได้เข้าสู่ระบบ เห็นลาย ชื่อลาย คำอธิบาย หมวด วันที่แชร์ จำนวนหัวใจ และชื่อที่แสดงของคุณ', 'Anyone, signed in or not, can see the pattern, its title, description, categories, date, number of likes and your display name')}</li>
              <li>{t('เราไม่แสดงอีเมล ชื่อ หรือรูปจากบัญชี Google ของคุณในชุมชน และไม่บอกใครว่าใครกดหัวใจลายไหน', 'We never show your email, Google name or picture in the community, and never show who liked what')}</li>
              <li>{t('ความคืบหน้าการปักและรายการด้ายของคุณไม่ถูกแชร์', 'Your stitching progress and thread list are never shared')}</li>
              <li>{t('ถอนลายได้ทุกเมื่อที่หน้าบัญชี ข้อมูลลายจะถูกลบทันที แต่สำเนาที่คนอื่นบันทึกไว้ก่อนแล้วยังอยู่ในเครื่องของเขา', 'Take a pattern down any time on your Account page; it is deleted right away, but copies others already saved stay on their devices')}</li>
            </ul>
            <p>{t('ดูเงื่อนไขการแชร์ทั้งหมดได้ที่', 'See the full rules in the')} <a className="acct-link" href="#/terms">{t('ข้อกำหนดการแชร์', 'sharing terms')}</a></p>
          </Sec>

          <Sec title={t('สิ่งที่เราไม่ทำ', 'What we don’t do')}>
            <ul>
              <li>{t('ไม่มีโฆษณา และไม่ขายหรือแบ่งปันข้อมูลของคุณเพื่อการตลาด', 'No ads, and we never sell or share your data for marketing')}</li>
              <li>{t('ไม่ใช้คุกกี้ติดตามพฤติกรรม', 'No tracking cookies')}</li>
            </ul>
            <p>{t('เราใช้พื้นที่จัดเก็บในเบราว์เซอร์ (local storage) เพื่อเก็บงานของคุณและสถานะการเข้าสู่ระบบไว้บนเครื่องนี้เท่านั้น',
              'We use your browser’s local storage only to keep your work and your sign-in session on this device.')}</p>
          </Sec>

          <Sec title={t('ข้อมูลเก็บไว้ที่ไหน', 'Where it’s stored')}>
            <p>{t('ข้อมูลในบัญชีเก็บไว้กับ Supabase ผู้ให้บริการฐานข้อมูลบนคลาวด์ ซึ่งเซิร์ฟเวอร์อาจอยู่นอกประเทศไทย ส่วนการเข้าสู่ระบบดำเนินการโดย Google ผู้ให้บริการทั้งสองรายใช้ข้อมูลเพื่อให้บริการนี้แทนเราเท่านั้น',
              'Account data is stored with Supabase, a cloud database provider whose servers may be outside Thailand. Sign-in is handled by Google. Both act only to provide this service on our behalf.')}</p>
            <p>{t('อีเมลแจ้งเรื่องออเดอร์ส่งผ่าน Resend ซึ่งใช้ข้อมูลเพื่อส่งอีเมลแทนเราเท่านั้น', 'Order emails are delivered by Resend, which uses the data only to deliver them on our behalf.')}</p>
            <p>{t('ความคิดเห็นที่ส่งมาเก็บไว้กับ Supabase เช่นกัน ส่วนสถิติการใช้งานแบบไม่ระบุตัวตนประมวลผลโดย Vercel ผู้ให้บริการโฮสต์เว็บไซต์',
              'Feedback is also stored with Supabase. Anonymous usage statistics are processed by Vercel, which hosts the website.')}</p>
          </Sec>

          <Sec title={t('เก็บไว้นานแค่ไหน', 'How long we keep it')}>
            <p>{t('จนกว่าคุณจะลบข้อมูลนั้น หรือลบบัญชี เมื่อลบบัญชี ข้อมูลทั้งหมดในระบบจะถูกลบถาวร',
              'Until you delete it or delete your account. Deleting your account permanently removes all of its data from our systems.')}</p>
            <p>{t('ความคิดเห็นเก็บไว้จนกว่าเราจะจัดการเสร็จ หรือไม่เกิน 2 ปี ถ้าต้องการให้ลบความคิดเห็นที่เคยส่ง ติดต่อเราตามช่องทางด้านล่าง',
              'Feedback is kept until we’ve dealt with it, for at most 2 years. To have feedback you sent deleted, contact us using the details below.')}</p>
          </Sec>

          <Sec title={t('สิทธิของคุณ', 'Your rights')}>
            <p>{t('คุณมีสิทธิตามกฎหมาย PDPA และทำได้เองทั้งหมดที่', 'Under the PDPA you have these rights, and you can use them yourself on the')}{' '}
              <AccountLink>{t('หน้าบัญชี', 'Account page')}</AccountLink>:</p>
            <ul>
              <li>{t('ขอเข้าถึงและรับสำเนาข้อมูล: กด “ดาวน์โหลดข้อมูลของฉัน”', 'Access and get a copy of your data: use “Download my data”')}</li>
              <li>{t('แก้ไขข้อมูล: แก้ลายและรายการด้ายได้ในแอป ส่วนชื่อและรูปมาจากบัญชี Google ของคุณ', 'Correct your data: edit your patterns and thread list in the app; your name and picture come from your Google account')}</li>
              <li>{t('ลบข้อมูล: ลบลายแต่ละลาย หรือกด “ลบบัญชี” เพื่อลบทั้งหมด', 'Delete your data: delete individual patterns, or use “Delete account” to remove everything')}</li>
              <li>{t('ถอนความยินยอม: ลบบัญชีได้ทุกเมื่อ', 'Withdraw your consent: delete your account at any time')}</li>
            </ul>
            <p>{t('หากเห็นว่าเราใช้ข้อมูลไม่ถูกต้อง คุณร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล (สคส.) ได้',
              'If you believe we have mishandled your data, you can complain to Thailand’s Personal Data Protection Committee (PDPC).')}</p>
          </Sec>

          <Sec title={t('ติดต่อเรา', 'Contact')}>
            {CONTACT_EMAIL ? (
              <p>{t('มีคำถามเรื่องข้อมูลส่วนบุคคล ติดต่อ AppStack Development ได้ที่', 'For questions about your personal data, contact AppStack Development at')}{' '}
                <a className="acct-link" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>{' '}
                {feedbackEnabled && <>{t('หรือ', 'or')} <FeedbackLink /></>}</p>
            ) : (
              <p>{t(<>สิทธิส่วนใหญ่ใช้ได้เองทันทีที่<AccountLink>หน้าบัญชี</AccountLink> หากมีคำถามอื่น ติดต่อผู้ดูแลเว็บไซต์ (AppStack Development) ผ่านช่องทางติดต่อหรือส่งความคิดเห็นของเว็บไซต์</>,
                <>You can use most of your rights yourself on the <AccountLink>Account page</AccountLink>. For anything else, contact the site owner (AppStack Development) through the site’s contact or feedback channel.</>)}</p>
            )}
          </Sec>
        </article>
      </main>
    </div>
  );
}
