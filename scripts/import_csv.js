import admin from 'firebase-admin';
import fs from 'fs';
import csv from 'csv-parser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// --- CONFIGURATION ---
const SERVICE_ACCOUNT_PATH = './serviceAccountKey.json'; // Path to your downloaded key
const CSV_FILE_PATH = './data.csv'; // Path to your CSV file
const COLLECTION_NAME = 'tasks'; // Firestore collection to import into

// --- SETUP ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error(`Error: Service account key not found at ${SERVICE_ACCOUNT_PATH}`);
  console.error('Please download it from Firebase Console -> Project Settings -> Service Accounts');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// --- IMPORT LOGIC ---
const importData = async () => {
  const results = [];

  console.log(`Reading CSV from ${CSV_FILE_PATH}...`);

  fs.createReadStream(CSV_FILE_PATH)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      console.log(`Parsed ${results.length} rows. Starting upload...`);
      
      let batch = db.batch();
      let count = 0;
      let total = 0;

      for (const row of results) {
        // CUSTOMIZE THIS: Map CSV columns to Firestore fields
        // Example: If CSV has 'Task Name', map it to 'title'
        const docData = {
          ...row,
          createdAt: new Date().toISOString(), // Default timestamp if missing
          // Add other transformations here
        };

        const docRef = db.collection(COLLECTION_NAME).doc(); // Auto-ID
        batch.set(docRef, docData);
        
        count++;
        total++;

        // Firestore batches are limited to 500 ops
        if (count >= 400) {
          await batch.commit();
          console.log(`Committed ${total} documents...`);
          batch = db.batch();
          count = 0;
        }
      }

      if (count > 0) {
        await batch.commit();
      }

      console.log(`Successfully imported ${total} documents into '${COLLECTION_NAME}'.`);
      process.exit(0);
    });
};

importData().catch(console.error);
