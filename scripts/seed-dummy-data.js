/**
 * Seed 100 dummy patients with orders and results for full app testing.
 * First 10 patients: orders with multiple departments (Hematology, LFT, KFT, Lipid, Biochemistry, Serology, Surgery, etc.)
 * Run: node scripts/seed-dummy-data.js
 */
const path = require('path');
const DatabaseManager = require(path.join(__dirname, '../electron/database.js'));

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const NAMES = [
  'Rajesh Kumar', 'Priya Sharma', 'Amit Patel', 'Sneha Reddy', 'Vikram Singh',
  'Anita Desai', 'Rahul Verma', 'Kavita Nair', 'Suresh Iyer', 'Meera Krishnan',
  'Deepak Gupta', 'Lakshmi Rao', 'Manoj Joshi', 'Pooja Menon', 'Arun Pillai',
  'Divya Nambiar', 'Kiran Thomas', 'Sunita Abraham', 'Ramesh George', 'Neha Fernandez',
  'Sanjay Mathew', 'Shweta Pereira', 'Venkat Rao', 'Rekha D\'Souza', 'Gopal Menon',
  'Uma Krishnan', 'Balaji Iyer', 'Sarita Nair', 'Chandrasekhar Pillai', 'Latha Reddy',
  'Murugan Kumar', 'Vasundhara Sharma', 'Srinivas Patel', 'Indira Desai', 'Prakash Singh',
  'Geeta Verma', 'Subramanian Nair', 'Malini Krishnan', 'Venkatesh Iyer', 'Shanti Rao',
  'Karthik Menon', 'Preeti Joshi', 'Mohan Thomas', 'Anjali Abraham', 'Sridhar George',
  'Bhavya Fernandez', 'Naveen Mathew', 'Swati Pereira', 'Raghav D\'Souza', 'Kavitha Nambiar',
  'Aditya Kumar', 'Ishita Sharma', 'Varun Patel', 'Tanvi Reddy', 'Rohan Singh',
  'Nidhi Desai', 'Kunal Verma', 'Aarti Nair', 'Abhishek Iyer', 'Simran Krishnan',
  'Vivek Gupta', 'Riya Rao', 'Akash Joshi', 'Pallavi Menon', 'Arjun Thomas',
  'Shreya Abraham', 'Rishabh George', 'Ishaan Fernandez', 'Aaradhya Mathew', 'Advik Pereira',
  'Ananya D\'Souza', 'Aryan Krishnan', 'Diya Nambiar', 'Krish Iyer', 'Myra Pillai',
  'Reyansh Reddy', 'Saanvi Sharma', 'Vihaan Patel', 'Kiara Singh', 'Ayaan Desai',
  'Zara Verma', 'Kabir Nair', 'Avni Krishnan', 'Arnav Iyer', 'Anvi Rao',
  'Dhruv Menon', 'Ira Thomas', 'Reyan Abraham', 'Sia George', 'Aarav Fernandez',
  'Aadhya Mathew', 'Vivaan Pereira', 'Anika D\'Souza', 'Ved Krishnan', 'Ishita Nambiar',
];

const REFERRERS = [
  'Dr. Sharma (Physician)', 'Dr. Patel (Cardiologist)', 'Dr. Reddy (General)', 'Dr. Nair (Pediatrician)',
  'Dr. Iyer (Ortho)', 'Dr. Krishnan (Gastro)', 'Dr. Menon (Dermatologist)', 'Dr. Pillai (ENT)',
  'Dr. Thomas (Gynecologist)', 'Dr. Abraham (Neurologist)', 'Dr. George (Surgeon)',
  'Dr. Fernandez (Oncologist)', 'Dr. Mathew (Rheumatologist)', 'Dr. Pereira (Endocrinologist)',
  'Dr. D\'Souza (Nephrologist)', 'Dr. Nambiar (Pulmonologist)', 'City Hospital', 'Apollo Clinic',
  'Max Healthcare', 'Fortis Lab', 'Self', null,
];

const ADDRESSES = [
  '123 MG Road, Bangalore', '45 Park Street, Kolkata', '78 Anna Nagar, Chennai',
  '12 Bandra West, Mumbai', '34 Connaught Place, Delhi', '56 Salt Lake, Kolkata',
  '89 Koramangala, Bangalore', '23 Andheri East, Mumbai', '67 T Nagar, Chennai',
  '90 Saket, Delhi', '45 Jubilee Hills, Hyderabad', '12 Banjara Hills, Hyderabad',
  '78 Vastrapur, Ahmedabad', '34 Satellite, Ahmedabad', '56 Koregaon Park, Pune',
  '89 Hinjewadi, Pune', '23 Salt Lake Sector V, Kolkata', '67 Ballygunge, Kolkata',
  null, null,
];

// Sample result values: normal, low, high, critical (for testing flags)
const CBC_NORMAL = { HB: 14.2, RBC: 4.8, WBC: 7500, PLT: 250000, PCV: 44, MCV: 88, MCH: 29, MCHC: 33, ESR: 8, NEUT: 58, LYMPH: 35, EOS: 3, MONO: 4, BASO: 0.5 };
const CBC_LOW_HB = { ...CBC_NORMAL, HB: 6.5 }; // critical low
const CBC_HIGH_WBC = { ...CBC_NORMAL, WBC: 18000 }; // high
const LFT_NORMAL = { SGOT: 28, SGPT: 32, ALP: 90, BIL_TOTAL: 0.8, BIL_DIRECT: 0.2, TP: 7.2, ALB: 4.2 };
const KFT_NORMAL = { UREA: 28, CREAT: 1.0, URIC: 5.2, SODIUM: 140, POTASSIUM: 4.2, CHLORIDE: 102 };
const KFT_HIGH_CREAT = { ...KFT_NORMAL, CREAT: 6.2 }; // critical high
const LIPID_NORMAL = { TC: 180, TG: 120, HDL: 48 };
const BIOCHEM_NORMAL = { FBS: 88, PPBS: 120, HBA1C: 5.2, RBS: 95 };

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(start, end) {
  const d = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return d.toISOString().slice(0, 10);
}

function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function main() {
  const db = new DatabaseManager();
  await db.init();

  // Clear existing
  db.clearAllPatients();
  console.log('Cleared existing patients/orders.');

  const params = db.all('SELECT id, code, type FROM parameters ORDER BY id');
  const codeToId = {};
  (params || []).forEach((p) => { codeToId[p.code] = p.id; });

  const profileParams = db.all(`
    SELECT pp.parameter_id, pp.display_order, p.code
    FROM profile_parameters pp
    JOIN parameters p ON p.id = pp.parameter_id
    ORDER BY pp.profile_id, pp.display_order
  `);

  // Build multi-dept test set: CBC + LFT + KFT + Lipid + FBS + CRP + BLOOD_GRP + HBSAG + TSH
  const multiDeptCodes = [
    'HB', 'RBC', 'WBC', 'PLT', 'PCV', 'MCV', 'MCH', 'MCHC', 'ESR', 'NEUT', 'LYMPH', 'EOS', 'MONO', 'BASO',
    'SGOT', 'SGPT', 'ALP', 'BIL_TOTAL', 'BIL_DIRECT', 'TP', 'ALB', 'GLOB', 'AGRATIO',
    'UREA', 'CREAT', 'URIC', 'SODIUM', 'POTASSIUM', 'CHLORIDE',
    'TC', 'TG', 'HDL', 'LDL', 'VLDL',
    'FBS', 'CRP', 'BLOOD_GRP', 'HBSAG', 'TSH',
  ];

  const multiDeptParamIds = multiDeptCodes
    .map((c) => codeToId[c])
    .filter(Boolean);

  // Single-dept sets for variety
  const cbcCodes = ['HB', 'RBC', 'WBC', 'PLT', 'PCV', 'MCV', 'MCH', 'MCHC', 'ESR', 'RDW', 'NEUT', 'LYMPH', 'EOS', 'MONO', 'BASO'];
  const lftCodes = ['SGOT', 'SGPT', 'ALP', 'GGT', 'BIL_TOTAL', 'BIL_DIRECT', 'TP', 'ALB', 'GLOB', 'AGRATIO'];
  const kftCodes = ['UREA', 'CREAT', 'URIC', 'SODIUM', 'POTASSIUM', 'CHLORIDE', 'CALCIUM', 'PHOSPHORUS', 'MAGNESIUM'];
  const lipidCodes = ['TC', 'TG', 'HDL', 'LDL', 'VLDL'];
  const sugarCodes = ['FBS', 'PPBS', 'HBA1C', 'RBS', 'INSULIN', 'C_PEPTIDE'];
  const serologyCodes = ['CRP', 'MP', 'DENGUE', 'DENGUE_IGM', 'WIDAL', 'TYPHOID', 'TYPHOID_IGM'];
  const surgeryCodes = ['HBSAG', 'HIV', 'VDRL', 'BLOOD_GRP', 'RH_FACTOR', 'PT', 'INR', 'APTT', 'URINE_R'];
  const immunologyCodes = ['RA_FACTOR', 'ASO', 'ANTI_HCV', 'TSH', 'T3', 'T4', 'FREE_T3', 'FREE_T4', 'IGE'];

  const testSets = [
    multiDeptParamIds,
    ...([cbcCodes, lftCodes, kftCodes, lipidCodes].map((codes) => codes.map((c) => codeToId[c]).filter(Boolean))),
    sugarCodes.map((c) => codeToId[c]).filter(Boolean),
    serologyCodes.map((c) => codeToId[c]).filter(Boolean),
    surgeryCodes.map((c) => codeToId[c]).filter(Boolean),
    immunologyCodes.map((c) => codeToId[c]).filter(Boolean),
  ].filter((arr) => arr.length > 0);

  const now = new Date();
  const janStart = new Date(2026, 0, 1);
  const dateEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const batch = true;
  let patientCount = 0;
  let orderCount = 0;

  for (let i = 0; i < 100; i++) {
    const name = NAMES[i] || `Patient ${i + 1}`;
    const age = 18 + Math.floor(Math.random() * 60);
    const sex = Math.random() < 0.5 ? 'male' : 'female';
    const phone = `98${String(10000000 + i).slice(-8)}`;
    const address = randomPick(ADDRESSES);
    const referredBy = randomPick(REFERRERS);

    const patientId = DatabaseManager.getNextPatientId(db);
    db.run(
      `INSERT INTO patients (patient_id, name, age, sex, phone, address, referred_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [patientId, name, age, sex, phone, address, referredBy],
      batch
    );
    const pidRow = db.get('SELECT id FROM patients WHERE patient_id = ?', [patientId]);
    const pid = pidRow.id;
    patientCount++;

    const isMultiDept = i < 10;
    const paramIds = isMultiDept ? multiDeptParamIds : randomPick(testSets);

    const orderDate = randomDate(janStart, dateEnd);
    const status = i < 70 ? 'completed' : i < 90 ? 'partial' : 'pending';
    const paymentStatus = Math.random() < 0.8 ? 'paid' : 'unpaid';
    const totalAmount = paramIds.length * (50 + Math.floor(Math.random() * 150));

    db.run(
      `INSERT INTO orders (patient_id, referring_doctor, order_date, report_date, status, total_amount, payment_status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [pid, referredBy, orderDate, orderDate, status, totalAmount, paymentStatus],
      batch
    );
    const oidRow = db.get('SELECT id FROM orders WHERE patient_id = ? ORDER BY id DESC LIMIT 1', [pid]);
    const oid = oidRow.id;
    orderCount++;

    let displayOrder = 0;
    for (const paramId of paramIds) {
      db.run(
        `INSERT INTO order_tests (order_id, parameter_id, display_order) VALUES (?, ?, ?)`,
        [oid, paramId, ++displayOrder],
        batch
      );
    }

    // Add results for completed/partial
    if (status === 'completed' || status === 'partial') {
      const paramList = db.all('SELECT parameter_id FROM order_tests WHERE order_id = ? ORDER BY display_order', [oid]);
      const resultParams = status === 'completed' ? paramList : paramList.slice(0, Math.ceil(paramList.length / 2));

      const codeById = {};
      (params || []).forEach((p) => { codeById[p.id] = p.code; });

      for (const row of resultParams) {
        const paramId = row.parameter_id;
        const code = codeById[paramId];
        const p = params.find((x) => x.id === paramId);
        const isText = p && p.type === 'text';
        const isDerived = p && p.type === 'derived';
        if (isDerived) continue; // App computes from base params

        let resultValue = null;
        let resultText = null;
        let flag = null;

        if (isText) {
          const textResults = {
            BLOOD_GRP: ['A+', 'B+', 'O+', 'AB+', 'A-', 'B-', 'O-', 'AB-'],
            RH_FACTOR: ['Positive', 'Negative'],
            HBSAG: ['Negative', 'Non-Reactive'],
            HIV: ['Negative', 'Non-Reactive'],
            VDRL: ['Negative', 'Non-Reactive'],
            ANTI_HCV: ['Negative', 'Non-Reactive'],
            MP: ['Not Seen', 'Negative'],
            DENGUE: ['Negative', 'Not Detected'],
            DENGUE_IGM: ['Negative', 'Not Detected'],
            WIDAL: 'O: 1:80, H: 1:160',
            TYPHOID: 'O: 1:80, H: 1:160',
            TYPHOID_IGM: ['Negative', 'Not Detected'],
            URINE_R: 'Color: Pale Yellow, Appearance: Clear, pH: 6.5',
            PERIPHERAL_SMEAR: 'Normocytic normochromic RBCs, No abnormal cells seen',
            GTT: 'Fasting: 88, 1hr: 145, 2hr: 112 mg/dL',
          };
          resultText = Array.isArray(textResults[code]) ? randomPick(textResults[code]) : (textResults[code] || 'Normal');
        } else {
          // Numeric - use sample values
          const samples = {
            HB: i === 2 ? 6.5 : 14.2, RBC: 4.8, WBC: i === 5 ? 18000 : 7500, PLT: 250000, PCV: 44, MCV: 88, MCH: 29, MCHC: 33,
            ESR: 8, NEUT: 58, LYMPH: 35, EOS: 3, MONO: 4, BASO: 0.5,
            SGOT: 28, SGPT: 32, ALP: 90, BIL_TOTAL: 0.8, BIL_DIRECT: 0.2, TP: 7.2, ALB: 4.2,
            UREA: 28, CREAT: i === 7 ? 6.2 : 1.0, URIC: 5.2, SODIUM: 140, POTASSIUM: i === 8 ? 2.3 : 4.2, CHLORIDE: 102,
            TC: 180, TG: 120, HDL: 48, LDL: 95, VLDL: 24,
            FBS: 88, PPBS: 120, HBA1C: 5.2, RBS: 95,
            CRP: 2.5, RA_FACTOR: 8, ASO: 120, TSH: 2.5, IGE: 45,
            PT: 12.5, INR: 1.1, BT: 3.5, CT: 6.2,
            RDW: 13.2, RETICULOCYTE: 1.2, AEC: 180,
            APTT: 28.5, INSULIN: 12.5, C_PEPTIDE: 2.1,
            CALCIUM: 9.2, PHOSPHORUS: 3.2, MAGNESIUM: 2.0,
            GGT: 25, T3: 120, T4: 8.5, FREE_T3: 3.2, FREE_T4: 1.2,
          };
          resultValue = samples[code] ?? (10 + Math.random() * 90);
          if (code === 'HB' && resultValue < 7) flag = 'L';
          else if (code === 'CREAT' && resultValue > 5) flag = 'H';
          else if (code === 'POTASSIUM' && resultValue < 2.5) flag = 'L';
          else if (code === 'WBC' && resultValue > 11000) flag = 'H';
        }

        db.run(
          `INSERT OR REPLACE INTO order_results (order_id, parameter_id, result_value, result_text, flag) VALUES (?, ?, ?, ?, ?)`,
          [oid, paramId, resultValue, resultText, flag],
          batch
        );
      }
    }
  }

  db.save();
  console.log(`Seeded ${patientCount} patients with ${orderCount} orders.`);
  console.log('First 10 patients have multi-department orders (Hematology, LFT, KFT, Lipid, Biochemistry, Serology, Surgery, Immunology).');
  console.log('Mix: completed (70), partial (20), pending (10). Some critical values in patients 3, 5, 7, 8.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
