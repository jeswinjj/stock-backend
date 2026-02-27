const axios = require('axios');
const db = require('./config/db');

const API_URL = 'http://localhost:5010/api';
let token = '';
let userId = '';

const timestamp = Date.now();
const EMAIL = `wallet_test_${timestamp}@example.com`;

// Helper to login and get token
async function login() {
    console.log(`1. Registering/Logging in as ${EMAIL}...`);
    try {
        const res = await axios.post(`${API_URL}/auth/register`, {
            name: 'Wallet Tester',
            email: EMAIL,
            password: 'password123'
        });
        token = res.data.token;
        userId = res.data.user.id;
        console.log('   Registration successful. Token acquired.');
    } catch (err) {
        console.error('   Registration failed details:', err.response?.data || err.message);
        process.exit(1);
    }
}

async function checkBalance(expectedAmount = null) {
    console.log('2. Checking Balance...');
    try {
        const res = await axios.get(`${API_URL}/wallet`, {
            headers: { 'x-auth-token': token }
        });
        console.log(`   Current Balance: ${res.data.balance}`);
        if (expectedAmount !== null) {
            if (parseFloat(res.data.balance) === parseFloat(expectedAmount)) {
                console.log('   [PASS] Balance matches expected.');
            } else {
                console.error(`   [FAIL] Expected ${expectedAmount}, got ${res.data.balance}`);
            }
        }
    } catch (err) {
        console.error('   Failed to fetch wallet:', err.response?.data || err.message);
    }
}

async function addFunds(amount) {
    console.log(`3. Adding Funds: ${amount}...`);
    try {
        await axios.post(`${API_URL}/wallet/add-funds`, { amount }, {
            headers: { 'x-auth-token': token }
        });
        console.log('   Funds added.');
    } catch (err) {
        console.error('   Failed to add funds:', err.response?.data || err.message);
    }
}

async function withdrawFunds(amount) {
    console.log(`4. Withdrawing Funds: ${amount}...`);
    try {
        await axios.post(`${API_URL}/wallet/withdraw`, { amount }, {
            headers: { 'x-auth-token': token }
        });
        console.log('   Funds withdrawn.');
    } catch (err) {
        console.error(`   Failed to withdraw funds (${amount}):`, err.response?.data?.message || err.message);
    }
}

async function buyStock(symbol, qty, price, shouldFail = false) {
    console.log(`5. Buying Stock: ${qty} x ${symbol} @ ${price}...`);
    try {
        await axios.post(`${API_URL}/stocks/buy`, {
            symbol, quantity: qty, price, name: symbol
        }, {
            headers: { 'x-auth-token': token }
        });

        if (shouldFail) console.error('   [FAIL] Buy succeeded but should have failed.');
        else console.log('   [PASS] Buy successful.');
    } catch (err) {
        const msg = err.response?.data?.message || err.message;
        if (shouldFail) console.log(`   [PASS] Buy failed as expected: ${msg}`);
        else console.error(`   [FAIL] Buy failed: ${msg}`);
    }
}

async function sellStock(symbol, qty, price) {
    console.log(`6. Selling Stock: ${qty} x ${symbol} @ ${price}...`);
    try {
        await axios.post(`${API_URL}/stocks/sell`, {
            symbol, quantity: qty, price
        }, {
            headers: { 'x-auth-token': token }
        });
        console.log('   [PASS] Sell successful.');
    } catch (err) {
        console.error(`   [FAIL] Sell failed:`, err.response?.data?.message || err.message);
    }
}

async function runTest() {
    await login();

    // Reset wallet for testing
    // Note: In real app we can't do this easily via API, so we assume whatever state
    // But for clean test, we might want to manually reset in DB if possible, or just work with deltas.
    // Let's work with deltas.

    await checkBalance();

    const INITIAL_ADD = 10000;
    await addFunds(INITIAL_ADD);
    await checkBalance(); // Should verify balance increased

    await withdrawFunds(500);
    await checkBalance(); // Should be INITIAL - 500

    // Try to buy expensive stock (fail)
    await buyStock('MRF', 1, 150000, true);

    // Buy affordable stock
    await buyStock('TATASTEEL', 10, 150); // Cost 1500
    await checkBalance(); // Should decrease by 1500

    // Sell stock (profit)
    await sellStock('TATASTEEL', 5, 200); // 5 * 200 = 1000 credit. Profit 5*50 = 250.
    await checkBalance(); // Should increase by 1000.

    console.log('Test Complete.');
    process.exit(0);
}

runTest();
