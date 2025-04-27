require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
const dbName = 'Truthdb';
const client = new MongoClient(uri);

async function connectToDatabase() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB!");
  } catch (error) {
    console.error('❌ Error connecting to MongoDB:', error);
    process.exit(1);
  }
}

async function checkDatabaseStructure() {
  const db = client.db(dbName);
  const collection = db.collection('Truthdb');
  
  const documents = await collection.find({}).limit(5).toArray();
  
  console.log('📜 Sample documents in the database:');
  documents.forEach((doc, index) => {
    console.log(`${index + 1}:`, doc);
  });
}

// 🧹 New function to clean the link
function extractDomainFromUrl(url) {
  try {
    const urlObj = new URL(url);
    let domain = urlObj.hostname;

    // Remove 'www.' if present
    if (domain.startsWith('www.')) {
      domain = domain.substring(4);
    }

    return domain.toLowerCase();
  } catch (error) {
    console.error('❌ Invalid URL provided:', url);
    return null;
  }
}

async function isUrlCredible(urlToCheck) {
  const db = client.db(dbName);
  const collection = db.collection('Truthdb');

  const domain = extractDomainFromUrl(urlToCheck);

  if (!domain) {
    console.log('⚠️ Could not extract domain.');
    return false;
  }

  // Search in database
  const result = await collection.findOne({ domain: { $regex: `^${domain}$`, $options: 'i' } });

  if (result) {
    console.log(`🔎 Domain found in database: ${domain}`);
    console.log(`🗂️ Organization: ${result.organization}`);
    return true;
  } else {
    console.log(`⚠️ Domain NOT found in database: ${domain}`);
    return false;
  }
}

// Connect to MongoDB and then start
connectToDatabase()
  .then(() => {
    (async () => {
      await checkDatabaseStructure();
      
      const fullUrl = 'https://www.bbc.com/news/articles/cx251yyvwr3o';
      
      const isCredible = await isUrlCredible(fullUrl);
      console.log(`Is the URL credible? ${isCredible ? 'Yes' : 'No'}`);
    })();
  })
  .catch((error) => {
    console.error('❌ Failed to connect to MongoDB:', error);
  });
