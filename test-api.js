const axios = require('axios');

async function testApi() {
    const url = 'http://localhost:5010/api/auth/register';
    const payload = {
        name: 'Diag User',
        email: `diag_${Date.now()}@example.com`,
        password: 'Password123!'
    };

    console.log(`Testing POST ${url}...`);
    try {
        const res = await axios.post(url, payload);
        console.log('SUCCESS: API returned', res.status);
        console.log('Response body:', res.data);
    } catch (err) {
        console.error('FAILURE: API returned error');
        if (err.response) {
            console.error('Status:', err.response.status);
            console.error('Data:', err.response.data);
        } else {
            console.error('Message:', err.message);
        }
    }
}

testApi();
