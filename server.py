import os
import sqlite3
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import jwt
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
APP_DIR = os.path.dirname(os.path.abspath(__file__))

# Support Vercel serverless /tmp writable storage or custom persistent DB_PATH
IS_VERCEL = bool(os.environ.get('VERCEL') or os.environ.get('AWS_LAMBDA_FUNCTION_NAME'))
if IS_VERCEL or os.environ.get('USE_TMP_DB'):
    TMP_DIR = '/tmp'
    TMP_DB = os.path.join(TMP_DIR, 'pharmapulse.db')
    SEED_DB = os.path.join(APP_DIR, 'pharmapulse.db')
    if not os.path.exists(TMP_DB) and os.path.exists(SEED_DB):
        try:
            import shutil
            shutil.copy2(SEED_DB, TMP_DB)
        except Exception as e:
            print(f"Seed DB copy warning: {e}")
    DB_PATH = TMP_DB
else:
    DB_PATH = os.environ.get('DB_PATH', os.path.join(APP_DIR, 'pharmapulse.db'))

app = Flask(__name__, static_folder=None)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'pharmapulse_super_secret_key_prod_2026')
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def get_relative_date(days_offset):
    return (datetime.now().date() + timedelta(days=days_offset)).isoformat()

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.executescript("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'staff',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        contact_person TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS medicines (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        generic_name TEXT,
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        dosage_form TEXT,
        min_threshold INTEGER DEFAULT 20,
        prescription_required INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS medicine_batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        medicine_id TEXT NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
        batch_no TEXT NOT NULL,
        mfd_date TEXT,
        exp_date TEXT NOT NULL,
        rack_location TEXT,
        stock_qty INTEGER NOT NULL CHECK (stock_qty >= 0),
        unit_price REAL NOT NULL,
        cost_price REAL NOT NULL,
        discount_percentage REAL DEFAULT 0,
        supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
        is_disposed INTEGER DEFAULT 0,
        status TEXT DEFAULT 'ACTIVE',
        sales_count_30_days INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (medicine_id, batch_no)
    );

    CREATE TABLE IF NOT EXISTS sales_invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number TEXT UNIQUE NOT NULL,
        customer_name TEXT DEFAULT 'Walk-in Customer',
        customer_phone TEXT,
        rx_number TEXT,
        payment_method TEXT NOT NULL,
        subtotal REAL NOT NULL,
        tax_rate REAL DEFAULT 0.12,
        tax_amount REAL NOT NULL,
        cart_discount REAL DEFAULT 0.0,
        grand_total REAL NOT NULL,
        pharmacist TEXT DEFAULT 'Dr. Alex (Lic #PH-4920)',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sales_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
        batch_id INTEGER REFERENCES medicine_batches(id),
        medicine_id TEXT,
        medicine_name TEXT,
        batch_no TEXT,
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        discount_percentage REAL DEFAULT 0,
        line_total REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stock_disposals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id INTEGER REFERENCES medicine_batches(id),
        medicine_id TEXT,
        medicine_name TEXT,
        batch_no TEXT,
        quantity INTEGER NOT NULL,
        cost_price_at_disposal REAL NOT NULL,
        loss_amount REAL NOT NULL,
        reason TEXT DEFAULT 'Expired Shelf-Life',
        disposed_by TEXT DEFAULT 'Dr. Alex Sterling',
        disposed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        notes TEXT
    );

    CREATE TABLE IF NOT EXISTS ocr_scan_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        raw_ocr_text TEXT,
        detected_name TEXT,
        detected_batch TEXT,
        detected_mfd TEXT,
        detected_exp TEXT,
        transferred_to_stock INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Indexes for fast FEFO querying and expiry search
    CREATE INDEX IF NOT EXISTS idx_batch_expiry ON medicine_batches(exp_date);
    CREATE INDEX IF NOT EXISTS idx_batch_med ON medicine_batches(medicine_id);
    """)
    conn.commit()

    # Seed initial medicines if empty
    cursor.execute("SELECT COUNT(*) FROM medicines")
    if cursor.fetchone()[0] == 0:
        seed_initial_data(conn)

    # Seed default admin user if users table is empty
    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] == 0:
        default_hash = generate_password_hash('admin123', method='pbkdf2:sha256')
        cursor.execute("INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)",
                       ('admin', 'admin@pharmapulse.com', default_hash, 'admin'))
        conn.commit()

    conn.close()

def seed_initial_data(conn):
    cursor = conn.cursor()
    initial_items = [
      ("MED-001", "Paracetamol 650mg (Dolo)", "Paracetamol BP 650mg", "Analgesics & Pain", "Tablet (Strip of 15)", "PCM-902", -360, 4, "Rack A-02", 42, 30, 3.50, 2.10, 0, "Micro Labs Healthcare", 0, 148),
      ("MED-002", "Augmentin 625 Duo", "Amoxicillin 500mg + Clavulanic Acid 125mg", "Antibiotics", "Tablet (Strip of 10)", "AUG-441", -330, 8, "Rack B-08", 18, 25, 14.80, 9.50, 20, "GlaxoSmithKline Pharma", 1, 95),
      ("MED-003", "Azithromycin 500mg (Azee)", "Azithromycin Dihydrate 500mg", "Antibiotics", "Tablet (Strip of 5)", "AZI-819", -400, -3, "Rack B-14", 12, 20, 8.90, 5.20, 0, "Cipla Therapeutics", 1, 80),
      ("MED-004", "Cough Relief DX Syrup", "Dextromethorphan + Chlorpheniramine 100ml", "Respiratory", "Syrup (100ml Bottle)", "CRD-104", -380, -7, "Rack C-03", 9, 15, 6.20, 3.40, 0, "Pfizer Global Supply", 0, 52),
      ("MED-005", "Insulin Glargine 100IU/ml (Lantus)", "Insulin Glargine Solostar Pen", "Diabetes Care", "Injectable Pen (3ml)", "INS-302", -280, 14, "Cold Storage CS-1 (4°C)", 8, 15, 34.50, 24.00, 15, "Sanofi India Ltd", 1, 42),
      ("MED-006", "Salbutamol Inhaler (Asthalin 100mcg)", "Salbutamol 100mcg CFC-Free", "Respiratory", "Inhaler (200 Actuations)", "SAL-602", -180, 22, "Rack C-09", 34, 20, 5.50, 3.20, 10, "Cipla Therapeutics", 1, 110),
      ("MED-007", "Metformin 500mg SR (Glycomet)", "Metformin Hydrochloride Sustained Release", "Diabetes Care", "Tablet (Strip of 20)", "MET-204", -150, 185, "Rack D-01", 120, 40, 4.20, 2.20, 0, "USV Private Ltd", 1, 165),
      ("MED-008", "Atorvastatin 20mg (Lipitor)", "Atorvastatin Calcium Trihydrate 20mg", "Cardiovascular", "Tablet (Strip of 15)", "ATO-772", -100, 290, "Rack E-04", 65, 30, 11.20, 7.00, 0, "Sun Pharma Industries", 1, 88),
      ("MED-009", "Pantoprazole 40mg (Pan 40)", "Pantoprazole Gastro-Resistant 40mg", "Gastrointestinal", "Tablet (Strip of 15)", "PAN-519", -120, 210, "Rack A-11", 85, 35, 7.80, 4.30, 0, "Alkem Laboratories", 0, 132),
      ("MED-010", "Vitamin D3 60,000 IU (Calcirol)", "Cholecalciferol Softgel Capsules", "Vitamins & Supplements", "Softgel (Strip of 4)", "CAL-380", -90, 365, "Rack F-02", 54, 25, 5.90, 3.10, 0, "Cadila Healthcare", 0, 92),
      ("MED-011", "Ciprofloxacin Eye/Ear Drops 0.3%", "Ciprofloxacin Hydrochloride 5ml", "Emergency & Critical", "Sterile Drops (5ml Vial)", "CIP-019", -350, -1, "Rack G-01", 6, 15, 4.10, 2.30, 0, "FDC Ltd", 1, 31),
      ("MED-012", "Cetirizine 10mg (Cetzine)", "Cetirizine Dihydrochloride 10mg", "Analgesics & Pain", "Tablet (Strip of 10)", "CET-622", -160, 250, "Rack A-05", 90, 30, 2.80, 1.20, 0, "Dr. Reddy's Labs", 0, 140),
      ("MED-013", "Telmisartan 40mg (Telma 40)", "Telmisartan BP 40mg", "Cardiovascular", "Tablet (Strip of 15)", "TEL-993", -75, 410, "Rack E-02", 70, 25, 9.60, 5.80, 0, "Glenmark Pharmaceuticals", 1, 85),
      ("MED-014", "Clotrimazole 1% Antifungal Cream", "Clotrimazole Topical USP 1% w/w", "Dermatology", "Ointment Tube (30g)", "CLO-511", -260, 18, "Rack H-04", 22, 15, 4.80, 2.50, 25, "Bayer Healthcare", 0, 45),
      ("MED-015", "ORS Electrolyte Rehydration Salts", "Oral Rehydration Salts WHO Formula", "Emergency & Critical", "Powder Sachet (21.8g)", "ORS-102", -60, 550, "Rack A-01", 180, 50, 1.20, 0.50, 0, "FDC Ltd", 0, 210),
      ("MED-016", "Ibuprofen 400mg (Brufen)", "Ibuprofen BP 400mg Film-Coated", "Analgesics & Pain", "Tablet (Strip of 15)", "BRU-733", -310, 28, "Rack A-04", 14, 20, 3.90, 2.10, 15, "Abbott Healthcare", 0, 89),
      ("MED-017", "Zinc & Vitamin C Chewables (Limcee)", "Ascorbic Acid 500mg Chewable", "Vitamins & Supplements", "Chewable Tablet (Strip of 15)", "LIM-421", -110, 320, "Rack F-04", 95, 30, 3.10, 1.40, 0, "Abbott Healthcare", 0, 125),
      ("MED-018", "Epinephrine Auto-Injector (EpiPen 0.3mg)", "Epinephrine Injection USP 1:1000", "Emergency & Critical", "Auto-Injector (Single Dose)", "EPI-990", -200, 110, "Emergency Bay E-1", 5, 8, 120.00, 90.00, 0, "Mylan Specialty", 1, 14)
    ]

    for item in initial_items:
        med_id, name, generic, cat_name, dosage, batch, mfd_off, exp_off, rack, stock, min_th, price, cost, disc, supp_name, rx, sales_count = item
        
        # Category
        cursor.execute("INSERT OR IGNORE INTO categories (name) VALUES (?)", (cat_name,))
        cursor.execute("SELECT id FROM categories WHERE name = ?", (cat_name,))
        cat_id = cursor.fetchone()[0]

        # Supplier
        cursor.execute("INSERT OR IGNORE INTO suppliers (name) VALUES (?)", (supp_name,))
        cursor.execute("SELECT id FROM suppliers WHERE name = ?", (supp_name,))
        supp_id = cursor.fetchone()[0]

        # Medicine
        cursor.execute("""
            INSERT OR REPLACE INTO medicines (id, name, generic_name, category_id, dosage_form, min_threshold, prescription_required)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (med_id, name, generic, cat_id, dosage, min_th, rx))

        # Batch
        mfd_date = get_relative_date(mfd_off)
        exp_date = get_relative_date(exp_off)
        cursor.execute("""
            INSERT OR REPLACE INTO medicine_batches 
            (medicine_id, batch_no, mfd_date, exp_date, rack_location, stock_qty, unit_price, cost_price, discount_percentage, supplier_id, is_disposed, sales_count_30_days)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
        """, (med_id, batch, mfd_date, exp_date, rack, stock, price, cost, disc, supp_id, sales_count))

    # Seed past sales invoices
    cursor.execute("""
        INSERT OR IGNORE INTO sales_invoices (invoice_number, customer_name, payment_method, subtotal, tax_rate, tax_amount, grand_total, created_at)
        VALUES 
        ('INV-9401', 'Sarah Jenkins', 'UPI / QR', 34.46, 0.12, 4.14, 38.60, datetime('now')),
        ('INV-9400', 'Robert Chen', 'Credit Card', 16.34, 0.12, 1.96, 18.30, datetime('now')),
        ('INV-9399', 'Maria Gonzalez', 'Cash', 55.71, 0.12, 6.69, 62.40, datetime('now', '-1 day'))
    """)

    conn.commit()

# ========================================================
# API ROUTES
# ========================================================

BLOCKED_FILES = {'pharmapulse.db', 'server.py', 'start_server.bat', 'requirements.txt', '.env', '.gitignore', 'vercel.json', 'procfile'}

@app.route('/')
def serve_index():
    return send_from_directory(APP_DIR, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    # Security: never serve database files, python source code or sensitive config files
    normalized = path.replace('\\', '/').lower().strip('/')
    filename = os.path.basename(normalized)
    if filename in BLOCKED_FILES or normalized.endswith('.db') or normalized.endswith('.py') or normalized.endswith('.env'):
        return jsonify({"error": "Access forbidden"}), 403

    target_file = os.path.join(APP_DIR, path)
    if os.path.isfile(target_file):
        return send_from_directory(APP_DIR, path)
    return send_from_directory(APP_DIR, 'index.html')

# ========================================================
# AUTHENTICATION
# ========================================================

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            if auth_header.startswith('Bearer '):
                token = auth_header.split(' ')[1]
        
        if not token:
            return jsonify({'message': 'Token is missing!'}), 401

        try:
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
            current_user = data['user_id']
        except Exception as e:
            return jsonify({'message': 'Token is invalid!', 'error': str(e)}), 401
            
        return f(*args, **kwargs)
    return decorated

@app.route('/api/auth/signup', methods=['POST'])
def signup():
    data = request.json
    if not data or not data.get('username') or not data.get('email') or not data.get('password'):
        return jsonify({'message': 'Missing fields'}), 400
        
    hashed_password = generate_password_hash(data['password'], method='pbkdf2:sha256')
    
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
                       (data['username'], data['email'], hashed_password))
        conn.commit()
        return jsonify({'message': 'User created successfully'}), 201
    except sqlite3.IntegrityError:
        return jsonify({'message': 'Username or email already exists'}), 400
    finally:
        conn.close()

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'message': 'Missing fields'}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    user = cursor.execute("SELECT * FROM users WHERE username = ?", (data['username'],)).fetchone()
    conn.close()
    
    if user and check_password_hash(user['password_hash'], data['password']):
        token = jwt.encode({
            'user_id': user['id'],
            'username': user['username'],
            'role': user['role'],
            # Changed from datetime.utcnow() to datetime.now() because utcnow is deprecated in recent py versions. 
            'exp': datetime.now() + timedelta(hours=24)
        }, app.config['SECRET_KEY'], algorithm="HS256")
        
        return jsonify({'token': token})
        
    return jsonify({'message': 'Invalid credentials'}), 401

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "connected",
        "database": f"SQLite ({os.path.basename(DB_PATH)})",
        "environment": "vercel_serverless" if IS_VERCEL else "standard",
        "timestamp": datetime.now().isoformat()
    })

# 1. GET INVENTORY (Matches frontend AppState.medicines format)
@app.route('/api/inventory', methods=['GET'])
@token_required
def get_inventory():
    conn = get_db_connection()
    cursor = conn.cursor()
    query = """
    SELECT 
        m.id,
        m.name,
        m.generic_name AS genericName,
        IFNULL(c.name, 'General') AS category,
        m.dosage_form AS dosage,
        b.id AS batchId,
        b.batch_no AS batchNo,
        b.mfd_date AS mfdDate,
        b.exp_date AS expDate,
        b.rack_location AS rackLocation,
        b.stock_qty AS stockQty,
        m.min_threshold AS minThreshold,
        b.unit_price AS unitPrice,
        b.cost_price AS costPrice,
        b.discount_percentage AS discountPercentage,
        IFNULL(s.name, 'Direct Supply') AS supplier,
        CASE WHEN m.prescription_required = 1 THEN 1 ELSE 0 END AS prescriptionRequired,
        b.sales_count_30_days AS salesCount30Days,
        CASE WHEN b.is_disposed = 1 THEN 1 ELSE 0 END AS isDisposed
    FROM medicine_batches b
    JOIN medicines m ON b.medicine_id = m.id
    LEFT JOIN categories c ON m.category_id = c.id
    LEFT JOIN suppliers s ON b.supplier_id = s.id
    ORDER BY b.exp_date ASC
    """
    rows = cursor.execute(query).fetchall()
    conn.close()

    items = []
    for r in rows:
        d = dict(r)
        d['prescriptionRequired'] = bool(d['prescriptionRequired'])
        d['isDisposed'] = bool(d['isDisposed'])
        items.append(d)

    return jsonify(items)

# 2. ADD NEW STOCK / MEDICINE (From Add Stock form / OCR Scanner)
@app.route('/api/inventory', methods=['POST'])
@token_required
def add_inventory():
    data = request.json or {}
    name = data.get('name', '').strip()
    generic = data.get('genericName', '').strip() or name
    category_name = data.get('category', 'General')
    batch_no = data.get('batchNo', '').strip().upper()
    mfd_date = data.get('mfdDate') or get_relative_date(-30)
    exp_date = data.get('expDate')
    rack = data.get('rackLocation', 'Rack A-01')
    stock_qty = int(data.get('stockQty', 0))
    min_threshold = int(data.get('minThreshold', 15))
    unit_price = float(data.get('unitPrice', 0))
    cost_price = float(data.get('costPrice', unit_price * 0.65))
    supplier_name = data.get('supplier', 'Generic Pharma Direct')
    rx_required = 1 if data.get('prescriptionRequired') else 0
    med_id = data.get('id') or f"MED-{int(datetime.now().timestamp()) % 1000:03d}"

    if not name or not batch_no or not exp_date or stock_qty < 0:
        return jsonify({"error": "Missing mandatory fields"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # Category
        cursor.execute("INSERT OR IGNORE INTO categories (name) VALUES (?)", (category_name,))
        cursor.execute("SELECT id FROM categories WHERE name = ?", (category_name,))
        cat_id = cursor.fetchone()[0]

        # Supplier
        cursor.execute("INSERT OR IGNORE INTO suppliers (name) VALUES (?)", (supplier_name,))
        cursor.execute("SELECT id FROM suppliers WHERE name = ?", (supplier_name,))
        supp_id = cursor.fetchone()[0]

        # Medicine master
        cursor.execute("""
            INSERT OR REPLACE INTO medicines (id, name, generic_name, category_id, dosage_form, min_threshold, prescription_required)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (med_id, name, generic, cat_id, data.get('dosage', 'Standard Pack'), min_threshold, rx_required))

        # Batch
        cursor.execute("""
            INSERT INTO medicine_batches 
            (medicine_id, batch_no, mfd_date, exp_date, rack_location, stock_qty, unit_price, cost_price, discount_percentage, supplier_id, is_disposed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        """, (med_id, batch_no, mfd_date, exp_date, rack, stock_qty, unit_price, cost_price, 0, supp_id))

        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": f"{name} (Batch {batch_no}) enrolled into database.", "id": med_id}), 201
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"error": str(e)}), 500

# 3. APPLY CLEARANCE DISCOUNT
@app.route('/api/inventory/<med_id>/discount', methods=['PUT'])
@token_required
def update_discount(med_id):
    data = request.json or {}
    percentage = float(data.get('discountPercentage', 0))

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE medicine_batches 
        SET discount_percentage = ?
        WHERE medicine_id = ?
    """, (percentage, med_id))
    conn.commit()
    conn.close()
    return jsonify({"success": True, "discountPercentage": percentage})

# 4. DISPOSE / WRITE-OFF EXPIRED STOCK
@app.route('/api/inventory/dispose', methods=['POST'])
@token_required
def dispose_stock():
    data = request.json or {}
    med_id = data.get('id')
    dispose_qty = int(data.get('quantity', 0))
    reason = data.get('reason', 'Expired Shelf-Life')

    if not med_id or dispose_qty <= 0:
        return jsonify({"error": "Invalid item or quantity"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # Find batch
        row = cursor.execute("""
            SELECT b.id AS batch_id, b.stock_qty, b.cost_price, m.name, b.batch_no
            FROM medicine_batches b
            JOIN medicines m ON b.medicine_id = m.id
            WHERE b.medicine_id = ? AND b.is_disposed = 0
            LIMIT 1
        """, (med_id,)).fetchone()

        if not row:
            conn.close()
            return jsonify({"error": "Active batch not found"}), 404

        current_stock = row['stock_qty']
        cost_price = row['cost_price']
        batch_id = row['batch_id']
        med_name = row['name']
        batch_no = row['batch_no']

        if dispose_qty > current_stock:
            conn.close()
            return jsonify({"error": "Dispose quantity exceeds current stock"}), 400

        new_stock = current_stock - dispose_qty
        is_disposed = 1 if new_stock == 0 else 0
        loss_value = dispose_qty * cost_price

        # Update batch stock
        cursor.execute("""
            UPDATE medicine_batches 
            SET stock_qty = ?, is_disposed = ?
            WHERE id = ?
        """, (new_stock, is_disposed, batch_id))

        # Record write-off in stock_disposals
        cursor.execute("""
            INSERT INTO stock_disposals (batch_id, medicine_id, medicine_name, batch_no, quantity, cost_price_at_disposal, loss_amount, reason)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (batch_id, med_id, med_name, batch_no, dispose_qty, cost_price, loss_value, reason))

        conn.commit()
        conn.close()
        return jsonify({
            "success": True,
            "lossValue": loss_value,
            "remainingStock": new_stock,
            "message": f"Successfully wrote off {dispose_qty} units of {med_name}."
        })
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"error": str(e)}), 500

# 5. POS CHECKOUT (FEFO Deductions & Invoicing)
@app.route('/api/sales/checkout', methods=['POST'])
@token_required
def checkout():
    data = request.json or {}
    cart_items = data.get('items', [])
    if not cart_items:
        return jsonify({"error": "Cart is empty"}), 400

    invoice_id = data.get('invoiceId') or f"INV-{int(datetime.now().timestamp()) % 100000:05d}"
    customer = data.get('customer', 'Walk-in Customer')
    rx_number = data.get('rxNumber', 'N/A')
    payment_method = data.get('paymentMethod', 'UPI / QR')
    subtotal = float(data.get('subtotal', 0))
    tax_rate = float(data.get('taxRate', 0.12))
    tax_amount = float(data.get('taxAmount', 0))
    discount = float(data.get('discount', 0))
    grand_total = float(data.get('total', 0))
    pharmacist = data.get('pharmacist', 'Dr. Alex (Lic #PH-4920)')

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # Check stock availability for all items
        for item in cart_items:
            med_id = item.get('id')
            qty = item.get('qty', 1)
            row = cursor.execute("""
                SELECT stock_qty, m.name FROM medicine_batches b 
                JOIN medicines m ON b.medicine_id = m.id 
                WHERE b.medicine_id = ? AND b.is_disposed = 0
            """, (med_id,)).fetchone()
            
            if not row or row['stock_qty'] < qty:
                conn.close()
                return jsonify({"error": f"Insufficient stock for {row['name'] if row else med_id}"}), 400

        # Create sales invoice
        cursor.execute("""
            INSERT INTO sales_invoices (invoice_number, customer_name, rx_number, payment_method, subtotal, tax_rate, tax_amount, cart_discount, grand_total, pharmacist)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (invoice_id, customer, rx_number, payment_method, subtotal, tax_rate, tax_amount, discount, grand_total, pharmacist))
        
        inv_db_id = cursor.lastrowid

        # Deduct stock and insert line items
        for item in cart_items:
            med_id = item.get('id')
            qty = item.get('qty', 1)
            unit_price = float(item.get('unitPrice', 0))
            disc_pct = float(item.get('discountPercentage', 0))
            line_tot = qty * unit_price

            cursor.execute("""
                SELECT id FROM medicine_batches WHERE medicine_id = ? AND is_disposed = 0 LIMIT 1
            """, (med_id,))
            batch_id = cursor.fetchone()[0]

            cursor.execute("""
                INSERT INTO sales_items (invoice_id, batch_id, medicine_id, medicine_name, batch_no, quantity, unit_price, discount_percentage, line_total)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (inv_db_id, batch_id, med_id, item.get('name'), item.get('batchNo'), qty, unit_price, disc_pct, line_tot))

            cursor.execute("""
                UPDATE medicine_batches 
                SET stock_qty = stock_qty - ?,
                    sales_count_30_days = sales_count_30_days + ?
                WHERE id = ?
            """, (qty, qty, batch_id))

        conn.commit()
        conn.close()
        return jsonify({"success": True, "invoiceId": invoice_id})
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"error": str(e)}), 500

# 6. SALES INVOICES LIST
@app.route('/api/sales', methods=['GET'])
@token_required
def get_sales():
    conn = get_db_connection()
    cursor = conn.cursor()
    rows = cursor.execute("""
        SELECT 
            invoice_number AS invoiceId,
            created_at AS timestamp,
            customer_name AS customer,
            rx_number AS rxNumber,
            payment_method AS paymentMethod,
            subtotal,
            tax_rate AS taxRate,
            tax_amount AS taxAmount,
            cart_discount AS discount,
            grand_total AS total,
            pharmacist
        FROM sales_invoices
        ORDER BY id DESC
        LIMIT 50
    """).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

# 7. ANALYTICS & LOSS METRICS
@app.route('/api/analytics', methods=['GET'])
@token_required
def get_analytics():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Total recorded expired losses
    loss_row = cursor.execute("SELECT IFNULL(SUM(loss_amount), 0) FROM stock_disposals").fetchone()
    total_disposal_loss = float(loss_row[0])

    # Top fast moving items
    fast_moving = cursor.execute("""
        SELECT 
            m.name,
            IFNULL(SUM(si.quantity), b.sales_count_30_days) AS unitsSold,
            IFNULL(SUM(si.line_total), (b.sales_count_30_days * b.unit_price)) AS revenue,
            CASE 
                WHEN b.sales_count_30_days >= 150 THEN 'Very High'
                WHEN b.sales_count_30_days >= 80 THEN 'High'
                ELSE 'Moderate'
            END AS velocity
        FROM medicine_batches b
        JOIN medicines m ON b.medicine_id = m.id
        LEFT JOIN sales_items si ON si.batch_id = b.id
        GROUP BY m.id
        ORDER BY unitsSold DESC
        LIMIT 5
    """).fetchall()

    conn.close()

    return jsonify({
        "months": ["May", "Jun", "Jul", "Aug", "Sep", "Oct"],
        "monthlySales": [14200, 15800, 17900, 16400, 19200, 22450],
        "expiredLosses": [1850, 1420, 1980, 1100, 920, int(480 + total_disposal_loss)],
        "topFastMoving": [dict(r) for r in fast_moving]
    })

# 8. RESET DATABASE TO SEED DEFAULTS
@app.route('/api/reset', methods=['POST'])
@token_required
def reset_database():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DROP TABLE IF EXISTS sales_items;")
    cursor.execute("DROP TABLE IF EXISTS sales_invoices;")
    cursor.execute("DROP TABLE IF EXISTS stock_disposals;")
    cursor.execute("DROP TABLE IF EXISTS ocr_scan_logs;")
    cursor.execute("DROP TABLE IF EXISTS medicine_batches;")
    cursor.execute("DROP TABLE IF EXISTS medicines;")
    cursor.execute("DROP TABLE IF EXISTS suppliers;")
    cursor.execute("DROP TABLE IF EXISTS categories;")
    conn.commit()
    conn.close()
    
    init_db()
    return jsonify({"success": True, "message": "Database reset to default dataset."})

# 9. LOG OCR SCAN EVENT
@app.route('/api/ocr/log', methods=['POST'])
@token_required
def log_ocr_scan():
    data = request.json or {}
    raw_text = data.get('raw_ocr_text', '')
    detected_name = data.get('detected_name', '')
    detected_batch = data.get('detected_batch', '')
    detected_mfd = data.get('detected_mfd', '')
    detected_exp = data.get('detected_exp', '')
    transferred = 1 if data.get('transferred_to_stock') else 0

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO ocr_scan_logs (raw_ocr_text, detected_name, detected_batch, detected_mfd, detected_exp, transferred_to_stock)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (raw_text, detected_name, detected_batch, detected_mfd, detected_exp, transferred))
    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "OCR scan logged successfully."})

# 10. SERVER-SIDE OCR SCAN (Backend alternative / verification)
@app.route('/api/ocr/scan', methods=['POST'])
@token_required
def ocr_scan_server():
    if 'image' not in request.files and 'file' not in request.files:
        return jsonify({"error": "No image file provided"}), 400
    file = request.files.get('image') or request.files.get('file')
    if not file or file.filename == '':
        return jsonify({"error": "Empty file"}), 400

    try:
        from PIL import Image
        import pytesseract
        img = Image.open(file.stream)
        text = pytesseract.image_to_string(img)
        return jsonify({"success": True, "raw_text": text})
    except Exception as e:
        return jsonify({"error": f"OCR processing error: {str(e)}"}), 500

# Automatically initialize database schema on WSGI / serverless import
try:
    init_db()
except Exception as e:
    print(f"Database auto-init warning: {e}")

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"=======================================================")
    print(f" PharmaPulse SQL Backend Server Running on Port {port}")
    print(f" Database: {DB_PATH}")
    print(f" App URL:  http://localhost:{port}")
    print(f"=======================================================")
    app.run(host='0.0.0.0', port=port, debug=False)
