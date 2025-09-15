/**
 * Test endpoint to simulate CCAvenue balance payment response
 * This helps debug the balance payment processing without going through CCAvenue
 */

const express = require('express');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Import the controller
const ccavenueController = require('./controllers/ccavenue.controller.js');

// Test route that simulates CCAvenue response
app.post('/test-balance-payment', async (req, res) => {
    console.log('🧪 Testing balance payment processing...');
    
    // Simulate a successful CCAvenue response
    const mockCCavenueResponse = {
        order_id: 'BAL50be65881234500' + Date.now().toString().slice(-8) + 'ab',
        order_status: 'Success',
        amount: '12345.00',
        transaction_id: 'TEST_' + Date.now(),
        tracking_id: 'TRACK_' + Date.now(),
        bank_ref_no: 'BANK_' + Date.now(),
        payment_mode: 'Net Banking',
        bank_name: 'Test Bank'
    };
    
    console.log('📊 Mock CCAvenue Response:', mockCCavenueResponse);
    
    // Create a mock request object
    const mockReq = {
        body: {
            encResp: 'mock_encrypted_response' // This would normally be encrypted
        }
    };
    
    // Create a mock response object
    const mockRes = {
        redirect: (url) => {
            console.log('🔗 Redirect URL:', url);
            res.json({
                success: true,
                redirectUrl: url,
                message: 'Balance payment test completed'
            });
        }
    };
    
    // Override the decrypt and parse functions temporarily
    const originalDecrypt = require('./utils/ccavenue.js').decrypt;
    const originalParse = require('./utils/ccavenue.js').parseResponse;
    
    require('./utils/ccavenue.js').decrypt = () => {
        return Object.keys(mockCCavenueResponse).map(key => 
            `${key}=${encodeURIComponent(mockCCavenueResponse[key])}`
        ).join('&');
    };
    
    require('./utils/ccavenue.js').parseResponse = () => mockCCavenueResponse;
    
    try {
        // Call the actual controller method
        await ccavenueController.handlePaymentResponse(mockReq, mockRes);
    } catch (error) {
        console.error('❌ Test failed:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    } finally {
        // Restore original functions
        require('./utils/ccavenue.js').decrypt = originalDecrypt;
        require('./utils/ccavenue.js').parseResponse = originalParse;
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`🧪 Balance payment test server running on port ${PORT}`);
    console.log(`🔗 Test URL: http://localhost:${PORT}/test-balance-payment`);
    console.log('📝 Send a POST request to test balance payment processing');
});

module.exports = app;