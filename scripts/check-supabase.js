/**
 * Supabase Connection Diagnostic Script
 * Run with: node scripts/check-supabase.js
 */

const https = require('https');
const dns = require('dns').promises;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cdngdscyhbwnukeducqo.supabase.co';

async function checkSupabaseConnection() {
  console.log('🔍 Supabase Connection Diagnostic\n');
  console.log('Checking URL:', SUPABASE_URL);
  console.log('─'.repeat(60));

  // Extract hostname
  const hostname = SUPABASE_URL.replace('https://', '').replace('http://', '').split('/')[0];
  console.log('Hostname:', hostname, '\n');

  // Step 1: DNS Lookup
  console.log('1️⃣ DNS Lookup');
  try {
    const addresses = await dns.resolve4(hostname);
    console.log('✅ DNS Resolution successful');
    console.log('   IP Addresses:', addresses.join(', '), '\n');
  } catch (error) {
    console.error('❌ DNS Resolution FAILED');
    console.error('   Error:', error.code || error.message);
    console.error('\n⚠️  DIAGNOSIS:');
    console.error('   - Your Supabase project may be paused (free tier projects pause after 7 days of inactivity)');
    console.error('   - Visit https://supabase.com/dashboard to check project status');
    console.error('   - Click "Restore" if the project is paused');
    console.error('   - Check your network connection\n');
    return;
  }

  // Step 2: HTTP Connection
  console.log('2️⃣ HTTP Connection');
  return new Promise((resolve) => {
    const req = https.get(SUPABASE_URL, { timeout: 10000 }, (res) => {
      console.log('✅ HTTP Connection successful');
      console.log('   Status:', res.statusCode);
      console.log('   Headers:', JSON.stringify(res.headers, null, 2));
      resolve();
    });

    req.on('error', (error) => {
      console.error('❌ HTTP Connection FAILED');
      console.error('   Error:', error.message);
      console.error('\n⚠️  DIAGNOSIS:');
      console.error('   - Network connectivity issue');
      console.error('   - Firewall blocking connection');
      console.error('   - Supabase service might be down\n');
      resolve();
    });

    req.on('timeout', () => {
      req.destroy();
      console.error('❌ HTTP Connection TIMEOUT');
      console.error('   Connection took longer than 10 seconds\n');
      resolve();
    });
  });
}

// Step 3: Test with Supabase Client
async function testSupabaseClient() {
  console.log('\n3️⃣ Testing Supabase Client');
  
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Environment variables not loaded');
      console.error('   Make sure .env.local exists and contains NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY\n');
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        fetch: (url, options = {}) => {
          return fetch(url, {
            ...options,
            signal: AbortSignal.timeout(10000),
          });
        },
      },
    });

    console.log('   Attempting to query auctions table...');
    const { data, error } = await supabase
      .from('auctions')
      .select('id')
      .limit(1);

    if (error) {
      console.error('❌ Supabase query failed');
      console.error('   Error:', error.message);
    } else {
      console.log('✅ Supabase Client working correctly');
      console.log('   Query successful\n');
    }
  } catch (error) {
    console.error('❌ Supabase Client test failed');
    console.error('   Error:', error.message, '\n');
  }
}

console.log('');
checkSupabaseConnection()
  .then(() => testSupabaseClient())
  .then(() => {
    console.log('─'.repeat(60));
    console.log('✨ Diagnostic complete\n');
  })
  .catch((error) => {
    console.error('Unexpected error:', error);
  });
