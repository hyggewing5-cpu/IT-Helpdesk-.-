# ระบบแจ้งซ่อมงานสารสนเทศ (IT Helpdesk)

ระบบแจ้งซ่อมออนไลน์ของงานสารสนเทศ รพ.กองบิน บน.5 สร้างด้วย Google Apps Script + Google Sheets แจ้งเตือนผ่าน Telegram

- ผู้แจ้งส่งใบแจ้งซ่อมได้โดยไม่ต้องเข้าสู่ระบบ แนบรูปได้ และติดตามงานด้วยเลขที่ใบแจ้ง + เบอร์โทร
- เจ้าหน้าที่ IT เข้าสู่ระบบหลังบ้านเพื่อรับงาน อัปเดตสถานะ ดู Dashboard และออกรายงานรายวัน/รายเดือน
- ส่งสรุปงานประจำวันเข้า Telegram เวลา 16:30 น.

## โครงสร้าง

```
index.html        หน้า landing สำหรับ GitHub Pages (ปุ่มไปยัง Web App + QR Code)
poster/poster.html  โปสเตอร์ประชาสัมพันธ์ A4 (เปิดในเบราว์เซอร์แล้วสั่งพิมพ์/บันทึกเป็น PDF ได้)
apps-script/      โค้ดที่นำไปวางใน Google Apps Script
  Code.js         ฝั่งเซิร์ฟเวอร์ (API, ฐานข้อมูล Sheets, ล็อกอิน, Telegram)
  Index.html      หน้าแจ้งซ่อม/ติดตามงาน
  Admin.html      หน้าหลังบ้านเจ้าหน้าที่
  Common.html     ฟังก์ชันที่ใช้ร่วมกัน
  Styles.html     CSS
  appsscript.json manifest
```

## วิธีติดตั้ง

1. สร้าง Google Sheet ใหม่ แล้วเปิด **ส่วนขยาย → Apps Script**
2. สร้างไฟล์ตามโฟลเดอร์ `apps-script/` และวางโค้ดให้ครบ ชื่อไฟล์ต้องตรงกัน (เช่น `Index`, `Admin`, `Common`, `Styles`)
   เปิดการแสดง `appsscript.json` ได้ที่ Project Settings → Show "appsscript.json"
3. ตั้งค่า **Project Settings → Script Properties**
   - `TELEGRAM_BOT_TOKEN` = โทเคนบอทจาก @BotFather
   - `TELEGRAM_CHAT_ID` = ไอดีกลุ่ม/แชทที่รับแจ้งเตือน
4. เลือกฟังก์ชัน `setup` แล้วกด Run (ครั้งแรกต้องอนุญาตสิทธิ์)
   ดู **รหัสผ่านแอดมินที่สุ่มให้** ได้ใน Execution log (บัญชี `admin`) แล้วเปลี่ยนรหัสผ่านทันทีหลังเข้าระบบครั้งแรก
5. (ไม่บังคับ) รัน `testTelegram` เพื่อทดสอบแจ้งเตือน และ `installDailySummaryTrigger` เพื่อตั้งเวลาสรุปประจำวัน
6. **Deploy → New deployment → Web app**
   Execute as: *Me* · Who has access: *Anyone* แล้วคัดลอก URL ที่ลงท้าย `/exec`
7. เปิด `index.html` ที่ราก repo แก้ค่า `WEBAPP_URL` เป็น URL จากข้อ 6 จากนั้นเปิด GitHub Pages (Settings → Pages)

## ความปลอดภัย

- ห้ามใส่โทเคน Telegram, Chat ID หรือรหัสผ่านลงในโค้ดหรือ repo ให้เก็บใน Script Properties เท่านั้น
- รหัสผ่านถูกเก็บแบบ salt + hash ล็อกอินผิดเกิน 5 ครั้งจะถูกล็อก 15 นาที
- รูปที่แนบถูกจำกัดเฉพาะ JPG/PNG/WEBP ไม่เกิน 5 MB และเก็บในโฟลเดอร์ `IT_Helpdesk_Images` ใน Google Drive (เปิดดูได้ด้วยลิงก์) **ห้ามถ่ายให้เห็นข้อมูลผู้ป่วย**
- ไม่ควร commit ไฟล์ `.clasp.json` (มี scriptId)

## ผู้พัฒนา

พ.อ.อ.วีรพจน์ ยิ้มเยาะ · สมนส.ฝูง.501 บน.5 · โทร. 6-0449
