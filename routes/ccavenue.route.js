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
    if (req.path === '/initiate-balance-payment') {
        const { userId, amount } = req.body;
        if (!userId || !amount) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }
        if (isNaN(amount) || parseFloat(amount) <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid amount' });
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
 * @route   POST /api/ccavenue/initiate-balance-payment
 * @desc    Initiate CCAvenue payment to pay outstanding balance (no order)
 * @access  Private
 * @body    { userId, amount, currency?, redirectUrl?, cancelUrl? }
 */
router.post('/initiate-balance-payment', validatePaymentRequest, ccavenueController.initiateBalancePayment);

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

/**
 * @route   GET /api/ccavenue/debug-credentials
 * @desc    Debug CCAvenue credentials format (temporarily enabled for production debugging)
 * @access  Private
 */
router.get('/debug-credentials', (req, res) => {
    // Temporarily allow in production for debugging
    // if (process.env.NODE_ENV === 'production') {
    //     return res.status(404).json({ error: 'Not found' });
    // }
    
    const { CCAVENUE_MERCHANT_ID, CCAVENUE_ACCESS_CODE, CCAVENUE_WORKING_KEY, BASE_URL } = process.env;
    
    const debug = {
        merchantId: {
            exists: !!CCAVENUE_MERCHANT_ID,
            length: CCAVENUE_MERCHANT_ID ? CCAVENUE_MERCHANT_ID.length : 0,
            startsWithDigit: CCAVENUE_MERCHANT_ID ? /^\d/.test(CCAVENUE_MERCHANT_ID) : false,
            preview: CCAVENUE_MERCHANT_ID ? CCAVENUE_MERCHANT_ID.substring(0, 3) + '***' : 'missing'
        },
        accessCode: {
            exists: !!CCAVENUE_ACCESS_CODE,
            length: CCAVENUE_ACCESS_CODE ? CCAVENUE_ACCESS_CODE.length : 0,
            startsWithAV: CCAVENUE_ACCESS_CODE ? CCAVENUE_ACCESS_CODE.startsWith('AV') : false,
            preview: CCAVENUE_ACCESS_CODE ? CCAVENUE_ACCESS_CODE.substring(0, 4) + '***' : 'missing'
        },
        workingKey: {
            exists: !!CCAVENUE_WORKING_KEY,
            length: CCAVENUE_WORKING_KEY ? CCAVENUE_WORKING_KEY.length : 0,
            isHex: CCAVENUE_WORKING_KEY ? /^[A-Fa-f0-9]+$/.test(CCAVENUE_WORKING_KEY) : false,
            preview: CCAVENUE_WORKING_KEY ? CCAVENUE_WORKING_KEY.substring(0, 4) + '***' : 'missing'
        },
        baseUrl: BASE_URL,
        environment: process.env.NODE_ENV || 'development'
    };
    
    res.status(200).json({
        success: true,
        debug
    });
});

/**
 * @route   GET /api/ccavenue/validate-credentials
 * @desc    Validate CCAvenue credentials format and detect common issues
 * @access  Private
 */
router.get('/validate-credentials', (req, res) => {
    const { CCAVENUE_MERCHANT_ID, CCAVENUE_ACCESS_CODE, CCAVENUE_WORKING_KEY, BASE_URL } = process.env;
    
    const validation = {
        merchantId: {
            exists: !!CCAVENUE_MERCHANT_ID,
            length: CCAVENUE_MERCHANT_ID ? CCAVENUE_MERCHANT_ID.length : 0,
            isNumeric: CCAVENUE_MERCHANT_ID ? /^\d+$/.test(CCAVENUE_MERCHANT_ID.trim()) : false,
            hasWhitespace: CCAVENUE_MERCHANT_ID ? /\s/.test(CCAVENUE_MERCHANT_ID) : false,
            preview: CCAVENUE_MERCHANT_ID ? CCAVENUE_MERCHANT_ID.substring(0, 3) + '***' : 'missing',
            issues: []
        },
        accessCode: {
            exists: !!CCAVENUE_ACCESS_CODE,
            length: CCAVENUE_ACCESS_CODE ? CCAVENUE_ACCESS_CODE.length : 0,
            startsWithAV: CCAVENUE_ACCESS_CODE ? CCAVENUE_ACCESS_CODE.trim().startsWith('AV') : false,
            hasWhitespace: CCAVENUE_ACCESS_CODE ? /\s/.test(CCAVENUE_ACCESS_CODE) : false,
            preview: CCAVENUE_ACCESS_CODE ? CCAVENUE_ACCESS_CODE.substring(0, 4) + '***' : 'missing',
            issues: []
        },
        workingKey: {
            exists: !!CCAVENUE_WORKING_KEY,
            length: CCAVENUE_WORKING_KEY ? CCAVENUE_WORKING_KEY.length : 0,
            isHex: CCAVENUE_WORKING_KEY ? /^[A-Fa-f0-9]+$/.test(CCAVENUE_WORKING_KEY.trim()) : false,
            hasWhitespace: CCAVENUE_WORKING_KEY ? /\s/.test(CCAVENUE_WORKING_KEY) : false,
            preview: CCAVENUE_WORKING_KEY ? CCAVENUE_WORKING_KEY.substring(0, 4) + '***' : 'missing',
            issues: []
        }
    };
    
    // Check for common issues
    if (validation.merchantId.exists) {
        if (!validation.merchantId.isNumeric) validation.merchantId.issues.push('Should be numeric only');
        if (validation.merchantId.hasWhitespace) validation.merchantId.issues.push('Contains whitespace');
        if (validation.merchantId.length < 5 || validation.merchantId.length > 8) validation.merchantId.issues.push('Unusual length (should be 5-8 digits)');
    }
    
    if (validation.accessCode.exists) {
        if (!validation.accessCode.startsWithAV) validation.accessCode.issues.push('Should start with "AV"');
        if (validation.accessCode.hasWhitespace) validation.accessCode.issues.push('Contains whitespace');
        if (validation.accessCode.length < 8 || validation.accessCode.length > 20) validation.accessCode.issues.push('Unusual length (should be 8-20 characters)');
    }
    
    if (validation.workingKey.exists) {
        if (!validation.workingKey.isHex) validation.workingKey.issues.push('Should be hexadecimal (A-F, 0-9 only)');
        if (validation.workingKey.hasWhitespace) validation.workingKey.issues.push('Contains whitespace');
        if (validation.workingKey.length !== 32) validation.workingKey.issues.push('Should be exactly 32 characters');
    }
    
    const hasIssues = validation.merchantId.issues.length > 0 || 
                     validation.accessCode.issues.length > 0 || 
                     validation.workingKey.issues.length > 0;
    
    res.status(200).json({
        success: !hasIssues,
        message: hasIssues ? 'Credential format issues detected' : 'All credentials appear properly formatted',
        validation,
        baseUrl: BASE_URL
    });
});

/**
 * @route   GET /api/ccavenue/test-order/:orderId/:userId
 * @desc    Test order lookup for debugging
 * @access  Private
 */
router.get('/test-order/:orderId/:userId', async (req, res) => {
    try {
        const { orderId, userId } = req.params;
        const Order = require('../models/Order.model.js');
        
        console.log('Testing order lookup:', { orderId, userId });
        
        // Try different lookup methods
        const orderById = await Order.findById(orderId);
        const orderByQuery = await Order.findOne({ _id: orderId, userId: userId });
        const orderWithPopulate = await Order.findOne({ _id: orderId, userId: userId })
            .populate('userId', 'name mobile email');
        
        res.json({
            success: true,
            debug: {
                orderId,
                userId,
                orderById: !!orderById,
                orderByQuery: !!orderByQuery,
                orderWithPopulate: !!orderWithPopulate,
                orderDetails: orderById ? {
                    id: orderById._id,
                    userId: orderById.userId,
                    amount: orderById.amount
                } : null,
                populatedUser: orderWithPopulate?.userId ? {
                    name: orderWithPopulate.userId.name,
                    email: orderWithPopulate.userId.email
                } : null
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
});

module.exports = router; 