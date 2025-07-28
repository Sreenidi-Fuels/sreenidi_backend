const express = require('express');
const ccavenueController = require('../controllers/ccavenue.controller.js');
const router = express.Router();

/**
 * Security middleware for payment endpoints
 * Add additional security checks as needed
 */
const validatePaymentRequest = (req, res, next) => {
    // Basic validation for payment initiation
    if (req.path === '/initiate-payment') {
        const { orderId, userId, amount } = req.body;
        
        if (!orderId || !userId || !amount) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }
        
        // Validate amount is positive number
        if (isNaN(amount) || parseFloat(amount) <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid amount'
            });
        }
    }
    
    next();
};

/**
 * Logging middleware for payment operations
 */
const logPaymentOperation = (req, res, next) => {
    const operation = req.path.replace('/', '').replace('-', '_');
    console.log(`CCAvenue ${operation} - ${req.method} ${req.originalUrl} - ${new Date().toISOString()}`);
    next();
};

// Apply middleware to all routes
router.use(logPaymentOperation);

/**
 * @route   POST /api/ccavenue/initiate-payment
 * @desc    Initiate CCAvenue payment for an order
 * @access  Private (requires valid order and user)
 * @body    { orderId, userId, amount, currency?, billingAddressId?, shippingAddressId?, redirectUrl?, cancelUrl? }
 */
router.post('/initiate-payment', validatePaymentRequest, ccavenueController.initiatePayment);

/**
 * @route   POST /api/ccavenue/payment-response
 * @desc    Handle CCAvenue payment callback (success/failure)
 * @access  Public (CCAvenue callback)
 * @body    { encResp }
 */
router.post('/payment-response', ccavenueController.handlePaymentResponse);

/**
 * @route   POST /api/ccavenue/payment-cancel
 * @desc    Handle CCAvenue payment cancellation callback
 * @access  Public (CCAvenue callback)
 * @body    { encResp }
 */
router.post('/payment-cancel', ccavenueController.handlePaymentCancel);

/**
 * @route   GET /api/ccavenue/payment-status/:orderId
 * @desc    Get payment status for an order
 * @access  Private (requires order access)
 * @params  orderId
 * @query   userId? (optional for additional security)
 */
router.get('/payment-status/:orderId', ccavenueController.getPaymentStatus);

/**
 * @route   POST /api/ccavenue/retry-payment
 * @desc    Reset order payment status for retry
 * @access  Private (requires order access)
 * @body    { orderId }
 */
router.post('/retry-payment', ccavenueController.retryPayment);

/**
 * @route   GET /api/ccavenue/test-config
 * @desc    Test CCAvenue configuration (development only)
 * @access  Private
 */
router.get('/test-config', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(404).json({ error: 'Not found' });
    }
    
    const config = {
        merchantId: process.env.CCAVENUE_MERCHANT_ID ? 'configured' : 'missing',
        accessCode: process.env.CCAVENUE_ACCESS_CODE ? 'configured' : 'missing',
        workingKey: process.env.CCAVENUE_WORKING_KEY ? 'configured' : 'missing',
        baseUrl: process.env.BASE_URL || 'not set'
    };
    
    const allConfigured = Object.values(config).every(val => val === 'configured' || val.startsWith('http'));
    
    res.status(200).json({
        success: allConfigured,
        message: allConfigured ? 'CCAvenue configuration is complete' : 'CCAvenue configuration incomplete',
        config
    });
});

module.exports = router; 