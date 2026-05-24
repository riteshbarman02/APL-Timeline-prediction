import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const token = process.env.CRICKET_API_KEY;

async function testApi() {
  if (!token || token.trim() === '') {
    console.error('ERROR: No CRICKET_API_KEY found in backend/.env');
    process.exit(1);
  }

  console.log(`Checking API token validity: ${token.substring(0, 8)}...`);
  
  const baseUrl = 'https://restapi.entitysport.com/v2';
  
  try {
    // 1. Try to fetch live matches (status = 3)
    const liveUrl = `${baseUrl}/matches/?status=3&token=${token}`;
    console.log('Querying live matches (status=3)...');
    const liveRes = await fetch(liveUrl);
    
    if (!liveRes.ok) {
      console.error(`HTTP Error: ${liveRes.status} ${liveRes.statusText}`);
      const body = await liveRes.text();
      console.error(`Response body: ${body}`);
      return;
    }

    const liveData = await liveRes.json();
    console.log(`API Status: ${liveData.status}`);
    
    if (liveData.status === 'ok') {
      const items = liveData.response?.items || [];
      console.log(`Successfully connected! Found ${items.length} live matches.`);
      items.forEach((m: any, i: number) => {
        console.log(`  Match ${i + 1}: [ID: ${m.match_id}] ${m.teama?.name} vs ${m.teamb?.name} (${m.venue?.name || 'No Venue'})`);
      });
    } else {
      console.error(`API Error response: ${JSON.stringify(liveData)}`);
    }

    // 2. Try to fetch upcoming matches (status = 1)
    const upcomingUrl = `${baseUrl}/matches/?status=1&token=${token}`;
    console.log('\nQuerying upcoming matches (status=1)...');
    const upcomingRes = await fetch(upcomingUrl);
    
    if (upcomingRes.ok) {
      const upcomingData = await upcomingRes.json();
      if (upcomingData.status === 'ok') {
        const items = upcomingData.response?.items || [];
        console.log(`Found ${items.length} upcoming matches.`);
        items.slice(0, 5).forEach((m: any, i: number) => {
          console.log(`  Match ${i + 1}: [ID: ${m.match_id}] ${m.teama?.name} vs ${m.teamb?.name} - starts at ${m.date_start}`);
        });
      }
    }

  } catch (err: any) {
    console.error('Network or fetch error:', err.message);
  }
}

testApi();
