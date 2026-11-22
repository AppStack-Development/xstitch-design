import type { ReactNode } from 'react';
import { t } from '../lib/i18n';
import { Icon } from '../components/Icon';
import { LangSwitch } from '../components/LangSwitch';
import { APP_NAME } from '../lib/brand';
import { ORDER_TERMS_VERSION } from '../lib/orders';

const CONTACT_EMAIL = 'admin@appstack-dev.io';

const Sec = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="privacy-sec">
    <h3>{title}</h3>
    {children}
  </section>
);

/**
 * "เงื่อนไขการสั่งซื้อ" (#/order-terms): what a customer agrees to when ordering a printed piece.
 * Every order records ORDER_TERMS_VERSION; when this text changes in substance, bump it.
 */
export function OrderTerms() {
  return (
    <div className="privacy-page">
      <header className="site-head">
        <a className="icon-btn" href="#/account" title={t('กลับไปหน้าของฉัน', 'Back to My stuff')} aria-label={t('กลับไปหน้าของฉัน', 'Back to My stuff')}><Icon name="back" /></a>
        <h2><Icon name="cube" size={18} /> {t('เงื่อนไขการสั่งซื้อ', 'Order terms')}</h2>
        <div className="spacer" />
        <LangSwitch />
      </header>
      <main className="privacy-main">
        <article className="privacy-doc">
          <h1>{t('เงื่อนไขการสั่งผลิตชิ้นงาน', 'Terms for ordering a piece')}</h1>
          <p className="hint">{t(`ฉบับ ${ORDER_TERMS_VERSION} · ปรับปรุงล่าสุด 22 พ.ย. 2569`, `Version ${ORDER_TERMS_VERSION} · last updated 22 Nov 2026`)}</p>
          <p className="privacy-lead">{t(
            `เงื่อนไขนี้ใช้เมื่อคุณสั่งผลิตลายผ่าน ${APP_NAME} ซึ่งดำเนินการโดย AppStack Development ทุกออเดอร์ผลิตโดยร้านที่คุณเลือก ซึ่งอาจเป็นร้านของทีม ${APP_NAME} หรือร้านของผู้ใช้คนอื่นที่เปิดรับผลิต ทุกชิ้นผลิตตามลายที่คุณส่งมาโดยเฉพาะ`,
            `These terms apply when you have a pattern made through ${APP_NAME}, run by AppStack Development. Every order is made by the shop you choose: the ${APP_NAME} team’s shop, or another user’s shop. Every piece is made to order from the pattern you send.`,
          )}</p>

          <Sec title={t('ใครเป็นผู้ขาย', 'Who sells to you')}>
            <ul>
              <li>{t('ร้านที่คุณเลือกเป็นผู้ขายและรับผิดชอบการผลิต จัดส่ง การคืนเงิน และการแก้ปัญหาของออเดอร์นั้น ชื่อร้านแสดงในหน้าออเดอร์', 'The shop you choose is the seller and is responsible for making, sending, refunding and putting right your order. Its name is on your order page.')}</li>
              <li>{t(`ร้านอื่นนอกจากร้านทีม เป็นผู้ขายอิสระ ${APP_NAME} เป็นเพียงพื้นที่ให้สั่งผลิตและติดตามออเดอร์ ไม่ได้เป็นคู่สัญญาซื้อขาย ไม่ได้รับเงินแทนร้าน และไม่เก็บค่าธรรมเนียมจากคุณ`,
                `Shops other than the team’s are independent sellers. ${APP_NAME} only provides the place to order and follow your order; it isn’t a party to the sale, doesn’t take the money for the shop, and charges you no fee.`)}</li>
              <li>{t('ทุกร้านยอมรับข้อกำหนดผู้ขาย เช่น ผลิตตามลายและตัวเลือกในออเดอร์ ใช้ข้อมูลของคุณเฉพาะเพื่อออเดอร์นั้น และคืนเงินเมื่อยกเลิกออเดอร์ที่ชำระแล้ว', 'Every shop accepts the seller terms: making what your order says, using your details for that order only, and refunding a paid order it cancels.')}</li>
            </ul>
          </Sec>

          <Sec title={t('สินค้าและราคา', 'The piece and the price')}>
            <ul>
              <li>{t('ราคาที่เห็นก่อนกดสั่งคือราคาที่ต้องจ่าย รวมค่าจัดส่งของร้านแล้ว และล็อกไว้ในออเดอร์ แม้ร้านจะเปลี่ยนราคาภายหลัง', 'The price shown before you order is what you pay, the shop’s shipping included, and it stays fixed on your order even if the shop changes its prices later.')}</li>
              <li>{t('ชิ้นงานพิมพ์ 3D มีลายเส้นชั้นพิมพ์เล็ก ๆ ตามธรรมชาติ สีพลาสติก ผ้า และด้ายจริงอาจต่างจากที่เห็นบนจอเล็กน้อย', '3D printed pieces have fine layer lines by nature, and real plastic, fabric and thread colours can look a little different from your screen.')}</li>
              <li>{t('สิ่งที่อยู่ในชุดปักเองเป็นไปตามคำอธิบายของสินค้าและของร้านตอนสั่ง', 'What a kit includes is as the product and the shop described it when you ordered.')}</li>
            </ul>
          </Sec>

          <Sec title={t('การตอบรับและการชำระเงิน', 'Acceptance and payment')}>
            <ul>
              <li>{t('ร้านจะตอบรับหรือปฏิเสธออเดอร์ภายใน 3 วัน (ร้านทีมตอบรับให้ทันที) ถ้าร้านไม่ตอบภายใน 3 วัน ออเดอร์จะถูกยกเลิกอัตโนมัติ อย่าเพิ่งโอนเงินจนกว่าร้านจะตอบรับ', 'The shop accepts or declines within 3 days (the team’s shop accepts straight away); if it doesn’t answer in 3 days, the order is cancelled automatically. Don’t pay until the shop has accepted.')}</li>
              <li>{t('เมื่อร้านตอบรับแล้ว ชำระผ่านพร้อมเพย์ของร้านตามยอดในหน้าออเดอร์ เงินเข้าบัญชีร้านโดยตรง แล้วแนบสลิปในหน้าเดียวกัน', 'Once accepted, pay the shop’s PromptPay for the amount on your order page; the money goes straight to the shop. Then attach the slip on the same page.')}</li>
              <li>{t('ชำระเฉพาะตามยอดและพร้อมเพย์ที่แสดงในหน้าออเดอร์เท่านั้น ถ้าร้านขอให้โอนช่องทางอื่นหรือยอดอื่น แจ้งปัญหากับเราได้', 'Pay only the amount and PromptPay shown on your order page. If a shop asks you to pay another way or another amount, report it to us.')}</li>
              <li>{t('ร้านเริ่มผลิตหลังยืนยันการชำระเงินแล้วเท่านั้น ออเดอร์ที่ไม่ชำระภายใน 2 วันหลังร้านตอบรับ (หรือหลังร้านแจ้งว่าสลิปไม่ถูกต้อง) จะถูกยกเลิกอัตโนมัติ', 'The shop starts once the payment is confirmed. An order not paid within 2 days of being accepted (or of a slip being turned down) is cancelled automatically.')}</li>
            </ul>
          </Sec>

          <Sec title={t('การผลิตและจัดส่ง', 'Making and delivery')}>
            <ul>
              <li>{t('ระยะเวลาผลิตเป็นไปตามที่ร้านแจ้งไว้ตอนสั่ง ร้านจะแจ้งเลขพัสดุในหน้าออเดอร์เมื่อส่งแล้ว', 'Making takes the time the shop showed when you ordered. The shop posts the tracking number on your order page once it’s sent.')}</li>
              <li>{t('ตอนนี้จัดส่งเฉพาะในประเทศไทย', 'For now, delivery is within Thailand only.')}</li>
              <li>{t('โปรดตรวจชื่อ เบอร์โทร และที่อยู่ให้ถูกต้อง ถ้าพัสดุตีกลับเพราะที่อยู่ไม่ถูกต้อง ค่าส่งรอบใหม่เป็นของผู้สั่ง', 'Please check your name, phone and address. If a parcel comes back because the address was wrong, the cost of sending it again is yours.')}</li>
            </ul>
          </Sec>

          <Sec title={t('การยกเลิก', 'Cancelling')}>
            <ul>
              <li>{t('ก่อนชำระเงิน ยกเลิกได้เองทันทีในหน้าออเดอร์', 'Before you pay, cancel any time on your order page.')}</li>
              <li>{t('ชำระแล้วแต่ร้านยังไม่เริ่มผลิต ขอยกเลิกกับร้านได้ในหน้าออเดอร์ ร้านจะคืนเงินเต็มจำนวน', 'Paid but not yet in production: ask the shop on your order page and it refunds you in full.')}</li>
              <li>{t('เมื่อสถานะเป็น “กำลังผลิต” แล้ว ยกเลิกได้เมื่อร้านยินยอมเท่านั้น เพราะชิ้นงานทำตามลายของคุณโดยเฉพาะ', 'Once the status is “In production” it can be cancelled only if the shop agrees, because the piece is made just for you.')}</li>
              <li>{t('ถ้าร้านยกเลิกออเดอร์ที่ชำระแล้ว ร้านต้องคืนเงินเต็มจำนวนก่อน และแจ้งเหตุผลในหน้าออเดอร์', 'If the shop cancels a paid order, it must refund you in full first and give its reason on your order page.')}</li>
            </ul>
          </Sec>

          <Sec title={t('ชิ้นงานเสียหายหรือไม่ตรงลาย', 'If something’s wrong')}>
            <p>{t('ถ้าชิ้นงานเสียหายระหว่างขนส่ง ผลิตผิด หรือไม่ตรงกับลายและตัวเลือกในออเดอร์ แจ้งร้านในหน้าออเดอร์ภายใน 7 วันหลังได้รับ พร้อมรูปถ่ายชิ้นงานและกล่อง ร้านต้องผลิตใหม่และส่งให้ฟรี หรือคืนเงิน ตามที่คุณเลือก ชิ้นงานทุกชิ้นผลิตตามลายของคุณโดยเฉพาะ จึงไม่รับคืนกรณีเปลี่ยนใจ เว้นแต่กฎหมายกำหนดไว้เป็นอย่างอื่น',
              'If the piece is damaged in transit, made wrongly, or doesn’t match the pattern and options on your order, tell the shop on the order page within 7 days of receiving it, with photos of the piece and the box. The shop must make a new one and send it free, or refund you, whichever you prefer. Every piece is made to your own pattern, so change-of-mind returns aren’t accepted, except where the law says otherwise.')}</p>
          </Sec>

          <Sec title={t('เมื่อมีปัญหากับร้าน', 'Problems with a shop')}>
            <ul>
              <li>{t('คุยกับร้านในข้อความของออเดอร์ก่อน ถ้าตกลงกันไม่ได้ หรือร้านไม่ตอบ ไม่ส่งของ หรือไม่คืนเงิน แจ้งเราได้ทางอีเมลด้านล่าง พร้อมรหัสออเดอร์', 'Talk to the shop in the order’s messages first. If you can’t agree, or the shop doesn’t answer, send, or refund, email us below with your order code.')}</li>
              <li>{t('หรือกด “แจ้งทีม” ในหน้าออเดอร์ ทีมจะเห็นออเดอร์ ข้อความ และสลิปของออเดอร์นั้น (ไม่เห็นที่อยู่) แล้วอาจระงับร้านที่ทำผิดข้อกำหนด แต่เราไม่ได้ถือเงินของออเดอร์ จึงไม่สามารถคืนเงินแทนร้านได้ ยกเว้นออเดอร์ของร้านทีม', 'Or tap “Tell the team” on the order page: the team then sees that order, its messages and slip (not your address) and may suspend a shop that broke the terms. We don’t hold the money, so we can’t refund on a shop’s behalf, except for orders from the team’s shop.')}</li>
              <li>{t('หลังได้รับของ รีวิวร้านได้หนึ่งครั้งต่อออเดอร์ รีวิวแสดงในหน้าร้านโดยไม่บอกชื่อคุณ ร้านตอบได้หนึ่งครั้ง ทีมอาจซ่อนรีวิวที่ไม่เหมาะสม', 'After receiving your order you can review the shop once per order. Reviews appear on the shop’s page without your name; the shop may reply once, and the team may hide inappropriate reviews.')}</li>
            </ul>
          </Sec>

          <Sec title={t('สิทธิ์ในลายที่สั่งผลิต', 'Rights in the pattern')}>
            <ul>
              <li>{t('คุณยืนยันว่ามีสิทธิ์ให้ผลิตลายที่สั่ง เช่น เป็นลายที่คุณออกแบบเอง หรือเจ้าของลายอนุญาตให้ผลิตได้', 'You confirm you may have the pattern made, for example because you designed it, or its owner allows it to be made.')}</li>
              <li>{t('ร้านใช้ลายของคุณได้เฉพาะเพื่อผลิตออเดอร์นั้น ไม่นำไปขาย แจก หรือเผยแพร่ต่อ', 'The shop may use your pattern only to make your order, never to sell, give away or publish it.')}</li>
              <li>{t('ร้านมีสิทธิ์ไม่รับผลิตลายที่ใช้ตัวการ์ตูน โลโก้ หรือแบรนด์ของคนอื่นโดยไม่ได้รับอนุญาต หรือมีเนื้อหาไม่เหมาะสม ถ้าชำระเงินแล้วร้านต้องคืนเงินเต็มจำนวน',
                'A shop may decline patterns that use other people’s characters, logos or brands without permission, or that have inappropriate content. If you’ve paid, it refunds you in full.')}</li>
            </ul>
          </Sec>

          <Sec title={t('ข้อมูลส่วนตัว', 'Your information')}>
            <p>{t('เมื่อสั่ง คุณยินยอมให้ส่งชื่อ เบอร์โทร และที่อยู่จัดส่งให้ร้านที่เลือก เพื่อผลิตและจัดส่งออเดอร์นั้น ร้านเห็นข้อมูลนี้ได้จนถึง 30 วันหลังออเดอร์ปิด รายละเอียดทั้งหมดอยู่ใน', 'By ordering, you agree to your name, phone and delivery address going to the shop you chose, to make and send that order. The shop can see them until 30 days after the order closes. The details are in the')}{' '}
              <a className="acct-link" href="#/privacy">{t('นโยบายความเป็นส่วนตัว', 'privacy notice')}</a></p>
          </Sec>

          <Sec title={t('ติดต่อเรา', 'Contact')}>
            <p>{t('เรื่องออเดอร์ คุยกับร้านได้ที่ช่องข้อความในหน้าออเดอร์ เรื่องร้านหรือเงื่อนไขนี้ อีเมล', 'For your order, write to the shop in the messages on your order page. About a shop or these terms, email')}{' '}
              <a className="acct-link" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
          </Sec>
        </article>
      </main>
    </div>
  );
}
