/**
 * PharmaPulse - Smart Pharmacy & Expiry Management System
 * Initial Mock Inventory & Analytical Dataset
 */

// Helper to create date relative to today
function getRelativeDate(daysOffset) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().split('T')[0];
}

// Calculate days remaining between today and target date
function calculateDaysRemaining(expDateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expDate = new Date(expDateStr);
  expDate.setHours(0, 0, 0, 0);
  const diffTime = expDate - today;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Initial Rich Sample Database
const INITIAL_MEDICINES = [
  {
    id: "MED-001",
    name: "Paracetamol 650mg (Dolo)",
    genericName: "Paracetamol BP 650mg",
    category: "Analgesics & Pain",
    dosage: "Tablet (Strip of 15)",
    batchNo: "PCM-902",
    mfdDate: getRelativeDate(-360),
    expDate: getRelativeDate(4), // Expiring in 4 days!
    rackLocation: "Rack A-02",
    stockQty: 42,
    minThreshold: 30,
    unitPrice: 3.50,
    costPrice: 2.10,
    discountPercentage: 0,
    supplier: "Micro Labs Healthcare",
    prescriptionRequired: false,
    salesCount30Days: 148,
    isDisposed: false
  },
  {
    id: "MED-002",
    name: "Augmentin 625 Duo",
    genericName: "Amoxicillin 500mg + Clavulanic Acid 125mg",
    category: "Antibiotics",
    dosage: "Tablet (Strip of 10)",
    batchNo: "AUG-441",
    mfdDate: getRelativeDate(-330),
    expDate: getRelativeDate(8), // Expiring in 8 days!
    rackLocation: "Rack B-08",
    stockQty: 18,
    minThreshold: 25,
    unitPrice: 14.80,
    costPrice: 9.50,
    discountPercentage: 20,
    supplier: "GlaxoSmithKline Pharma",
    prescriptionRequired: true,
    salesCount30Days: 95,
    isDisposed: false
  },
  {
    id: "MED-003",
    name: "Azithromycin 500mg (Azee)",
    genericName: "Azithromycin Dihydrate 500mg",
    category: "Antibiotics",
    dosage: "Tablet (Strip of 5)",
    batchNo: "AZI-819",
    mfdDate: getRelativeDate(-400),
    expDate: getRelativeDate(-3), // Expired 3 days ago!
    rackLocation: "Rack B-14",
    stockQty: 12,
    minThreshold: 20,
    unitPrice: 8.90,
    costPrice: 5.20,
    discountPercentage: 0,
    supplier: "Cipla Therapeutics",
    prescriptionRequired: true,
    salesCount30Days: 80,
    isDisposed: false
  },
  {
    id: "MED-004",
    name: "Cough Relief DX Syrup",
    genericName: "Dextromethorphan + Chlorpheniramine 100ml",
    category: "Respiratory",
    dosage: "Syrup (100ml Bottle)",
    batchNo: "CRD-104",
    mfdDate: getRelativeDate(-380),
    expDate: getRelativeDate(-7), // Expired 7 days ago!
    rackLocation: "Rack C-03",
    stockQty: 9,
    minThreshold: 15,
    unitPrice: 6.20,
    costPrice: 3.40,
    discountPercentage: 0,
    supplier: "Pfizer Global Supply",
    prescriptionRequired: false,
    salesCount30Days: 52,
    isDisposed: false
  },
  {
    id: "MED-005",
    name: "Insulin Glargine 100IU/ml (Lantus)",
    genericName: "Insulin Glargine Solostar Pen",
    category: "Diabetes Care",
    dosage: "Injectable Pen (3ml)",
    batchNo: "INS-302",
    mfdDate: getRelativeDate(-280),
    expDate: getRelativeDate(14), // Expiring in 14 days!
    rackLocation: "Cold Storage CS-1 (4°C)",
    stockQty: 8, // Low stock!
    minThreshold: 15,
    unitPrice: 34.50,
    costPrice: 24.00,
    discountPercentage: 15,
    supplier: "Sanofi India Ltd",
    prescriptionRequired: true,
    salesCount30Days: 42,
    isDisposed: false
  },
  {
    id: "MED-006",
    name: "Salbutamol Inhaler (Asthalin 100mcg)",
    genericName: "Salbutamol 100mcg CFC-Free",
    category: "Respiratory",
    dosage: "Inhaler (200 Actuations)",
    batchNo: "SAL-602",
    mfdDate: getRelativeDate(-180),
    expDate: getRelativeDate(22), // Expiring in 22 days!
    rackLocation: "Rack C-09",
    stockQty: 34,
    minThreshold: 20,
    unitPrice: 5.50,
    costPrice: 3.20,
    discountPercentage: 10,
    supplier: "Cipla Therapeutics",
    prescriptionRequired: true,
    salesCount30Days: 110,
    isDisposed: false
  },
  {
    id: "MED-007",
    name: "Metformin 500mg SR (Glycomet)",
    genericName: "Metformin Hydrochloride Sustained Release",
    category: "Diabetes Care",
    dosage: "Tablet (Strip of 20)",
    batchNo: "MET-204",
    mfdDate: getRelativeDate(-150),
    expDate: getRelativeDate(185), // Safe (6 months)
    rackLocation: "Rack D-01",
    stockQty: 120,
    minThreshold: 40,
    unitPrice: 4.20,
    costPrice: 2.20,
    discountPercentage: 0,
    supplier: "USV Private Ltd",
    prescriptionRequired: true,
    salesCount30Days: 165,
    isDisposed: false
  },
  {
    id: "MED-008",
    name: "Atorvastatin 20mg (Lipitor)",
    genericName: "Atorvastatin Calcium Trihydrate 20mg",
    category: "Cardiovascular",
    dosage: "Tablet (Strip of 15)",
    batchNo: "ATO-772",
    mfdDate: getRelativeDate(-100),
    expDate: getRelativeDate(290), // Safe
    rackLocation: "Rack E-04",
    stockQty: 65,
    minThreshold: 30,
    unitPrice: 11.20,
    costPrice: 7.00,
    discountPercentage: 0,
    supplier: "Sun Pharma Industries",
    prescriptionRequired: true,
    salesCount30Days: 88,
    isDisposed: false
  },
  {
    id: "MED-009",
    name: "Pantoprazole 40mg (Pan 40)",
    genericName: "Pantoprazole Gastro-Resistant 40mg",
    category: "Gastrointestinal",
    dosage: "Tablet (Strip of 15)",
    batchNo: "PAN-519",
    mfdDate: getRelativeDate(-120),
    expDate: getRelativeDate(210), // Safe
    rackLocation: "Rack A-11",
    stockQty: 85,
    minThreshold: 35,
    unitPrice: 7.80,
    costPrice: 4.30,
    discountPercentage: 0,
    supplier: "Alkem Laboratories",
    prescriptionRequired: false,
    salesCount30Days: 132,
    isDisposed: false
  },
  {
    id: "MED-010",
    name: "Vitamin D3 60,000 IU (Calcirol)",
    genericName: "Cholecalciferol Softgel Capsules",
    category: "Vitamins & Supplements",
    dosage: "Softgel (Strip of 4)",
    batchNo: "CAL-380",
    mfdDate: getRelativeDate(-90),
    expDate: getRelativeDate(365), // Safe (1 year)
    rackLocation: "Rack F-02",
    stockQty: 54,
    minThreshold: 25,
    unitPrice: 5.90,
    costPrice: 3.10,
    discountPercentage: 0,
    supplier: "Cadila Healthcare",
    prescriptionRequired: false,
    salesCount30Days: 92,
    isDisposed: false
  },
  {
    id: "MED-011",
    name: "Ciprofloxacin Eye/Ear Drops 0.3%",
    genericName: "Ciprofloxacin Hydrochloride 5ml",
    category: "Emergency & Critical",
    dosage: "Sterile Drops (5ml Vial)",
    batchNo: "CIP-019",
    mfdDate: getRelativeDate(-350),
    expDate: getRelativeDate(-1), // Expired yesterday!
    rackLocation: "Rack G-01",
    stockQty: 6, // Low stock & expired
    minThreshold: 15,
    unitPrice: 4.10,
    costPrice: 2.30,
    discountPercentage: 0,
    supplier: "FDC Ltd",
    prescriptionRequired: true,
    salesCount30Days: 31,
    isDisposed: false
  },
  {
    id: "MED-012",
    name: "Cetirizine 10mg (Cetzine)",
    genericName: "Cetirizine Dihydrochloride 10mg",
    category: "Analgesics & Pain",
    dosage: "Tablet (Strip of 10)",
    batchNo: "CET-622",
    mfdDate: getRelativeDate(-160),
    expDate: getRelativeDate(250), // Safe
    rackLocation: "Rack A-05",
    stockQty: 90,
    minThreshold: 30,
    unitPrice: 2.80,
    costPrice: 1.20,
    discountPercentage: 0,
    supplier: "Dr. Reddy's Labs",
    prescriptionRequired: false,
    salesCount30Days: 140,
    isDisposed: false
  },
  {
    id: "MED-013",
    name: "Telmisartan 40mg (Telma 40)",
    genericName: "Telmisartan BP 40mg",
    category: "Cardiovascular",
    dosage: "Tablet (Strip of 15)",
    batchNo: "TEL-993",
    mfdDate: getRelativeDate(-75),
    expDate: getRelativeDate(410), // Safe
    rackLocation: "Rack E-02",
    stockQty: 70,
    minThreshold: 25,
    unitPrice: 9.60,
    costPrice: 5.80,
    discountPercentage: 0,
    supplier: "Glenmark Pharmaceuticals",
    prescriptionRequired: true,
    salesCount30Days: 85,
    isDisposed: false
  },
  {
    id: "MED-014",
    name: "Clotrimazole 1% Antifungal Cream",
    genericName: "Clotrimazole Topical USP 1% w/w",
    category: "Dermatology",
    dosage: "Ointment Tube (30g)",
    batchNo: "CLO-511",
    mfdDate: getRelativeDate(-260),
    expDate: getRelativeDate(18), // Expiring in 18 days!
    rackLocation: "Rack H-04",
    stockQty: 22,
    minThreshold: 15,
    unitPrice: 4.80,
    costPrice: 2.50,
    discountPercentage: 25,
    supplier: "Bayer Healthcare",
    prescriptionRequired: false,
    salesCount30Days: 45,
    isDisposed: false
  },
  {
    id: "MED-015",
    name: "ORS Electrolyte Rehydration Salts",
    genericName: "Oral Rehydration Salts WHO Formula",
    category: "Emergency & Critical",
    dosage: "Powder Sachet (21.8g)",
    batchNo: "ORS-102",
    mfdDate: getRelativeDate(-60),
    expDate: getRelativeDate(550), // Safe
    rackLocation: "Rack A-01",
    stockQty: 180,
    minThreshold: 50,
    unitPrice: 1.20,
    costPrice: 0.50,
    discountPercentage: 0,
    supplier: "FDC Ltd",
    prescriptionRequired: false,
    salesCount30Days: 210,
    isDisposed: false
  },
  {
    id: "MED-016",
    name: "Ibuprofen 400mg (Brufen)",
    genericName: "Ibuprofen BP 400mg Film-Coated",
    category: "Analgesics & Pain",
    dosage: "Tablet (Strip of 15)",
    batchNo: "BRU-733",
    mfdDate: getRelativeDate(-310),
    expDate: getRelativeDate(28), // Expiring in 28 days!
    rackLocation: "Rack A-04",
    stockQty: 14, // Low stock
    minThreshold: 20,
    unitPrice: 3.90,
    costPrice: 2.10,
    discountPercentage: 15,
    supplier: "Abbott Healthcare",
    prescriptionRequired: false,
    salesCount30Days: 89,
    isDisposed: false
  },
  {
    id: "MED-017",
    name: "Zinc & Vitamin C Chewables (Limcee)",
    genericName: "Ascorbic Acid 500mg Chewable",
    category: "Vitamins & Supplements",
    dosage: "Chewable Tablet (Strip of 15)",
    batchNo: "LIM-421",
    mfdDate: getRelativeDate(-110),
    expDate: getRelativeDate(320), // Safe
    rackLocation: "Rack F-04",
    stockQty: 95,
    minThreshold: 30,
    unitPrice: 3.10,
    costPrice: 1.40,
    discountPercentage: 0,
    supplier: "Abbott Healthcare",
    prescriptionRequired: false,
    salesCount30Days: 125,
    isDisposed: false
  },
  {
    id: "MED-018",
    name: "Epinephrine Auto-Injector (EpiPen 0.3mg)",
    genericName: "Epinephrine Injection USP 1:1000",
    category: "Emergency & Critical",
    dosage: "Auto-Injector (Single Dose)",
    batchNo: "EPI-990",
    mfdDate: getRelativeDate(-200),
    expDate: getRelativeDate(110), // Safe
    rackLocation: "Emergency Bay E-1",
    stockQty: 5, // Low stock critical
    minThreshold: 8,
    unitPrice: 120.00,
    costPrice: 90.00,
    discountPercentage: 0,
    supplier: "Mylan Specialty",
    prescriptionRequired: true,
    salesCount30Days: 14,
    isDisposed: false
  }
];

// Historical Analytics Data for Charts (Last 6 Months)
const ANALYTICS_DATA = {
  months: ["May", "Jun", "Jul", "Aug", "Sep", "Oct"],
  monthlySales: [14200, 15800, 17900, 16400, 19200, 22450],
  expiredLosses: [1850, 1420, 1980, 1100, 920, 480], // Trending downward thanks to FEFO & PharmaPulse alerts!
  topFastMoving: [
    { name: "ORS Electrolyte Sachet", unitsSold: 485, revenue: 582, velocity: "Very High" },
    { name: "Metformin 500mg SR", unitsSold: 390, revenue: 1638, velocity: "High" },
    { name: "Paracetamol 650mg", unitsSold: 375, revenue: 1312, velocity: "High" },
    { name: "Cetirizine 10mg", unitsSold: 310, revenue: 868, velocity: "High" },
    { name: "Salbutamol Inhaler", unitsSold: 260, revenue: 1430, velocity: "Moderate" }
  ]
};

// Initial Sales History Log
const INITIAL_SALES_LOGS = [
  {
    invoiceId: "INV-9401",
    date: getRelativeDate(0),
    customer: "Sarah Jenkins",
    itemsCount: 3,
    total: 38.60,
    paymentMethod: "UPI / QR",
    pharmacist: "Dr. Alex"
  },
  {
    invoiceId: "INV-9400",
    date: getRelativeDate(0),
    customer: "Robert Chen",
    itemsCount: 2,
    total: 18.30,
    paymentMethod: "Credit Card",
    pharmacist: "Dr. Alex"
  },
  {
    invoiceId: "INV-9399",
    date: getRelativeDate(-1),
    customer: "Maria Gonzalez",
    itemsCount: 5,
    total: 62.40,
    paymentMethod: "Cash",
    pharmacist: "Dr. Elena"
  }
];
