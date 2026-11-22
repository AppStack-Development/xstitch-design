import type { ReactNode } from 'react';
import { t } from '../lib/i18n';
import { Icon } from '../components/Icon';
import { LangSwitch } from '../components/LangSwitch';
import { APP_NAME } from '../lib/brand';
import { SELLER_TERMS_VERSION } from '../lib/shops';

const CONTACT_EMAIL = 'admin@appstack-dev.io';

const Sec = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="privacy-sec">
    <h3>{title}</h3>
    {children}
  </section>
);

/**
 * "ข้อกำหนดผู้ขาย" (#/seller-terms): what a shop agrees to when it opens (docs/marketplace.md).
 * Every shop records SELLER_TERMS_VERSION; when this text changes in substance, bump it.
 */
export function SellerTerms() {
  return (
    <div className="privacy-page">
      <header className="site-head">
        <a className="icon-btn" href="#/shop" title={t('กลับไปหน้าร้าน', 'Back to your shop')} aria-label={t('กลับไปหน้าร้าน', 'Back to your shop')}><Icon name="back" /></a>
        <h2><Icon name="cube" size={18} /> {t('ข้อกำหนดผู้ขาย', 'Seller terms')}</h2>
        <div className="spacer" />
        <LangSwitch />
      </header>
      <main className="privacy-main">
        <article className="privacy-doc">
          <h1>{t('ข้อกำหนดสำหรับร้านรับผลิต', 'Terms for shops')}</h1>
          <p className="hint">{t(`ฉบับ ${SELLER_TERMS_VERSION} · ปรับปรุงล่าสุด 22 พ.ย. 2569`, `Version ${SELLER_TERMS_VERSION} · last updated 22 Nov 2026`)}</p>
          <p className="privacy-lead">{t(
            `ข้อกำหนดนี้ใช้เมื่อคุณเปิดร้านบน ${APP_NAME} (ดำเนินการโดย AppStack Development) เพื่อรับผลิตลายปักให้ลูกค้า ร้านของคุณเป็นผู้ขายอิสระ ไม่ใช่พนักงานหรือตัวแทนของเรา`,
            `These terms apply when you open a shop on ${APP_NAME} (run by AppStack Development) to make cross-stitch pieces for customers. Your shop is an independent seller, not our employee or agent.`,
          )}</p>

          <Sec title={t('บทบาทของเว็บ', 'What the site does')}>
            <ul>
              <li>{t('เว็บเป็นพื้นที่ให้ลูกค้าเห็นร้าน สั่งผลิต และติดตามออเดอร์กับร้าน การซื้อขายเป็นสัญญาระหว่างร้านกับลูกค้าโดยตรง', 'The site is where customers find shops, order and follow their orders. Each sale is a contract between your shop and the customer.')}</li>
              <li>{t('ลูกค้าโอนเงินเข้าพร้อมเพย์ของร้านโดยตรง เว็บไม่ได้รับหรือถือเงินแทน และตอนนี้ไม่เก็บค่าธรรมเนียม ถ้าจะเริ่มเก็บค่าธรรมเนียม เราจะแจ้งล่วงหน้าอย่างน้อย 30 วัน', 'Customers pay your PromptPay directly; the site never takes or holds the money, and charges no fee for now. If that changes, we’ll tell you at least 30 days ahead.')}</li>
              <li>{t('ร้านรับผิดชอบภาษี ใบอนุญาต และหน้าที่ตามกฎหมายของการขายเอง', 'Your shop is responsible for its own taxes, licences and legal duties as a seller.')}</li>
            </ul>
          </Sec>

          <Sec title={t('ราคาและการรับออเดอร์', 'Prices and taking orders')}>
            <ul>
              <li>{t('ราคาที่ร้านตั้งในเว็บ รวมค่าส่ง คือยอดที่ลูกค้าจ่าย ห้ามเรียกเก็บเพิ่มนอกยอดในออเดอร์ หรือขอให้โอนช่องทางอื่น', 'The prices you set on the site, shipping included, are what the customer pays. Don’t charge anything beyond the order’s total or ask for payment another way.')}</li>
              <li>{t('ตอบรับหรือปฏิเสธออเดอร์ภายใน 3 วัน ถ้าปฏิเสธ ให้บอกเหตุผล ออเดอร์ที่ไม่ตอบภายใน 3 วันจะถูกยกเลิกอัตโนมัติ ปิดรับชั่วคราวได้ในตั้งค่าร้านเมื่อคิวเต็มหรือไม่อยู่', 'Accept or decline each order within 3 days, giving a reason if you decline; unanswered orders are cancelled automatically after 3 days. Close your shop for a while in the settings when you’re full or away.')}</li>
              <li>{t('ลูกค้ามีเวลาโอน 2 วันหลังร้านรับออเดอร์ (หรือหลังร้านแจ้งว่าสลิปไม่ถูกต้อง) ถ้าไม่โอน ออเดอร์จะถูกยกเลิกอัตโนมัติ', 'Customers have 2 days to pay after you accept (or after you turn a slip down); unpaid orders are then cancelled automatically.')}</li>
              <li>{t('ร้านใหม่มีออเดอร์ที่ยังไม่ปิดได้ครั้งละ 3 ออเดอร์ จนส่งสำเร็จครบ 3 ออเดอร์แรก', 'A new shop holds up to 3 open orders at a time until it has delivered 3.')}</li>
            </ul>
          </Sec>

          <Sec title={t('การผลิตและจัดส่ง', 'Making and sending')}>
            <ul>
              <li>{t('ผลิตตามลาย ขนาด และตัวเลือกในออเดอร์ เริ่มผลิตหลังยืนยันว่าได้รับเงินแล้ว ส่งภายในระยะเวลาที่ร้านแจ้งไว้ และใส่เลขพัสดุในหน้าออเดอร์', 'Make exactly the pattern, size and options on the order; start once you’ve confirmed the payment; send within the lead time you show; and add the tracking number on the order page.')}</li>
              <li>{t('ตอบข้อความลูกค้าในหน้าออเดอร์อย่างสม่ำเสมอ', 'Answer customers’ messages on the order page promptly.')}</li>
            </ul>
          </Sec>

          <Sec title={t('ยกเลิก คืนเงิน และแก้ปัญหา', 'Cancelling, refunds and putting things right')}>
            <ul>
              <li>{t('ถ้าร้านยกเลิกออเดอร์ที่ลูกค้าชำระแล้ว ต้องคืนเงินเต็มจำนวนก่อนกดยกเลิก และบอกเหตุผล', 'If you cancel a paid order, refund it in full first, then cancel with a reason.')}</li>
              <li>{t('ลูกค้าที่ชำระแล้วแต่ร้านยังไม่เริ่มผลิต ขอยกเลิกได้ ร้านต้องคืนเงินเต็มจำนวน', 'A customer who has paid may cancel before you start making it; refund them in full.')}</li>
              <li>{t('ถ้าชิ้นงานเสียหายระหว่างขนส่ง ผลิตผิด หรือไม่ตรงกับออเดอร์ และลูกค้าแจ้งภายใน 7 วันหลังได้รับ พร้อมรูปถ่าย ร้านต้องผลิตใหม่และส่งให้ฟรี หรือคืนเงิน ตามที่ลูกค้าเลือก', 'If a piece is damaged in transit, made wrongly, or doesn’t match the order, and the customer tells you within 7 days of receiving it with photos, make a new one and send it free, or refund, whichever the customer prefers.')}</li>
            </ul>
          </Sec>

          <Sec title={t('ข้อมูลของลูกค้า', 'Customers’ information')}>
            <ul>
              <li>{t('ร้านเห็นชื่อ เบอร์โทร ที่อยู่ สลิป และลายของลูกค้าเฉพาะออเดอร์ของร้าน ใช้ได้เพื่อผลิต จัดส่ง และดูแลออเดอร์นั้นเท่านั้น', 'You see a customer’s name, phone, address, slip and pattern only for your orders. Use them only to make, send and look after that order.')}</li>
              <li>{t('ห้ามนำไปใช้ทำการตลาด ขาย หรือส่งต่อให้คนอื่น นอกจากบริษัทขนส่งเท่าที่จำเป็นต่อการส่งพัสดุ ลบข้อมูลที่คัดลอกเก็บไว้เมื่อหมดความจำเป็น', 'Never use them for marketing, sell them or pass them on, except to the delivery company as needed for the parcel. Delete any copies once you no longer need them.')}</li>
              <li>{t('เว็บซ่อนชื่อ เบอร์โทร และที่อยู่จากร้าน 30 วันหลังออเดอร์ปิด ข้อมูลที่ร้านคัดลอกเก็บเองอยู่ในความรับผิดชอบของร้านตามกฎหมายคุ้มครองข้อมูลส่วนบุคคล', 'The site hides the name, phone and address from you 30 days after an order closes. Copies you keep yourself are your responsibility under the Personal Data Protection Act.')}</li>
            </ul>
          </Sec>

          <Sec title={t('ลายของลูกค้า', 'Customers’ designs')}>
            <ul>
              <li>{t('ใช้ลายของลูกค้าได้เฉพาะเพื่อผลิตออเดอร์นั้น ห้ามขาย แจก หรือเผยแพร่ต่อโดยไม่ได้รับอนุญาตจากเจ้าของลาย', 'Use a customer’s design only to make their order. Never sell, give away or publish it without its owner’s permission.')}</li>
              <li>{t('ร้านปฏิเสธลายที่ใช้ตัวการ์ตูน โลโก้ หรือแบรนด์ของคนอื่นโดยไม่ได้รับอนุญาต หรือมีเนื้อหาไม่เหมาะสมได้', 'You may decline designs that use other people’s characters, logos or brands without permission, or that have inappropriate content.')}</li>
            </ul>
          </Sec>

          <Sec title={t('รีวิวและการแจ้งปัญหา', 'Reviews and reports')}>
            <ul>
              <li>{t('ลูกค้ารีวิวร้านได้หลังได้รับของ รีวิวและคะแนนเฉลี่ยแสดงในหน้าร้าน ร้านตอบรีวิวได้หนึ่งครั้ง', 'Customers can review your shop after receiving an order. Reviews and your average rating appear on your shop page; you may reply to each once.')}</li>
              <li>{t('ลูกค้าแจ้งปัญหาร้านถึงทีมได้ เมื่อแจ้งเรื่องออเดอร์ ทีมจะเห็นออเดอร์ ข้อความ และสลิปของออเดอร์นั้นเพื่อดูเรื่อง', 'Customers can report your shop to the team; for a reported order, the team sees that order, its messages and slip to look into it.')}</li>
            </ul>
          </Sec>

          <Sec title={t('การระงับร้าน', 'Suspension')}>
            <p>{t('ถ้ามีการแจ้งปัญหา ร้านไม่ส่งของหรือไม่คืนเงินตามข้อกำหนด หรือทำผิดข้อกำหนดนี้ ทีมงานอาจดูประวัติออเดอร์และข้อความที่เกี่ยวข้อง และระงับร้านได้ ร้านที่ถูกระงับจะไม่ได้รับออเดอร์ใหม่ แต่ยังต้องทำออเดอร์ที่ค้างอยู่ให้เสร็จหรือคืนเงิน',
              'If a shop is reported, doesn’t send or refund as these terms say, or breaks them, our team may look at the orders and messages involved and suspend the shop. A suspended shop gets no new orders but must still finish or refund the ones it has.')}</p>
          </Sec>

          <Sec title={t('การเปลี่ยนแปลงและการติดต่อ', 'Changes and contact')}>
            <p>{t('ถ้าข้อกำหนดนี้เปลี่ยนในสาระสำคัญ เราจะแจ้งในเว็บก่อนมีผล ติดต่อเราได้ที่', 'If these terms change in substance, we’ll say so on the site before it takes effect. Contact us at')}{' '}
              <a className="acct-link" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
          </Sec>
        </article>
      </main>
    </div>
  );
}
