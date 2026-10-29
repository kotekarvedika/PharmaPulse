# PharmaPulse – Smart Pharmacy & Expiry Management System

An intelligent pharmacy inventory management, expiry alert, POS checkout, and camera/image OCR medicine scanning system.

## 🚀 Features

- **Dashboard & FEFO Expiry Tracking**: Real-time expiry alerts (Critical <30d, Warning <60d, Healthy) using First-Expired-First-Out (FEFO) logic.
- **Inventory Management**: Add, update, filter, search, and manage stock batches with minimum safety thresholds.
- **OCR Camera & Image Scanner**: Automatic medicine label scanner powered by client-side Tesseract.js with image preprocessing (upscaling, contrast enhancement, grayscale) and server-side verification logging. Automatically extracts Batch Number, MFD, and EXP dates to populate Add Stock.
- **Point of Sale (POS) Checkout**: Live cart, discounts, tax computation, stock deduction, and thermal invoice printing.
- **Stock Disposal & Loss Write-off**: Record expired stock disposals and financial loss analytics.
- **Authentication**: JWT token authentication with role-based access.

---

## 🛠️ Technology Stack

- **Frontend**: Vanilla HTML5, CSS3, Tailwind CSS (via CDN), JavaScript ES6+
- **Backend**: Python Flask (`server.py`), Gunicorn (WSGI)
- **Database**: SQLite (`pharmapulse.db`) for local/standard deployments; PostgreSQL / Cloud SQL compatible via `DATABASE_URL`
- **OCR**: Tesseract.js (browser CDN) + backend `pytesseract` & scan logging

---

## 💻 Local Development

1. **Install Python dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Start the server**:
   Double-click `start_server.bat` or run:
   ```bash
   python server.py
   ```

3. Open `http://localhost:5000` in your browser.
   - Default Admin Login: `admin` / `admin123` (or sign up a new account on `login.html`)

---

## 🌐 Production Deployment Guide

### Option 1: Vercel Serverless (Simplest & Integrated)

1. Connect your GitHub repository to Vercel.
2. The included `vercel.json` and `api/index.py` will route all `/api/*` requests to the Flask serverless backend.
3. For persistent production data on serverless Vercel, provide a cloud PostgreSQL connection string (such as free Neon.tech or Supabase):
   - Set environment variable `DATABASE_URL` in Vercel Project Settings:
     `DATABASE_URL=postgresql://user:pass@ep-xyz.neon.tech/neondb?sslmode=require`
   - Set `SECRET_KEY=your_production_secret_key`

### Option 2: Render / Railway (Flask Backend) + Vercel (Frontend)

1. **Backend (Render / Railway)**:
   - Deploy as a Web Service from GitHub with command: `gunicorn server:app`
   - Set environment variables:
     - `PORT=10000`
     - `SECRET_KEY=your_secret_key`
2. **Frontend (Vercel)**:
   - In `vercel.json`, configure rewrite to proxy `/api/*` to your Render backend:
     ```json
     {
       "rewrites": [
         { "source": "/api/(.*)", "destination": "https://your-backend.onrender.com/api/$1" }
       ]
     }
     ```
   - Or in the browser console / settings, set `localStorage.setItem('pharmapulse_api_url', 'https://your-backend.onrender.com/api')`.

---

## 🔒 Security Measures

- `.db` database files, `.py` server files, and `.env` files are blocked from static file downloads.
- `SECRET_KEY` uses environment variables with fallback.
- Passwords are securely hashed with PBKDF2:SHA256.
