# 🚀 SCAMBOARD — Project Documentation (Full Season Archive)

เอกสารนี้รวบรวมทุกรายละเอียดของโปรเจกต์ **ScamBoard** ตั้งแต่เริ่มต้นจนถึงปัจจุบัน (Deploy เสร็จสมบูรณ์) เพื่อให้สามารถนำไปพัฒนาต่อยอดได้ทันทีโดยไม่ขาดช่วง

---

## 📌 1. Project Overview (ภาพรวมของเกม)
**ScamBoard** เป็นเกมกระดานออนไลน์แบบ Multiplayer สไตล์ Cyberpunk 3D ที่สร้างขึ้นเพื่อให้ความรู้ด้านความปลอดภัยทางไซเบอร์ (Cybersecurity) ผู้เล่นจะทอยลูกเต๋า เดินตามช่อง และต้องตอบคำถามรับมือกับการหลอกลวงรูปแบบต่างๆ (Phishing, Call Center, Romance Scam) หากตอบผิด "Scammer AI Boss" จะแข็งแกร่งขึ้นเรื่อยๆ 

**เป้าหมายของเกม:**
1. **โหมด Score:** แข่งกันทำคะแนน (เหรียญ) ให้ได้มากที่สุดเมื่อทุกคนเข้าเส้นชัย
2. **โหมด Race:** ใครเข้าเส้นชัยก่อนและมีชีวิตรอดจะเป็นผู้ชนะ
*ถ้าหลอดเลือดของ Scammer AI ถึง 100% ผู้เล่นทุกคนแพ้ทันที (Fatal Error / Mainframe Destroyed)*

---

## 🛠 2. Tech Stack & Architecture (เทคโนโลยีที่ใช้)

### Frontend (หน้าเว็บ - รันบน Vercel)
- **Framework:** React 18 + Vite (รันแบบ SPA - Single Page Application)
- **Styling:** Tailwind CSS v4 + Custom CSS Design System (`src/index.css`)
- **Animation:** Framer Motion (สำหรับ UI 2D, Modal, และ Card Flip)
- **3D Graphics:** Three.js + `@react-three/fiber` + `@react-three/drei` (สำหรับกระดานเกมและโมเดล 3D)
- **Multiplayer Client:** `socket.io-client` (เชื่อมต่อกับ Backend แบบ Real-time)

### Backend (เซิร์ฟเวอร์ - รันบน Render)
- **Runtime:** Node.js (ไฟล์ `server.mjs`)
- **Framework:** Express + Socket.IO
- **Database:** ไม่มี (สถานะเกมถูกเก็บไว้ในหน่วยความจำชั่วคราวของเซิร์ฟเวอร์ และดึงข้อมูล State จากเครื่อง Host)

---

## 📁 3. File Structure (โครงสร้างไฟล์ที่สำคัญ)

โปรเจกต์ถูกออกแบบมาให้จัดการง่าย โดยรวม Logic ไว้ที่จุดศูนย์กลาง:

- `src/ScamBoardGame.tsx`: **(ไฟล์หัวใจหลัก)** รวม State ทั้งหมดของเกม (UI, ระบบเทิร์น, Socket.io sync, ระบบร้านค้า, บอส)
- `src/gameData.ts`: ฐานข้อมูลของเกม (รายชื่อตัวละคร, คำถาม Cyber, คำถาม Bonus, ไอเทมในร้านค้า, คำด่าของบอส)
- `src/components/GameBoard3D.tsx`: คอมโพเนนต์ที่จัดการการเรนเดอร์กระดาน 3D (แสง, กล้อง, การเดินของหมาก)
- `src/WebGLDice.tsx`: คอมโพเนนต์ลูกเต๋า 3D (ใช้ Cannon.js หรือ Physics จำลองการกลิ้ง)
- `src/index.css`: ไฟล์ Design System ที่เก็บตัวแปรสีสไตล์ Cyberpunk (Orbitron font, Neon Glows, Scanlines)
- `server.mjs`: เซิร์ฟเวอร์ Socket.io ทำหน้าที่เป็นตัวกลางรับ-ส่ง `state_update` ระหว่างผู้เล่น
- `.env.production`: เก็บตัวแปร `VITE_SERVER_URL` สำหรับชี้ไปที่ Render (Backend)

---

## 🎮 4. Game Mechanics (ระบบกลไกของเกม)

### 4.1 ระบบเทิร์น (Turn-based System)
1. **Idle:** รอผู้เล่นทอยเต๋า หรือใช้ไอเทม
2. **Rolling:** แอนิเมชันลูกเต๋ากลิ้ง
3. **Moving:** หมาก 3D เดินตามช่อง
4. **Resolving Event:** สุ่มคำถาม Cyber / โบนัส / เปิดร้านค้า ตามสีของช่องที่ตก
5. **Turn End:** สรุปเทิร์น เช็คเลือดบอส และเปลี่ยนตาผู้เล่นคนถัดไป

### 4.2 ระบบ Scammer AI Boss (ความยากที่เพิ่มขึ้น)
- **Base Mechanic:** เมื่อผู้เล่นตอบคำถาม Cyber ผิด บอสจะได้พลังเพิ่ม (หลอดเลือดเพิ่มขึ้นเริ่มต้น +15) หากตอบถูกผู้เล่นโจมตีสวนกลับ (-5)
- **Threat Level Scaling:** ทุกครั้งที่วนครบ 1 รอบ (ทุกคนเล่นจบ 1 ตา) `roundCount` จะ +1 ซึ่งจะทำให้บอสโจมตีแรงขึ้น 20% ทุกๆ รอบ (ตัวแปร `threatMultiplier` ใน `handleCyberAnswer`)
- **Game Over:** หากบอสหลอดเลือดเต็ม 100% เกมจะตัดเข้าหน้าจอ `gameover_boss` ทันที

### 4.3 Black Market (ระบบร้านค้า)
ผู้เล่นสามารถซื้อไอเทมได้เมื่อตกช่องร้านค้า (ช่องสีม่วง) เพื่อใช้ในเทิร์นของตัวเอง (ก่อนทอยเต๋า):
- **FIREWALL (3 เหรียญ):** เปิดโล่ป้องกันสถานะผิดปกติ 1 ครั้ง (`p.isProtected`)
- **DDOS ATTACK (4 เหรียญ):** ข้ามเทิร์นผู้เล่นคนถัดไป (`p.isSkipped`)
- **DATA HEIST (5 เหรียญ):** ขโมย 2 เหรียญจากคนที่มีเงินเยอะสุด
- **TELEPORT (6 เหรียญ):** สลับตำแหน่งกับคนที่อยู่หน้าสุด
- **โยนขี้ / EXPOSE (5 เหรียญ):** บังคับให้คนอื่นโดนคำถาม Cyber ในเทิร์นถัดไป (`forcedCyber`)

### 4.4 Badge & Achievements (ระบบความสำเร็จ)
- ป้ายรางวัล (เช่น `CYBER GUARDIAN` ได้เมื่อตอบถูก 3 ข้อติด) จะแสดงใต้ชื่อผู้เล่น
- **Persistence:** ข้อมูลป้ายรางวัลจะถูกเซฟลง `localStorage` อัตโนมัติ (key: `scamboard_badges`) ทำให้ปิดเกมแล้วกลับมาเล่นใหม่ ป้ายก็ยังอยู่ตลอดไป

---

## 🎨 5. Design System: UX/UI Pro Max
ตัวเกมถูกออกแบบด้วยคอนเซปต์ **"AAA Premium Cyberpunk + Modern Dark Cinema"** โดยดึงกฎการออกแบบมาจาก `ui-ux-pro-max` skill:
- **Typography:** 
  - `Orbitron` (Weight 700/900) สำหรับ Headings ทั้งหมด (SCAMBOARD, MISSION CONFIG, FATAL ERROR)
  - `JetBrains Mono` สำหรับ Body, ข้อมูลตัวเลข, และ Log
- **Color Palette:** 
  - Background: `#050507` (Void Black)
  - Cards: `rgba(30,28,53,0.6)` (Glassmorphism + Backdrop Blur)
  - Primary Neon: Purple (`#7C3AED`), Cyan (`#00D4FF`), Cyber Green (`#00FF88`), Rose Danger (`#F43F5E`)
- **Micro-interactions:**
  - `.sb-scanlines`: เอฟเฟกต์เส้นสแกนทีวีบนการ์ดเมนู
  - `.sb-pressable`: ปุ่มบุ๋มลงเมื่อกด (Scale 0.97)
  - แอนิเมชัน Glitch เมื่อตอบผิด หรือบอสใกล้ตาย (เลือด > 75%)

---

## 🌐 6. Deployment & Infrastructure

**1. Frontend (Vercel)**
- URL: [https://scamboard-azure.vercel.app](https://scamboard-azure.vercel.app)
- Build Command: `npm install && npm run build`
- Environment Variables: `VITE_SERVER_URL=https://scamboard.onrender.com`

**2. Backend (Render)**
- URL: `https://scamboard.onrender.com`
- Build Command: `npm install`
- Start Command: `node server.mjs`
- Port: `process.env.PORT || 3001`

*(ถ้ามีการแก้โค้ดใน GitHub ระบบ Vercel และ Render จะทำการ Auto-Deploy ใหม่ให้อัตโนมัติ)*

---

## 🔮 7. Roadmap สำหรับการพัฒนาต่อยอด (Next Steps)

หากต้องการนำไปทำต่อ นี่คือ Feature ที่แนะนำให้ทำใน Season หน้า:
1. **Database Persistence:** เปลี่ยนจาก `localStorage` ไปใช้ Database จริง (เช่น Supabase หรือ Firebase) เพื่อเก็บ Badge และสถิติผู้เล่นข้ามเครื่องได้
2. **Account System:** ทำระบบ Login (NextAuth/Clerk) ให้ผู้เล่นมีโปรไฟล์เป็นของตัวเอง
3. **New Cards & Tiles:** เพิ่มช่องพิเศษใน `gameData.ts` เช่น ช่อง Mini-game หรือช่องสุ่มกาชา
4. **Mobile Optimization:** ถึงแม้ UI จะทำเผื่อมือถือไว้แล้ว แต่หน้าจอ 3D อาจกินทรัพยากรมือถือเก่า แนะนำให้เพิ่มปุ่ม "Low Graphics Mode" เพื่อปิดเงา 3D
5. **Sound Manager:** ใส่ไฟล์เสียงจริงเข้าไปในฟังก์ชันของ `AudioEngine` (ปัจจุบันเป็นการสังเคราะห์เสียงผ่าน AudioContext เบื้องต้น)

---
*Generated by Antigravity AI - 27 July 2026*
