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

บัญชีผู้ดูแล: หลังรัน `setupDatabase()` ให้เพิ่มแถวในชีต `Users` ด้วยเบอร์โทรและ PIN ของผู้ดูแล แล้วกำหนดคอลัมน์ `Role` เป็น `Admin` หรือ `SuperAdmin` ระบบจะออก session 6 ชั่วโมงหลังเข้าสู่ระบบ และคำสั่งดู/เปลี่ยนสถานะออเดอร์กับการตั้งค่าจะตรวจสิทธิ์ที่ API

> ระบบคำนวณยอดอาหาร ค่าจัดส่ง ส่วนลด และแสตมป์บน Frontend ก่อนบันทึกตามข้อกำหนด ควรใช้สิทธิ์ Admin เฉพาะผู้ดูแลที่เชื่อถือได้เมื่อเปิดใช้งานจริง

## Deploy ขึ้น GitHub Pages

เว็บอยู่ที่ https://dinoeater-th.github.io/Shop/ และ deploy อัตโนมัติเมื่อ push เข้า `main` ผ่าน `.github/workflows/deploy.yml`

ตั้งค่าที่ repo: `Settings` > `Pages` > `Source` ต้องเป็น **GitHub Actions** ทุกครั้งที่ push เข้า `main` ระบบจะ build ด้วย `npm ci` + `npm run build` แล้ว publish โฟลเดอร์ `dist` ให้เอง

ค่าตั้งของ build มาจาก `.env.production` (API URL แบบ public) และ `vite.config.js` กำหนด `base: '/Shop/'` ให้ตรงกับ path ของ repo

## ข้อมูลทดสอบ

- SuperAdmin: เบอร์ `0800000000` / PIN `1234`
- คำสั่ง `seedDemo` ใน Apps Script ใส่เมนูตัวอย่าง 4 รายการและบัญชี SuperAdmin เมื่อชีตยังว่าง

