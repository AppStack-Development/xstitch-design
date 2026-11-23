import { useEffect, useMemo, type ReactNode } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { Thumb } from '../components/Thumb';
import { TEMPLATES } from '../lib/templates';
import { t } from '../lib/i18n';
import { LangSwitch } from '../components/LangSwitch';
import { FeedbackLink } from '../components/FeedbackDialog';
import { feedbackEnabled } from '../lib/feedback';
import { AccountButton } from '../components/AccountButton';
import { navigate } from '../App';
import { APP_NAME } from '../lib/brand';

interface Section {
  id: string;
  title: string;
  icon: IconName;
  body: ReactNode;
}

const Tip = ({ children }: { children: ReactNode }) => <p className="guide-tip"><b>{t('เคล็ดลับ', 'Tip')}</b> {children}</p>;
const Note = ({ children }: { children: ReactNode }) => <p className="guide-note"><b>{t('ข้อควรรู้', 'Good to know')}</b> {children}</p>;
const Kbd = ({ children }: { children: ReactNode }) => <kbd>{children}</kbd>;
const Go = ({ to, children }: { to: string; children: ReactNode }) => (
  <button className="guide-link" onClick={() => navigate(`#/guide/${to}`)}>{children}</button>
);

const TOOLS: { icon: IconName; name: string; key: string; desc: string }[] = [
  { icon: 'pencil', name: t('ดินสอ', 'Pencil'), key: 'B', desc: t('คลิกหรือลากเพื่อเติมสีที่เลือกลงในช่องปัก', 'Click or drag to fill stitch cells with the selected color') },
  { icon: 'eraser', name: t('ยางลบ', 'Eraser'), key: 'E', desc: t('ลบสีออกจากช่อง (คลิกขวาด้วยเครื่องมือใดก็ได้ = ลบ)', 'Clear the color from a cell (right-click with any tool also erases)') },
  { icon: 'fill', name: t('เทสี', 'Fill'), key: 'G', desc: t('เติมสีทั้งบริเวณที่ติดกันและเป็นสีเดียวกัน', 'Fill a whole connected area of the same color') },
  { icon: 'picker', name: t('ดูดสี', 'Eyedropper'), key: 'I', desc: t('คลิกช่องที่มีสี เพื่อเลือกสีนั้นมาใช้ต่อ', 'Click a colored cell to pick up that color') },
  { icon: 'line', name: t('เส้นตรง', 'Line'), key: 'L', desc: t('ลากจากจุดเริ่มถึงจุดสิ้นสุดเพื่อวาดเส้นตรง', 'Drag from start to end to draw a straight line') },
  { icon: 'rect', name: t('กรอบสี่เหลี่ยม', 'Rectangle'), key: 'R', desc: t('ลากเพื่อวาดกรอบสี่เหลี่ยม', 'Drag to draw a rectangle') },
  { icon: 'pan', name: t('เลื่อนมุมมอง', 'Pan'), key: 'H', desc: t('ลากเพื่อเลื่อนลาย (หรือกด Space ค้างแล้วลาก)', 'Drag to move the pattern around (or hold Space and drag)') },
  { icon: 'hole', name: t('แก้ไขช่องปัก/โครง', 'Edit cells/frame'), key: 'K', desc: t('เปลี่ยนช่องเป็น “ช่องปัก” “โครงทึบ” หรือ “ตัดออก” เพื่อปรับรูปทรงชิ้นงาน', 'Turn cells into “stitch cell”, “solid frame” or “cut out” to reshape the piece') },
  { icon: 'text', name: t('ใส่ชื่อ / ข้อความ', 'Name / text'), key: 'T', desc: t('พิมพ์ชื่อหรือข้อความ เลือกฟอนต์พิกเซล (A–Z) หรือฟอนต์ทั่วไป (รองรับภาษาไทย) ดูตัวอย่างบนชิ้นงาน เลื่อนตำแหน่ง แล้ววางด้วยสีที่เลือก', 'Type a name or text, pick a pixel font (A–Z) or a regular font (supports Thai), preview it on the piece, move it into place, then stamp it in the selected color') },
];

const SHORTCUTS: [string, string][] = [
  ['B / E / G / I / L / R / H / K', t('เลือกเครื่องมือ (ดินสอ ยางลบ เทสี ดูดสี เส้น กรอบ เลื่อน แก้ช่อง)', 'Choose a tool (Pencil, Eraser, Fill, Eyedropper, Line, Rectangle, Pan, Edit cells)')],
  ['T', t('ใส่ชื่อ / ข้อความ (ในหน้าต่างข้อความ ใช้ปุ่มลูกศรเลื่อนตำแหน่ง)', 'Name / text (in the text window, use the arrow keys to move it)')],
  ['1 – 9', t('เลือกสีลำดับที่ 1–9 ในจานสี (ในโหมดปัก = โฟกัสสีนั้น)', 'Pick color 1–9 in the palette (in Stitch mode: focus on that color)')],
  ['X / Y', t('เปิด/ปิดสมมาตรซ้าย-ขวา / บน-ล่าง', 'Toggle left-right / top-bottom mirror')],
  ['Ctrl/⌘ + Z', t('เลิกทำ', 'Undo')],
  [t('Shift + Ctrl/⌘ + Z หรือ Ctrl + Y', 'Shift + Ctrl/⌘ + Z or Ctrl + Y'), t('ทำซ้ำ', 'Redo')],
  ['+ / − / 0', t('ซูมเข้า / ซูมออก / พอดีจอ', 'Zoom in / zoom out / fit to screen')],
  [t('Space ค้าง + ลาก', 'Hold Space + drag'), t('เลื่อนมุมมอง', 'Pan')],
  [t('คลิกขวา', 'Right-click'), t('ลบสีในช่อง', 'Clear a cell')],
  ['Ctrl/⌘ + V', t('วางรูปภาพเพื่อแปลงเป็นลายปัก (ในหน้าออกแบบ)', 'Paste an image to turn it into a pattern (in the editor)')],
  ['Esc', t('ปิดหน้าต่าง / เลิกโฟกัสสีในโหมดปัก', 'Close a window / stop focusing on a color in Stitch mode')],
];

function useSections(): Section[] {
  const heart = useMemo(() => {
    const tpl = TEMPLATES.find((x) => x.id === 'keychain-heart')!;
    const r = tpl.build(tpl.w, tpl.h);
    return { ...r, cells: new Array(r.cols * r.rows).fill(-1), palette: [], details: { filamentColor: '#f4f1ea', baseType: 'print3d' as const } };
  }, []);
  return [
    {
      id: 'start', title: t('เริ่มต้นใช้งาน', 'Getting started'), icon: 'info',
      body: t(
        <>
          <p>{APP_NAME} ใช้ออกแบบลายปักแบบครอสติช (cross stitch) ทั้งบน<b>ผ้า Aida</b> และบน<b>ชิ้นงานพิมพ์ 3 มิติ</b>ที่เจาะรูไว้ให้ปัก เช่น พวงกุญแจ ที่คั่นหนังสือ หรือฝากล่อง</p>
          <ol>
            <li>ที่หน้าแรก กด <b>“สร้างลายจากรูป”</b> (<Go to="quick">ง่ายที่สุด</Go>) หรือเลือกโหมดขั้นสูง <b>“ออกแบบอิสระ”</b> / <b>“ใช้โมเดลแม่แบบ”</b> หรือลอง<Go to="community">ลายจากชุมชน</Go>ที่คนอื่นแชร์ไว้ ลายที่คุณสร้างหรือปักจะอยู่ใน <b>“ลายของฉัน”</b> ที่ปุ่ม <b>ของฉัน</b> มุมขวาบน</li>
            <li>เติมสีลงในช่องด้วยเครื่องมือวาด หรือแปลงจากรูปภาพ</li>
            <li>ใส่รายละเอียด เช่น ด้าย เข็ม วัสดุ ในแท็บ “รายละเอียด”</li>
            <li>พิมพ์แผนผัง แชร์ให้เพื่อน หรือเปิด <b>โหมดปัก</b> เพื่อติ๊กช่องที่ปักแล้วระหว่างปักจริง</li>
            <li>เปลี่ยนภาษาได้ด้วยปุ่มภาษา (ไอคอนลูกโลก “EN” / “ไทย”) ด้านบนของหน้าแรก</li>
          </ol>
          <Note>ลายบันทึกอัตโนมัติไว้ใน<b>เบราว์เซอร์ของเครื่องนี้</b> ถ้าเข้าสู่ระบบ (ไม่บังคับ) จะซิงก์ไปทุกเครื่องด้วย ดูวิธีย้ายเครื่องและสำรองข้อมูลได้ที่ <Go to="data">การเก็บข้อมูล</Go></Note>
        </>,
        <>
          <p>{APP_NAME} lets you design cross stitch patterns for both <b>Aida fabric</b> and <b>3D-printed pieces</b> with stitch holes, such as keychains, bookmarks or box lids.</p>
          <ol>
            <li>On the home page, tap <b>“Pattern from a photo”</b> (<Go to="quick">the easiest way</Go>), pick an advanced mode, <b>“Free design”</b> or <b>“Use a template”</b>, or try one of the <Go to="community">community patterns</Go> others have shared. Patterns you make or stitch are in <b>“My patterns”</b>, behind the <b>My stuff</b> button at the top right.</li>
            <li>Fill in the cells with the drawing tools, or convert an image.</li>
            <li>Add details such as thread, needle and materials in the “Details” tab.</li>
            <li>Print the chart, share it with a friend, or open <b>Stitch mode</b> to tick off cells as you stitch.</li>
            <li>Switch the language with the language button (globe icon, “EN” / “ไทย”) at the top of the home page.</li>
          </ol>
          <Note>Patterns are saved automatically in <b>this device’s browser</b>; if you sign in (optional) they also sync to your other devices. To move to another device or back up, see <Go to="data">Storing your data</Go>.</Note>
        </>,
      ),
    },
    {
      id: 'quick', title: t('สร้างลายจากรูป (เร็วที่สุด)', 'Pattern from a photo (quickest)'), icon: 'image',
      body: t(
        <>
          <p>วิธีที่ง่ายที่สุดสำหรับมือใหม่ กด <b>“สร้างลายจากรูป”</b> ที่หน้าแรก แล้วทำ 3 ขั้นตอน:</p>
          <ol>
            <li><b>ปักบนอะไร</b> เลือกผ้า Aida ขนาดเล็ก/กลาง/ใหญ่ หรือชิ้นงาน 3D จากแม่แบบ หรือไฟล์ STL / 3MF ของคุณ</li>
            <li><b>เลือกรูป</b> เลือกจากเครื่อง ถ่ายรูปด้วยมือถือ ลากมาวาง หรือวางรูปที่คัดลอกไว้</li>
            <li><b>เลือกแบบ</b> ระบบสร้างลายให้สูงสุด 3 แบบ (ง่าย / สมดุล / ละเอียด) ต่างกันที่จำนวนสี กด “ใช้แบบนี้” กับแบบที่ชอบ</li>
          </ol>
          <p>เปิด <b>“ใช้เฉพาะด้ายที่ฉันมี”</b> เพื่อให้ลายใช้แต่ด้ายใน <Go to="threads">ด้ายของฉัน</Go> และเลือกได้ว่าจะยอมซื้อสีเพิ่มกี่สี เมื่อได้ลายแล้วจะเห็นรายการ <b>ด้ายที่ต้องซื้อ</b> (คัดลอกไปส่งใน LINE ได้) และปุ่มเริ่มปัก พิมพ์แผนผัง ดาวน์โหลด STL หรือปรับละเอียดในหน้าออกแบบ</p>
          <Tip>รูปการ์ตูน โลโก้ หรือรูปที่พื้นหลังเรียบจะได้ผลดีที่สุด ถ้ายังไม่พอใจ ปรับ “ขนาดรูป” หรือเปลี่ยนรูปได้ทันที</Tip>
        </>,
        <>
          <p>The easiest way for beginners. Tap <b>“Pattern from a photo”</b> on the home page and follow 3 steps:</p>
          <ol>
            <li><b>Stitch on</b>: small, medium or large Aida fabric, a 3D-printed template, or your own STL / 3MF file.</li>
            <li><b>Photo</b>: pick one from your device, take one with your phone, drop it in, or paste it.</li>
            <li><b>Pick a result</b>: the app makes up to 3 patterns (Simple / Balanced / Detailed) with different numbers of colors. Tap “Use this” on the one you like.</li>
          </ol>
          <p>Turn on <b>“Use only threads I have”</b> to build the pattern from the threads in <Go to="threads">My threads</Go>, and choose how many new colors you’re willing to buy. When it’s ready you’ll see the <b>threads to buy</b> (copy the list into a chat) plus buttons to start stitching, print the chart, download an STL, or fine-tune it in the editor.</p>
          <Tip>Cartoons, logos and photos with a plain background work best. Not happy? Change the “Picture size” or try another photo.</Tip>
        </>,
      ),
    },
    {
      id: 'threads', title: t('ด้ายของฉัน', 'My threads'), icon: 'palette',
      body: t(
        <>
          <p>บันทึกด้าย DMC ที่คุณมีอยู่แล้ว (แค่มีหรือไม่มี ไม่ต้องนับจำนวน) กดปุ่ม <b>“ของฉัน”</b> (ไอคอนรูปคน มุมขวาบน) แล้วกด <b>“จัดการด้าย”</b> ในการ์ด “ด้ายของฉัน” ใช้ได้โดยไม่ต้องเข้าสู่ระบบ</p>
          <ul>
            <li>ค้นหาด้วยรหัสหรือชื่อ แล้วแตะสีที่มีเพื่อติ๊ก หรือพิมพ์หลายรหัสพร้อมกัน เช่น <Kbd>310, 321, 666</Kbd></li>
            <li>ตอนสร้างลายจากรูปหรือแปลงรูปในหน้าออกแบบ เลือก “ด้ายที่ฉันมี” ได้ ลายจะใช้ด้ายเดิมก่อน</li>
            <li>ในหน้าออกแบบและแผนผังที่พิมพ์ ด้ายที่มีแล้วจะมีเครื่องหมาย ✓ เพื่อให้รู้ว่าต้องซื้ออะไรเพิ่ม</li>
          </ul>
          <Note>รายการด้ายเก็บไว้ในเบราว์เซอร์ของเครื่องนี้ เหมือนกับลายของคุณ</Note>
        </>,
        <>
          <p>Record the DMC threads you already own (just have or don’t have, no counting): tap <b>“My stuff”</b> (the person icon, top right), then <b>“Manage threads”</b> on the “My threads” card. No account needed.</p>
          <ul>
            <li>Search by code or name and tap the colors you have, or type several codes at once, e.g. <Kbd>310, 321, 666</Kbd>.</li>
            <li>When you make a pattern from a photo, or use Image to pattern in the editor, choose “My threads” and the pattern uses threads you already own first.</li>
            <li>In the editor and on the printed chart, threads you own get a ✓, so you can see what’s left to buy.</li>
          </ul>
          <Note>Your thread list is kept in this browser, just like your patterns.</Note>
        </>,
      ),
    },
    {
      id: 'community', title: t('ลายจากชุมชน', 'Community patterns'), icon: 'people',
      body: t(
        <>
          <p>ลายที่ผู้ใช้ {APP_NAME} แชร์ไว้ให้ทุกคนใช้ เปิดได้จาก <b>“ลายจากชุมชน”</b> บนหน้าแรก (กด “ดูทั้งหมด”) ดูและปักได้โดย<b>ไม่ต้องเข้าสู่ระบบ</b></p>
          <ul>
            <li>กรองลายบนผ้า / ชิ้นงาน 3D และหมวด เช่น สัตว์ เทศกาล หรือเรียงตาม “หัวใจมากสุด”</li>
            <li><b>ลองปัก</b> บันทึกสำเนาไว้ในเครื่องแล้วเปิดโหมดปักทันที ครั้งต่อไปปุ่มจะเป็น “ปักต่อ”</li>
            <li><b>แก้ไขเป็นสำเนาของฉัน</b> เปิดสำเนาในหน้าออกแบบ แก้สีหรือเพิ่มชื่อได้ตามใจ ลายต้นฉบับไม่เปลี่ยน</li>
            <li>ลายชิ้นงาน 3D กด <b>ดาวน์โหลด STL</b> ในหน้าลายได้เลย ยกเว้นลายบนกล่องปักลายของทีม ซึ่งกด <b>สั่งผลิต</b> ได้อย่างเดียว</li>
            <li>กด <b>หัวใจ</b> ให้ลายที่ชอบได้เมื่อเข้าสู่ระบบ</li>
          </ul>
          <p><b>แชร์ลายของคุณ</b>: ในหน้าออกแบบ กด “ส่งออก / แชร์” → <b>“แชร์ในชุมชน”</b> (ต้อง<a className="guide-link" href="#/account">เข้าสู่ระบบ</a>) ตั้งชื่อที่แสดง (ใช้ชื่อเล่นได้) ชื่อลาย คำอธิบาย และหมวด แล้วยืนยันว่าออกแบบเองหรือได้รับอนุญาต ถ้าแก้ลายทีหลัง เปิดเมนูเดิมแล้วกด “อัปเดต” หัวใจที่ได้ยังอยู่ ถอนลายออกได้ทุกเมื่อที่หน้าบัญชี (ส่วน “ลายที่ฉันแชร์”)</p>
          <Note>คนอื่นใช้ลายของคุณได้แบบส่วนตัวและดัดแปลงต่อได้ โดยมีเครดิต “ดัดแปลงจาก … โดย …” ให้อัตโนมัติ แต่ห้ามนำไปขาย ความคืบหน้าการปักและรายการด้ายของคุณไม่ถูกแชร์ อ่านเพิ่มที่ <a className="guide-link" href="#/terms">ข้อกำหนดการแชร์</a></Note>
          <Tip>เจอลายที่เป็นงานของคนอื่นหรือไม่เหมาะสม กด <b>“แจ้งปัญหา”</b> ท้ายหน้าลาย ทีมงานจะตรวจภายใน 7 วัน</Tip>
        </>,
        <>
          <p>Patterns {APP_NAME} users have shared for everyone. Open them from <b>“Community patterns”</b> on the home page (tap “See all”). You can browse and stitch them <b>without an account</b>.</p>
          <ul>
            <li>Filter by fabric / 3D prints and by category, such as animals or holidays, or sort by “Most liked”.</li>
            <li><b>Stitch it</b> saves a copy on this device and opens Stitch mode right away; next time the button says “Continue stitching”.</li>
            <li><b>Edit as my copy</b> opens a copy in the editor to change colors or add a name. The original stays as it is.</li>
            <li>For 3D pieces, tap <b>Download STL</b> right on the pattern page, except designs on the team’s Stitch Box lids, which can only be <b>ordered</b>.</li>
            <li>Tap the <b>heart</b> on patterns you like (needs an account).</li>
          </ul>
          <p><b>Share your own</b>: in the editor, open “Export / share” → <b>“Share with the community”</b> (needs you to <a className="guide-link" href="#/account">sign in</a>). Choose a display name (a nickname is fine), a title, a description and categories, and confirm you designed it or have permission. If you change the pattern later, use the same menu and tap “Update”; its likes stay. Take a pattern down any time from your Account page (“Patterns I’ve shared”).</p>
          <Note>Others may use your pattern personally and remix it, with an automatic “Adapted from … by …” credit, but may not sell it. Your stitching progress and thread list are never shared. More in the <a className="guide-link" href="#/terms">sharing terms</a>.</Note>
          <Tip>Found someone else’s work or something inappropriate? Tap <b>“Report”</b> at the bottom of the pattern page; the team reviews reports within 7 days.</Tip>
        </>,
      ),
    },
    {
      id: 'free', title: t('ออกแบบอิสระ', 'Free design'), icon: 'grid',
      body: t(
        <>
          <p>เหมาะกับการปักบนผ้า หรือวางแผนลายก่อนเลือกชิ้นงาน</p>
          <ol>
            <li>ตั้งชื่อลาย แล้วเลือกขนาดตาราง (มีขนาดสำเร็จรูป 20×20 ถึง 100×100 หรือกำหนดเองได้ถึง 200×200 ช่อง)</li>
            <li>เลือกพื้นที่จะใช้ปัก: <b>ผ้า Aida</b> (11–20 ct), <b>Plastic canvas</b> (7 ct), <b>ชิ้นงานพิมพ์ 3 มิติ</b> หรือกำหนดระยะห่างเอง</li>
            <li>ระบบคำนวณขนาดชิ้นงานจริง (มม.) และแนะนำเบอร์เข็มกับจำนวนเส้นด้ายให้</li>
            <li>กด <b>สร้างลาย</b> เพื่อเข้าหน้าออกแบบ</li>
          </ol>
          <Tip>“ct” คือจำนวนช่องต่อนิ้ว ตัวเลขยิ่งมาก ช่องยิ่งเล็ก ลายยิ่งละเอียด แต่ปักยากขึ้น</Tip>
        </>,
        <>
          <p>Great for stitching on fabric, or for planning a pattern before you pick a piece.</p>
          <ol>
            <li>Name your pattern, then choose a grid size (presets from 20×20 to 100×100, or a custom size up to 200×200 cells).</li>
            <li>Choose what you’ll stitch on: <b>Aida fabric</b> (11–20 ct), <b>Plastic canvas</b> (7 ct), a <b>3D-printed piece</b>, or a custom spacing.</li>
            <li>The app works out the finished size (mm) and suggests a needle size and number of thread strands.</li>
            <li>Press <b>Create pattern</b> to open the editor.</li>
          </ol>
          <Tip>“ct” (count) is the number of cells per inch. The higher the number, the smaller the cells and the finer the pattern, but the harder it is to stitch.</Tip>
        </>,
      ),
    },
    {
      id: 'template', title: t('ใช้โมเดลแม่แบบ และนำเข้าไฟล์ STL / 3MF', 'Templates and importing STL / 3MF files'), icon: 'cube',
      body: t(
        <>
          <div className="guide-figure">
            <Thumb pattern={heart} max={120} view="stitch" />
            <p>ตัวอย่างแม่แบบพวงกุญแจหัวใจ: 1 ช่อง = 1 ฝีกากบาท ปักทับพลาสติกตรงกลางช่อง โดยเข็มลอดรูเล็กสีเข้มที่มุมทั้ง 4 ของช่อง ส่วนขอบสีเข้มกว่าคือโครงที่ไม่ได้ปัก</p>
          </div>
          <p><b>กล่องปักลาย 7 แบบ</b> (อยู่บนสุด): ฝากล่องกลม หัวใจ ดาว สี่เหลี่ยม รูปไข่ วงรี และสามเหลี่ยม เป็นโมเดลจริงของทีม ขนาดคงที่ ระยะห่างรู 2.5 มม. ออกแบบลายแล้วกด <b>สั่งผลิต</b> ได้ (ไม่มีไฟล์ STL ให้ดาวน์โหลด)</p>
          <p><b>แม่แบบสำเร็จรูป 8 แบบ:</b> ที่คั่นหนังสือ ที่รองแก้วกลม/สี่เหลี่ยม พวงกุญแจหัวใจ/กลม ดาวแขวน เข็มกลัดหกเหลี่ยม และการ์ด เลือกแล้วปรับขนาด (จำนวนช่อง) ระยะห่างรู และความหนาได้</p>
          <p><b>นำเข้าโมเดลของคุณ:</b> กดการ์ด “นำเข้าไฟล์ STL / 3MF” แล้วเลือกไฟล์ ระบบจะหารูที่เรียงเป็นตารางและแปลงเป็นช่องสำหรับเติมสีอัตโนมัติ</p>
          <ul>
            <li>รองรับไฟล์ <b>.stl</b> และ <b>.3mf</b> (รวมถึงไฟล์จาก MakerWorld / Bambu Studio)</li>
            <li>ถ้าไฟล์มีหลายชิ้น (เช่น ฝาและตัวกล่อง) ระบบเลือก<b>ชิ้นที่มีรูมากที่สุด</b>ให้ และเปลี่ยนชิ้นได้ ชิ้นที่ไม่มีรูจะกดไม่ได้</li>
            <li>ระบบวัดระยะห่างรู ขนาดรู และความหนาแผ่นให้ ถ้าตารางที่ได้ไม่ตรง ให้พิมพ์ระยะห่างรู (มม.) แล้วกด “วิเคราะห์ใหม่”</li>
          </ul>
          <Note>ชิ้นงานควรเป็นแผ่นที่มีรูเรียงเป็นตารางมุมฉาก ถ้าไฟล์ STL เดียวมีหลายชิ้นรวมกัน จะเลือกชิ้นไม่ได้เหมือนไฟล์ 3MF</Note>
        </>,
        <>
          <div className="guide-figure">
            <Thumb pattern={heart} max={120} view="stitch" />
            <p>The heart keychain template: one cell is one cross stitch. It lies on the plastic in the middle of the cell, and the needle goes through the small dark holes at the cell’s four corners. The darker edge is the frame, which isn’t stitched.</p>
          </div>
          <p><b>7 Stitch Box lids</b> (at the top): round, heart, star, square, egg, oval and triangle. They’re the team’s real box models with a fixed size and a 2.5 mm hole pitch. Design on one and <b>order</b> it (there’s no STL to download).</p>
          <p><b>8 ready-made templates:</b> bookmark, round/square coaster, heart/round keychain, hanging star, hexagon pin and card. Pick one, then adjust its size (number of cells), hole pitch and thickness.</p>
          <p><b>Import your own model:</b> tap the “Import STL / 3MF file” card and choose a file. The app finds holes laid out in a grid and turns them into cells you can color.</p>
          <ul>
            <li>Supports <b>.stl</b> and <b>.3mf</b> files (including files from MakerWorld / Bambu Studio).</li>
            <li>If the file has several parts (such as a box lid and base), the app picks <b>the part with the most holes</b> for you, and you can switch parts. Parts without holes can’t be selected.</li>
            <li>The app measures the hole pitch, hole size and plate thickness. If the grid doesn’t line up, type the hole pitch (mm) and press “Re-analyze”.</li>
          </ul>
          <Note>The piece should be a flat plate with holes in a square grid. If a single STL file has several parts merged together, you can’t pick a part the way you can with a 3MF file.</Note>
        </>,
      ),
    },
    {
      id: 'print3d-tools', title: t('ด้ายและเข็มสำหรับชิ้นงาน 3D', 'Thread and needles for 3D pieces'), icon: 'needle',
      body: t(
        <>
          <p>เลือกเข็มและจำนวนเส้นด้ายจาก<b>ระยะห่างรู</b>ของชิ้นงาน (ดูได้ในแท็บ “รายละเอียด”) ใช้เข็ม <b>Tapestry (ปลายมน)</b> เสมอ เพราะไม่ขูดขอบรูพลาสติกและไม่เกี่ยวด้ายที่ปักไว้แล้ว</p>
          <ul>
            <li>ระยะรู 3.2 มม. ขึ้นไป: เข็มเบอร์ 18–20 ด้าย 6 เส้น</li>
            <li>ระยะรู 2.4–3.2 มม.: เข็มเบอร์ 22 ด้าย 4–6 เส้น</li>
            <li>ระยะรู 1.75–2.4 มม.: เข็มเบอร์ 24 ด้าย 2–3 เส้น</li>
            <li>ระยะรูเล็กกว่านั้น: เข็มเบอร์ 26–28 ด้าย 1–2 เส้น</li>
          </ul>
          <p><b>กล่องปักลาย (ระยะรู 2.5 มม. รูกว้างราว 1.2 มม.):</b> เข็ม Tapestry เบอร์ 22 ด้าย DMC Mouliné (ด้าย 6 เส้นแบบแยกได้) <b>3–4 เส้น</b> รูหนึ่งรูมีด้ายผ่านได้ถึงราว 8 ครั้ง ด้าย 6 เส้นจะแน่นเกินรูถ้าลายปักเต็มทุกช่อง ใช้ 6 เส้นได้เฉพาะลายที่ปักแค่บางส่วน ถ้ารูแน่นให้ลองเข็มเบอร์ 24 หรือใช้ด้าย Perle (Pearl cotton) เบอร์ 8 ซึ่งเป็นเส้นเดียว เงากว่า หนาพอๆ กับด้ายแยก 2–3 เส้น</p>
          <ul>
            <li><b>ไม่ผูกปม</b> ปมด้ายเล็กกว่ารูจึงหลุดลอดได้ ให้สอดปลายด้ายใต้ฝีเข็มด้านหลัง หรือแต้มกาวเล็กน้อย</li>
            <li><b>ตัดด้ายเส้นละ 40–50 ซม.</b> ด้ายถูกับขอบพลาสติกบ่อย ถ้ายาวเกินจะเป็นขุยเร็ว</li>
            <li><b>เคลียร์รูก่อนปัก</b> ถ้ามีเส้นพลาสติกเหลือหรือขอบล่างบาน ใช้เข็มหมุดหรือดอกสว่าน 1.2 มม. แยงทีละรู</li>
            <li><b>เก็บด้านหลังให้แบน</b> ด้านหลังของฝาอยู่ในกล่อง ไม่ต้องเรียบมาก แต่ควรแบนพอให้ฝาปิดสนิท</li>
          </ul>
          <Note>ก่อนปักชิ้นจริง ลองพิมพ์หนึ่งชิ้นแล้วปักมุมเล็กๆ เทียบด้าย 3, 4 และ 6 เส้น เพราะขนาดรูที่ได้ขึ้นกับเครื่องพิมพ์และเส้นพลาสติก หาซื้อได้ตามร้านอุปกรณ์งานฝีมือ หรือค้นใน Shopee / Lazada ด้วยคำว่า “เข็ม tapestry 22” “ด้าย DMC” หรือ “ด้าย perle 8”</Note>
        </>,
        <>
          <p>Choose the needle and number of strands from the piece’s <b>hole pitch</b> (shown in the “Details” tab). Always use a <b>tapestry (blunt) needle</b>: it won’t scrape the plastic holes or catch stitches you’ve already made.</p>
          <ul>
            <li>Pitch 3.2 mm or more: needle size 18–20, 6 strands</li>
            <li>Pitch 2.4–3.2 mm: needle size 22, 4–6 strands</li>
            <li>Pitch 1.75–2.4 mm: needle size 24, 2–3 strands</li>
            <li>Smaller pitch: needle size 26–28, 1–2 strands</li>
          </ul>
          <p><b>Stitch Box lids (2.5 mm pitch, holes about 1.2 mm wide):</b> a size 22 tapestry needle and DMC Mouliné stranded cotton, <b>3–4 strands</b>. A hole can take the thread up to about 8 times, so 6 strands are too tight for a fully stitched design; keep 6 for designs that only cover part of the lid. If the holes feel tight, try a size 24 needle, or Perle (pearl) cotton no. 8: a single shiny thread about as thick as 2–3 strands.</p>
          <ul>
            <li><b>No knots.</b> A knot is smaller than the hole and can slip through. Weave the tail under stitches on the back, or add a dot of glue.</li>
            <li><b>Cut 40–50 cm lengths.</b> The thread rubs on the plastic a lot, and longer lengths fray.</li>
            <li><b>Clear the holes first.</b> If there are strings or a flared bottom edge, run a pin or a 1.2 mm drill bit through each hole.</li>
            <li><b>Keep the back flat.</b> The back of a lid sits inside the box, so it needn’t be neat, but it should lie flat for the lid to close.</li>
          </ul>
          <Note>Before the real piece, print one and stitch a small corner with 3, 4 and 6 strands: the hole size depends on the printer and filament. Find supplies at craft shops, or search Shopee / Lazada for “tapestry needle 22”, “DMC thread” or “perle 8”.</Note>
        </>,
      ),
    },
    {
      id: 'editor', title: t('เครื่องมือในหน้าออกแบบ', 'Editor tools'), icon: 'pencil',
      body: (
        <>
          <p>{t('แถบเครื่องมืออยู่ด้านซ้าย (บนมือถืออยู่ด้านซ้ายเช่นกัน ส่วนแผงสีและรายละเอียดอยู่ด้านล่าง)', 'The toolbar is on the left (on phones too; the color and details panels move to the bottom).')}</p>
          <div className="guide-table">
            {TOOLS.map((tool) => (
              <div key={tool.key} className="guide-row">
                <span className="guide-ico"><Icon name={tool.icon} size={18} /></span>
                <b>{tool.name} <Kbd>{tool.key}</Kbd></b>
                <span>{tool.desc}</span>
              </div>
            ))}
          </div>
          {t(
            <>
              <ul>
                <li><b>สมมาตร</b> <Icon name="mirrorX" size={15} /> <Icon name="mirrorY" size={15} /> วาดข้างหนึ่ง อีกข้างจะสะท้อนตามอัตโนมัติ</li>
                <li><b>มุมมอง</b> “ฝีเข็ม” (ดูเหมือนปักจริง) “สี” (สีเรียบ) และ “สัญลักษณ์” (สำหรับพิมพ์ขาวดำ)</li>
                <li><b>ซูม</b> ใช้ปุ่มซูม ล้อเมาส์ หรือหยิกนิ้วบนทัชแพด · บนมือถือ/แท็บเล็ต หยิกสองนิ้วเพื่อซูม และลากสองนิ้วเพื่อเลื่อน · <b>สามเหลี่ยมสีแดง</b>ที่ขอบบอกจุดกึ่งกลางของลาย</li>
                <li><b>เลิกทำ/ทำซ้ำ</b> ด้วยปุ่มลูกศรด้านบน หรือ <Kbd>Ctrl/⌘ + Z</Kbd></li>
              </ul>
              <Tip>ชื่อสั้นๆ บนพวงกุญแจ ใช้ “ฟอนต์พิกเซล” ขนาด ×1 (สูง 7 ช่อง) จะคมชัดที่สุด ส่วนภาษาไทยใช้ “ฟอนต์ทั่วไป” สูงอย่างน้อย 12 ช่อง</Tip>
              <Tip>ใช้เครื่องมือ “แก้ไขช่องปัก/โครง” เพื่อปรับรูปทรงชิ้นงานก่อนส่งออกเป็นไฟล์ STL ไปพิมพ์</Tip>
            </>,
            <>
              <ul>
                <li><b>Mirror</b> <Icon name="mirrorX" size={15} /> <Icon name="mirrorY" size={15} /> Draw on one side and the other side mirrors it automatically.</li>
                <li><b>Views</b> “Stitches” (looks like real stitching), “Color” (flat color) and “Symbols” (for black-and-white printing).</li>
                <li><b>Zoom</b> with the zoom buttons, the mouse wheel, or a pinch on the touchpad · on phones and tablets, pinch with two fingers to zoom and drag with two to move · the <b>red triangles</b> on the edges mark the center of the pattern.</li>
                <li><b>Undo/Redo</b> with the arrow buttons at the top, or <Kbd>Ctrl/⌘ + Z</Kbd>.</li>
              </ul>
              <Tip>For a short name on a keychain, the “Pixel A–Z” at ×1 (7 cells tall) is the sharpest. For Thai text, use the “Regular font (Thai OK)” at least 12 cells tall.</Tip>
              <Tip>Use the “Edit cells/frame” tool to reshape the piece before exporting it as an STL file for printing.</Tip>
            </>,
          )}
        </>
      ),
    },
    {
      id: 'colors', title: t('สีด้ายและคลังสี DMC', 'Thread colors and the DMC library'), icon: 'palette',
      body: t(
        <>
          <p>แท็บ <b>“สีด้าย”</b> ทางขวาแสดงจานสีของลาย พร้อมจำนวนฝีเข็มของแต่ละสี คลิกสีเพื่อเลือกใช้ หรือกดตัวเลข <Kbd>1</Kbd>–<Kbd>9</Kbd></p>
          <ul>
            <li><b>เลือกจากด้าย DMC</b> คลังด้าย DMC 437 สี ค้นหาด้วยรหัสหรือชื่อ (เช่น 310, red) และกรองตามโทนสี สีที่มีในจานแล้วจะมีขีดเส้นใต้</li>
            <li><b>หาด้ายที่ใกล้สีนี้</b> เลือกสีที่ต้องการ ระบบจะแสดงด้าย DMC ที่ใกล้ที่สุด 6 สี</li>
            <li><b>สีกำหนดเอง</b> เลือกสีใดก็ได้ แล้วกดไอคอนดินสอเพื่อแก้ชื่อ ยี่ห้อ รหัส และสัญลักษณ์ในแผนผัง ถ้ายังไม่ใช่ด้าย DMC จะมีปุ่ม “ใช้สีนี้” เพื่อเปลี่ยนเป็นด้ายที่ใกล้ที่สุด</li>
          </ul>
          <Note>สีบนจอเป็นค่าประมาณ ควรเทียบกับการ์ดสีด้ายจริงก่อนซื้อ</Note>
        </>,
        <>
          <p>The <b>“Threads”</b> tab on the right shows the pattern’s palette and the stitch count for each color. Click a color to use it, or press <Kbd>1</Kbd>–<Kbd>9</Kbd>.</p>
          <ul>
            <li><b>Pick DMC thread</b> A library of 437 DMC colors. Search by code or name (e.g. 310, red) and filter by hue. Colors already in your palette are underlined.</li>
            <li><b>Find the closest thread</b> Pick any color and the app shows the 6 closest DMC threads.</li>
            <li><b>Custom color</b> Pick any color, then tap the pencil icon to edit its name, brand, code and chart symbol. If it isn’t a DMC thread yet, a “Use this” button swaps it for the closest one.</li>
          </ul>
          <Note>On-screen colors are approximate. Compare with a real thread color card before you buy.</Note>
        </>,
      ),
    },
    {
      id: 'image', title: t('แปลงรูปภาพเป็นลายปัก', 'Image to pattern'), icon: 'image',
      body: t(
        <>
          <p>กดปุ่ม <b>“รูปภาพ → ลาย”</b> ด้านบนหน้าออกแบบ หรือลากรูปมาวางบนลาย หรือกด <Kbd>Ctrl/⌘ + V</Kbd> เพื่อวางรูปที่คัดลอกไว้</p>
          <ul>
            <li><b>จำนวนสีสูงสุด</b> 2–24 สี ยิ่งน้อยยิ่งปักง่าย แต่รายละเอียดเล็กๆ อาจหายไป</li>
            <li><b>เลือกสีด้ายจาก</b> ด้าย DMC (แนะนำ) · สีตามรูป · หรือเฉพาะสีในจานสีปัจจุบัน</li>
            <li><b>ขนาดและตำแหน่ง</b> ปรับขนาดรูปและเลื่อนให้พอดีกับชิ้นงาน</li>
            <li><b>ตัดขอบว่าง</b> และ <b>ไม่ปักพื้นหลัง</b> ช่วยให้ลายเต็มพื้นที่และไม่ต้องปักพื้น</li>
            <li><b>ลดจุดเดี่ยวๆ</b> แทนที่ฝีเข็มที่อยู่โดดเดี่ยวด้วยสีรอบข้าง ทำให้ปักง่ายขึ้น</li>
          </ul>
          <Tip>รูปการ์ตูน โลโก้ หรือรูปที่พื้นหลังเรียบ/โปร่งใส จะได้ผลดีที่สุด ถ้าไม่ชอบผลลัพธ์ กดเลิกทำได้ทันที</Tip>
        </>,
        <>
          <p>Press the <b>“Image → pattern”</b> button at the top of the editor, drag an image onto the pattern, or press <Kbd>Ctrl/⌘ + V</Kbd> to paste a copied image.</p>
          <ul>
            <li><b>Max colors</b> 2–24. Fewer colors are easier to stitch, but small details may be lost.</li>
            <li><b>Thread colors from</b> DMC threads (recommended) · the image’s own colors · or only the colors in your current palette.</li>
            <li><b>Size and position</b> Resize the image and move it to fit the piece.</li>
            <li><b>Trim empty edges</b> and <b>Skip the background</b> make the pattern fill the space so you don’t have to stitch the background.</li>
            <li><b>Remove stray single stitches</b> Replaces isolated single stitches with the surrounding color, making it easier to stitch.</li>
          </ul>
          <Tip>Cartoons, logos and images with a plain or transparent background work best. Don’t like the result? Just press Undo.</Tip>
        </>,
      ),
    },
    {
      id: 'details', title: t('รายละเอียดลาย', 'Pattern details'), icon: 'info',
      body: t(
        <>
          <p>แท็บ <b>“รายละเอียด”</b> ใช้บันทึกข้อมูลที่จะไปปรากฏในแผนผังที่พิมพ์:</p>
          <ul>
            <li><b>ข้อมูลลาย</b> ชื่อ คำอธิบาย ผู้ออกแบบ แท็ก ระดับความยาก เวลาที่ใช้</li>
            <li><b>วัสดุพื้น</b> ผ้า Aida (ความถี่ ct) หรือชิ้นงาน 3D (ระยะห่างรู ความหนา ขนาดรู ชนิดและสีเส้นพลาสติก)</li>
            <li><b>ด้ายและเข็ม</b> รูปแบบการปัก ยี่ห้อด้าย จำนวนเส้น ชนิดและเบอร์เข็ม (มีคำแนะนำตามขนาดรู)</li>
            <li><b>บันทึก/ขั้นตอน</b> เขียนลำดับการปักหรือข้อควรระวัง</li>
          </ul>
          <p>ระบบคำนวณให้อัตโนมัติ: ขนาดชิ้นงานจริง จำนวนฝีเข็ม และ<b>ปริมาณด้ายโดยประมาณ</b>ของแต่ละสี (เป็นเมตรและจำนวนไจ)</p>
          <Note>ถ้าตั้งระยะห่างรูน้อยจนขอบระหว่างรูบางกว่า 0.8 มม. ระบบจะเตือน เพราะหัวพิมพ์ 0.4 มม. อาจพิมพ์ไม่ได้</Note>
        </>,
        <>
          <p>The <b>“Details”</b> tab holds the information that appears on the printed chart:</p>
          <ul>
            <li><b>Pattern info</b> Name, description, designer, tags, difficulty and time spent.</li>
            <li><b>Base material</b> Aida fabric (count in ct) or a 3D-printed piece (hole pitch, thickness, hole size, filament type and color).</li>
            <li><b>Thread and needle</b> Stitch type, thread brand, number of strands, needle type and size (with suggestions based on hole size).</li>
            <li><b>Notes / steps</b> Write down the stitching order or things to watch out for.</li>
          </ul>
          <p>Calculated automatically: finished size, stitch count and <b>estimated thread needed</b> for each color (in meters and skeins).</p>
          <Note>If the hole pitch is so small that the walls between holes are thinner than 0.8 mm, you’ll get a warning, because a 0.4 mm nozzle may not be able to print them.</Note>
        </>,
      ),
    },
    {
      id: 'preview3d', title: t('ภาพตัวอย่าง 3 มิติ', '3D preview'), icon: 'cube',
      body: t(
        <>
          <p>แท็บ <b>“3D”</b> แสดงชิ้นงานพร้อมฝีเข็มแบบ 3 มิติ ลากเพื่อหมุน scroll เพื่อซูม คลิกขวาลากเพื่อเลื่อน ภาพนี้สร้างจากตารางช่อง ใช้ดูภาพรวมก่อนปักจริง</p>
        </>,
        <>
          <p>The <b>“3D”</b> tab shows the piece with its stitches in 3D. Drag to rotate, scroll to zoom, and right-drag to pan. The preview is built from the cell grid, so use it to get a feel for the result before you stitch.</p>
        </>,
      ),
    },
    {
      id: 'export', title: t('พิมพ์ ส่งออก และแชร์', 'Print, export and share'), icon: 'download',
      body: t(
        <>
          <p>กดปุ่ม <b>“ส่งออก / แชร์”</b> มุมขวาบนของหน้าออกแบบ:</p>
          <ul>
            <li><b>พิมพ์ / บันทึกเป็น PDF</b> หน้าปก (รายละเอียด + รายการด้ายพร้อมช่องติ๊ก) และแผนผังที่แบ่งหน้า A4 ให้ เลือกได้ว่าจะพิมพ์แบบสี+สัญลักษณ์ สัญลักษณ์อย่างเดียว (ขาวดำ) หรือสีอย่างเดียว และกำหนดจำนวนช่องต่อหน้าได้ เลือก “บันทึกเป็น PDF” ในหน้าต่างพิมพ์เพื่อได้ไฟล์ PDF</li>
            <li><b>รูปภาพ PNG</b> ลายพร้อมรายการด้าย สำหรับส่งทาง LINE หรือโซเชียล</li>
            <li><b>ส่งไปมือถือ / อีกเครื่อง</b> ดู <Go to="transfer">ส่งไปมือถือ</Go></li>
            <li><b>คัดลอกลิงก์แชร์</b> เพื่อนเปิดดูลายและกด “บันทึกเป็นลายของฉัน” เพื่อเก็บสำเนาไว้แก้ต่อได้ (ไม่รวมความคืบหน้าการปักของคุณ)</li>
            <li><b>ไฟล์ลาย (.json)</b> สำรองข้อมูล หรือนำเข้าในเครื่องอื่นด้วยปุ่ม “นำเข้าไฟล์ลาย” ที่หน้าแรก</li>
            <li><b>โมเดล 3D (.stl)</b> แผ่นเจาะรูตามรูปทรงของลาย สำหรับเปิดในโปรแกรม slicer แล้วพิมพ์</li>
          </ul>
        </>,
        <>
          <p>Press the <b>“Export / Share”</b> button at the top right of the editor:</p>
          <ul>
            <li><b>Print / Save as PDF</b> A cover page (details + thread list with checkboxes) and the chart split across A4 pages. Choose color + symbols, symbols only (black and white) or color only, and set how many cells fit on each page. Choose “Save as PDF” in the print window to get a PDF file.</li>
            <li><b>PNG image</b> The pattern with its thread list, for sending over LINE or social media.</li>
            <li><b>Send to phone / another device</b> See <Go to="transfer">Send to your phone</Go>.</li>
            <li><b>Copy share link</b> Friends can view the pattern and press “Save as my pattern” to keep a copy they can edit (your stitching progress isn’t included).</li>
            <li><b>Pattern file (.json)</b> For backups, or to bring into another device with the “Import pattern” button on the home page.</li>
            <li><b>3D model (.stl)</b> A plate with holes in the shape of your pattern, to open in a slicer and print.</li>
          </ul>
        </>,
      ),
    },
    {
      id: 'stitch', title: t('โหมดปัก (ติดตามความคืบหน้า)', 'Stitch mode (track your progress)'), icon: 'needle',
      body: t(
        <>
          <p>เปิดจากปุ่ม <b>“โหมดปัก”</b> ในหน้าออกแบบ หรือ <b>“เริ่มปัก / ปักต่อ”</b> บนการ์ดลายที่หน้าแรก ใช้ระหว่างปักจริง โดยเฉพาะบนมือถือหรือแท็บเล็ต</p>
          <ul>
            <li><b>แตะ</b> แตะช่องที่ปักแล้วเพื่อติ๊ก (แตะซ้ำเพื่อยกเลิก) ลากนิ้วเดียวเพื่อเลื่อน หยิกสองนิ้วเพื่อซูม</li>
            <li><b>ระบาย</b> ลากผ่านหลายช่องเพื่อติ๊กทีเดียว (ใช้สองนิ้วเพื่อเลื่อน/ซูม)</li>
            <li><b>ทั้งกลุ่ม</b> แตะครั้งเดียวติ๊กทุกช่องสีเดียวกันที่ติดกัน</li>
            <li><b>ปักทีละสี</b> แตะสีในรายการด้านขวา (หรือด้านล่างบนมือถือ) สีอื่นจะจางลงและติ๊กได้เฉพาะสีนั้น ปุ่ม “ช่องที่เหลือ” จะซูมไปยังช่องที่ยังไม่ได้ปัก</li>
            <li><b>สถิติ</b> เปอร์เซ็นต์รวม ฝีเข็มวันนี้ และความคืบหน้าแต่ละสี</li>
            <li><b>จับเวลา</b> กด ▶ เพื่อเริ่ม หลังจับเวลาเกิน 5 นาที ระบบจะประมาณความเร็วและเวลาที่เหลือ เวลาจะหยุดเองเมื่อสลับแอปหรือปิดจอ</li>
            <li><b>จอไม่ดับ</b> สวิตช์ในแผงความคืบหน้า (บนมือถืออยู่ใต้แผนผัง) กันหน้าจอดับระหว่างปัก ขึ้นป้าย “เปิดอยู่” เมื่อเปิด (ในเบราว์เซอร์ที่รองรับ)</li>
          </ul>
          <Tip>ถ้าแก้สีของช่องที่ติ๊กแล้วในหน้าออกแบบ ช่องนั้นจะกลับเป็น “ยังไม่ได้ปัก” อัตโนมัติ</Tip>
        </>,
        <>
          <p>Open it with the <b>“Stitch mode”</b> button in the editor, or <b>“Stitch” / “Continue”</b> on a pattern card on the home page. Use it while you stitch, especially on a phone or tablet.</p>
          <ul>
            <li><b>Tap</b> Tap a cell you’ve stitched to tick it (tap again to undo). Drag with one finger to pan, pinch with two fingers to zoom.</li>
            <li><b>Paint</b> Drag across several cells to tick them all at once (use two fingers to pan/zoom).</li>
            <li><b>Area</b> One tap ticks every connected cell of the same color.</li>
            <li><b>One color at a time</b> Tap a color in the list on the right (or at the bottom on phones). Other colors fade and only that color can be ticked. The “Remaining” button zooms to cells you haven’t stitched yet.</li>
            <li><b>Stats</b> Overall percentage, stitches today and progress for each color.</li>
            <li><b>Timer</b> Press ▶ to start. After more than 5 minutes, the app estimates your speed and the time left. The timer pauses on its own when you switch apps or the screen turns off.</li>
            <li><b>Keep screen on</b> The switch in the progress panel (below the chart on phones) stops the screen from going dark while you stitch; it shows “On” while on (in supported browsers).</li>
          </ul>
          <Tip>If you change the color of a ticked cell in the editor, that cell goes back to “not stitched” automatically.</Tip>
        </>,
      ),
    },
    {
      id: 'transfer', title: t('ส่งไปมือถือ / อีกเครื่อง', 'Send to your phone / another device'), icon: 'phone',
      body: t(
        <>
          <p>ใช้ย้ายลาย<b>พร้อมความคืบหน้า</b>ระหว่างเครื่องของคุณเอง เช่น ออกแบบในคอม แล้วไปปักต่อในมือถือ</p>
          <ol>
            <li>ในหน้าออกแบบ: “ส่งออก / แชร์” → <b>“ส่งไปมือถือ / อีกเครื่อง”</b> หรือในโหมดปักกด <b>“ส่งไปมือถือ”</b> (<Icon name="sendOut" size={15} />)</li>
            <li>สแกน QR ด้วยกล้องมือถือ (กด QR เพื่อขยายเต็มจอถ้าสแกนยาก) หรือกด “คัดลอกลิงก์ / แชร์…” เพื่อส่งให้ตัวเองทาง LINE</li>
            <li>เปิดลิงก์ในอีกเครื่อง แล้วกด “เปิดในโหมดปัก”</li>
          </ol>
          <ul>
            <li>ถ้าเครื่องปลายทาง<b>มีลายเดียวกันอยู่แล้ว</b> ระบบจะ<b>รวมความคืบหน้า</b>ให้ (ช่องที่ติ๊กในเครื่องใดเครื่องหนึ่งนับว่าปักแล้ว)</li>
            <li>ถ้าลายถูกแก้ไขต่างกันในสองเครื่อง จะให้เลือก: ใช้เวอร์ชันจากลิงก์ เก็บไว้ทั้งสองแบบ หรือใช้ของเครื่องนี้</li>
          </ul>
          <Note>ลิงก์นี้มีความคืบหน้าของคุณ ใช้ส่งให้ตัวเอง ถ้าจะแชร์ให้เพื่อน ใช้ “คัดลอกลิงก์แชร์” แทน</Note>
        </>,
        <>
          <p>Move a pattern <b>with its progress</b> between your own devices, for example design on a computer and keep stitching on your phone.</p>
          <ol>
            <li>In the editor: “Export / Share” → <b>“Send to phone / another device”</b>, or in Stitch mode tap <b>“Send to phone”</b> (<Icon name="sendOut" size={15} />).</li>
            <li>Scan the QR code with your phone’s camera (tap the QR to make it full screen if it’s hard to scan), or tap “Copy link / Share…” to send it to yourself over LINE.</li>
            <li>Open the link on the other device and tap “Open in Stitch mode”.</li>
          </ol>
          <ul>
            <li>If the other device <b>already has the same pattern</b>, the app <b>merges the progress</b> (a cell ticked on either device counts as stitched).</li>
            <li>If the pattern was edited differently on the two devices, you can choose: use the version from the link, keep both, or keep this device’s version.</li>
          </ul>
          <Note>This link includes your progress and is meant for sending to yourself. To share with a friend, use “Copy share link” instead.</Note>
        </>,
      ),
    },
    {
      id: 'app', title: t('ติดตั้งเป็นแอปและใช้แบบออฟไลน์', 'Install as an app and use offline'), icon: 'install',
      body: t(
        <>
          <ul>
            <li><b>Android / Chrome / Edge:</b> กดปุ่ม <b>“ติดตั้งแอป”</b> ที่หน้าแรก (หรือเมนูเบราว์เซอร์ → ติดตั้งแอป)</li>
            <li><b>iPhone / iPad:</b> เปิดใน Safari กดปุ่ม <b>แชร์</b> แล้วเลือก <b>“เพิ่มไปยังหน้าจอโฮม”</b></li>
          </ul>
          <p>หลังเปิดเว็บครั้งแรกขณะมีอินเทอร์เน็ต เว็บจะเก็บไฟล์ไว้ในเครื่อง ทำให้เปิดใช้งานได้แม้ไม่มีสัญญาณ และเมื่อกลับมาออนไลน์จะอัปเดตเป็นเวอร์ชันล่าสุดเอง</p>
        </>,
        <>
          <ul>
            <li><b>Android / Chrome / Edge:</b> Press the <b>“Install app”</b> button on the home page (or browser menu → Install app).</li>
            <li><b>iPhone / iPad:</b> Open the site in Safari, tap <b>Share</b>, then choose <b>“Add to Home Screen”</b>.</li>
          </ul>
          <p>After you open the site once while online, it keeps its files on your device, so it works even without a connection. When you’re back online it updates itself to the latest version.</p>
        </>,
      ),
    },
    {
      id: 'data', title: t('การเก็บข้อมูลและสำรองข้อมูล', 'Storing and backing up your data'), icon: 'file',
      body: t(
        <>
          <ul>
            <li>ลายและความคืบหน้าบันทึกอัตโนมัติใน<b>เบราว์เซอร์ของเครื่องนั้น</b> (เห็นสถานะ “บันทึกแล้ว” ด้านบนหน้าออกแบบ)</li>
            <li>แต่ละเบราว์เซอร์/แต่ละเครื่องเก็บข้อมูลแยกกัน ใช้ <Go to="transfer">ส่งไปมือถือ</Go> เพื่อย้ายลาย</li>
            <li><b>สำรองข้อมูล:</b> ส่งออกเป็นไฟล์ .json แล้วเก็บไว้ ถ้าล้างข้อมูลเบราว์เซอร์ ลายที่ไม่ได้สำรองจะหายไป</li>
            <li>ที่หน้าแรก การ์ดลายมีปุ่มพิมพ์ ทำสำเนา และลบ</li>
          </ul>
        </>,
        <>
          <ul>
            <li>Patterns and progress are saved automatically in <b>that device’s browser</b> (you’ll see “Saved” at the top of the editor).</li>
            <li>Each browser and each device keeps its own data. Use <Go to="transfer">Send to your phone</Go> to move a pattern.</li>
            <li><b>Back up:</b> Export a .json file and keep it somewhere safe. If you clear your browser data, any pattern you haven’t backed up is lost.</li>
            <li>On the home page, each pattern card has Print, Duplicate and Delete buttons.</li>
          </ul>
        </>,
      ),
    },
    {
      id: 'shortcuts', title: t('คีย์ลัด', 'Keyboard shortcuts'), icon: 'grid',
      body: (
        <div className="guide-table keys">
          {SHORTCUTS.map(([k, d]) => (
            <div key={k} className="guide-row"><b><Kbd>{k}</Kbd></b><span>{d}</span></div>
          ))}
        </div>
      ),
    },
    {
      id: 'faq', title: t('คำถามที่พบบ่อย', 'FAQ'), icon: 'info',
      body: t(
        <dl className="guide-faq">
          <dt>เปิดเว็บในมือถือแล้วไม่เห็นลายที่ทำในคอม</dt>
          <dd>ข้อมูลเก็บแยกในแต่ละเครื่อง ใช้ “ส่งไปมือถือ / อีกเครื่อง” เพื่อย้ายลาย</dd>
          <dt>นำเข้า STL แล้วตารางไม่ตรงกับชิ้นงาน</dt>
          <dd>ใส่ระยะห่างรู (มม.) ที่ถูกต้องแล้วกด “วิเคราะห์ใหม่” ถ้ายังไม่ได้ ตรวจว่าเป็นแผ่นที่มีรูเรียงเป็นตาราง</dd>
          <dt>สแกน QR ไม่ติด</dt>
          <dd>กดที่ QR เพื่อขยายเต็มจอ เพิ่มความสว่างหน้าจอ หรือใช้ “คัดลอกลิงก์” ส่งให้ตัวเองแทน</dd>
          <dt>สีบนจอไม่ตรงกับด้ายจริง</dt>
          <dd>สีบนจอเป็นค่าประมาณ ใช้รหัสด้าย (เช่น DMC 321) เป็นหลักในการซื้อด้าย</dd>
          <dt>ต้องการพิมพ์เป็น PDF</dt>
          <dd>“ส่งออก / แชร์” → “พิมพ์ / บันทึกเป็น PDF” แล้วเลือกปลายทางเป็น “บันทึกเป็น PDF” ในหน้าต่างพิมพ์</dd>
        </dl>,
        <dl className="guide-faq">
          <dt>I opened the site on my phone and can’t see the patterns I made on my computer</dt>
          <dd>Each device stores its data separately. Use “Send to phone / another device” to move a pattern.</dd>
          <dt>I imported an STL and the grid doesn’t match the piece</dt>
          <dd>Enter the correct hole pitch (mm) and press “Re-analyze”. If that doesn’t help, check that the piece is a plate with holes in a grid.</dd>
          <dt>The QR code won’t scan</dt>
          <dd>Tap the QR to make it full screen, turn up the screen brightness, or use “Copy link” to send it to yourself instead.</dd>
          <dt>On-screen colors don’t match the real thread</dt>
          <dd>On-screen colors are approximate. Go by the thread code (e.g. DMC 321) when buying thread.</dd>
          <dt>How do I print to PDF?</dt>
          <dd>“Export / Share” → “Print / Save as PDF”, then choose “Save as PDF” as the destination in the print window.</dd>
        </dl>,
      ),
    },
  ];
}

export function Guide({ section }: { section?: string }) {
  const sections = useSections();

  // scroll to the requested section (deep links like #/guide/stitch)
  useEffect(() => {
    const el = section ? document.getElementById(`g-${section}`) : null;
    if (el) el.scrollIntoView({ block: 'start' });
    else window.scrollTo(0, 0);
  }, [section]);

  return (
    <div className="guide">
      <header className="site-head">
        <a className="icon-btn" href="#/" title={t('กลับหน้าแรก', 'Back to home')} aria-label={t('กลับหน้าแรก', 'Back to home')}><Icon name="back" /></a>
        <h2><Icon name="book" size={18} /> {t('คู่มือการใช้งาน', 'User guide')}</h2>
        <div className="spacer" />
        <AccountButton />
        <LangSwitch />
        <a className="btn primary sm" href="#/new/template">{t('เริ่มออกแบบ', 'Start designing')}</a>
      </header>
      <div className="guide-layout">
        <nav className="guide-toc" aria-label={t('สารบัญ', 'Contents')}>
          {sections.map((s) => (
            <button key={s.id} className={section === s.id ? 'on' : ''} onClick={() => navigate(`#/guide/${s.id}`)}>
              <Icon name={s.icon} size={15} /> {s.title}
            </button>
          ))}
        </nav>
        <main className="guide-body">
          {sections.map((s) => (
            <section key={s.id} id={`g-${s.id}`} className="guide-section">
              <h3><Icon name={s.icon} size={18} /> {s.title}</h3>
              {s.body}
            </section>
          ))}
          <p className="hint guide-end">
            {feedbackEnabled
              ? t('ยังไม่เจอคำตอบ หรือพบปัญหา? บอกเราได้เลย', 'Didn’t find your answer, or found a problem? Tell us.')
              : t('มีคำถามหรือพบปัญหา? ใช้ปุ่มย้อนกลับเพื่อกลับไปหน้าที่ใช้งานอยู่', 'Have a question or found a problem? Use the back button to return to the page you were on.')}
            {' '}<FeedbackLink />
          </p>
        </main>
      </div>
    </div>
  );
}
