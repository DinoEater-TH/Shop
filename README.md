# DinoEater Shop

Mobile-first PWA สำหรับรับออเดอร์ร้าน DinoEater โดยใช้ Google Sheets เป็นฐานข้อมูล และ Google Apps Script เป็น REST API

## เริ่ม Frontend

1. คัดลอก `.env.example` เป็น `.env`
2. ใส่ URL ที่ได้จากการ Deploy Apps Script ใน `VITE_API_URL`
3. รัน `npm.cmd install` แล้ว `npm.cmd run dev`

## ติดตั้ง Google Apps Script

1. เปิด [Google Apps Script](https://script.google.com/) แล้วสร้างโปรเจกต์ใหม่
2. วางเนื้อหา `apps-script/Code.gs` ทั้งหมด แล้วบันทึก
3. รันฟังก์ชัน `setupDatabase` หนึ่งครั้งและอนุญาตสิทธิ์ Google Sheets/Drive
4. Deploy > New deployment > Web app
5. ตั้ง Execute as: **Me**, Who has access: **Anyone** แล้วคัดลอก URL ลง `VITE_API_URL`

Google Account ที่ Deploy ต้องมีสิทธิ์ Editor ของ spreadsheet ID ที่ตั้งไว้ใน `Code.gs` และ Google Drive ที่ใช้เก็บรูป

บัญชีผู้ดูแล: หลังรัน `setupDatabase()` ให้เพิ่มแถวในชีต `Users` ด้วยเบอร์โทร แล้วกำหนดคอลัมน์ `Role` เป็น `Admin` หรือ `SuperAdmin` ลูกค้าทั่วไปเข้าสู่ระบบด้วยเบอร์โทรเท่านั้น แต่บัญชี `Admin`/`SuperAdmin` ต้องตั้งรหัส PIN เองครั้งแรกที่เข้าสู่ระบบ (กรอกสองครั้ง) แล้วต้องกรอก PIN ทุกครั้งที่ล็อกอินภายหลัง เปลี่ยน PIN ได้ที่หน้าโปรไฟล์ และระบบจะออก session 6 ชั่วโมงหลังเข้าสู่ระบบ ส่วนคำสั่งดู/เปลี่ยนสถานะออเดอร์และการตั้งค่าจะตรวจสิทธิ์ที่ API

แอดมินดูโปรไฟล์สมาชิกได้ที่แท็บ **สมาชิกและแสตมป์** โดยแตะที่ชื่อสมาชิกเพื่อเปิดหน้าประวัติ (จำนวนออเดอร์ ออเดอร์ที่สำเร็จ ยอดใช้จ่าย แยกเงินสด/โอนยอด แสตมป์ และประวัติการสั่งซื้อทั้งหมด)

> ระบบคำนวณยอดอาหาร ค่าจัดส่ง ส่วนลด และแสตมป์บน Frontend ก่อนบันทึกตามข้อกำหนด ควรใช้สิทธิ์ Admin เฉพาะผู้ดูแลที่เชื่อถือได้เมื่อเปิดใช้งานจริง

ลูกค้าสามารถสั่งซื้อโดยไม่ระบุเบอร์โทรได้ (เป็นลูกค้าทั่วไป ไม่สะสมแสตมป์) และจะได้รับข้อความชวนลงทะเบียนหลังสั่งซื้อ โดยกรอกเพียงเบอร์โทรและชื่อ (ไม่บังคับ) ระบบจะสะสมแสตมป์ย้อนหลังจากออเดอร์ที่ตรงเบอร์ให้อัตโนมัติ และแสดงประวัติการซื้อพร้อมปุ่มสั่งซื้อซ้ำในหน้าโปรไฟล์

## Deploy ขึ้น GitHub Pages

เว็บอยู่ที่ https://dinoeater-th.github.io/Shop/ และ deploy อัตโนมัติเมื่อ push เข้า `main` ผ่าน `.github/workflows/deploy.yml`

ตั้งค่าที่ repo: `Settings` > `Pages` > `Source` ต้องเป็น **GitHub Actions** ทุกครั้งที่ push เข้า `main` ระบบจะ build ด้วย `npm ci` + `npm run build` แล้ว publish โฟลเดอร์ `dist` ให้เอง

ค่าตั้งของ build มาจาก `.env.production` (API URL แบบ public) และ `vite.config.js` กำหนด `base: '/Shop/'` ให้ตรงกับ path ของ repo

## ข้อมูลทดสอบ

- SuperAdmin: เบอร์ `0800000000` (ครั้งแรกที่ล็อกอินระบบจะให้ตั้ง PIN ผู้ดูแลเอง กรอก 4-8 หลัก จากนั้นใช้ PIN นี้ทุกครั้ง · เปลี่ยน PIN ได้ที่หน้าโปรไฟล์)
- คำสั่ง `seedDemo` ใน Apps Script ใส่เมนูตัวอย่าง 4 รายการและบัญชี SuperAdmin เมื่อชีตยังว่าง

