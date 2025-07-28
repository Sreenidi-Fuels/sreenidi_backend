const Order = require('../models/Order.model.js');
const mongoose = require('mongoose');

/**
 * Middleware to validate CCAvenue configuration
 */
const validateCCavenueConfig = (req, res, next) => {
    const { CCAVENUE_MERCHANT_ID, CCAVENUE_ACCESS_CODE, CCAVENUE_WORKING_KEY, BASE_URL } = process.env;
    
    if (!CCAVENUE_MERCHANT_ID || !CCAVENUE_ACCESS_CODE || !CCAVENUE_WORKING_KEY) {
        console.error('CCAvenue configuration missing in environment variables');
        return res.status(500).json({
            success: false,
            error: 'Payment service not configured'
        });
    }
    
    if (!BASE_URL) {
        console.error('BASE_URL not configured for payment callbacks');
        return res.status(500).json({
            success: false,
            error: 'Payment service base URL not configured'
        });
    }
    
    next();
};

/**
 * Middleware to validate order ownership and payment eligibility
 */
const validateOrderPayment = async (req, res, next) => {
    try {
        const { orderId, userId } = req.body;
        
        if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid order ID'
            });
        }
        
        // Find order and validate ownership
        const order = await Order.findOne({
            _id: orderId,
            userId: userId
        }).select('amount paymentDetails paymentType');
        
        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found or unauthorized'
            });
        }
        
        // Check if order is eligible for payment
        if (order.paymentDetails && order.paymentDetails.status === 'completed') {
            return res.status(400).json({
                success: false,
                error: 'Payment already completed'
            });
        }
        
        // Attach order to request for controller use
        req.order = order;
        next();
        
    } catch (error) {
        console.error('Order validation error:', error);
        res.status(500).json({
            success: false,
            error: 'Order validation failed'
        });
    }
};

/**
 * Middleware to validate payment amounts and prevent tampering
 */
const validatePaymentAmount = (req, res, next) => {
    const { amount } = req.body;
    const order = req.order;
    
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
        return res.status(400).json({
            success: false,
            error: 'Invalid amount'
        });
    }
    
    // Check amount matches order amount (prevent tampering)
    if (parseFloat(order.amount) !== parseFloat(amount)) {
        console.error(`Amount mismatch for order ${order._id}: expected ${order.amount}, received ${amount}`);
        return res.status(400).json({
            success: false,
            error: 'Amount mismatch'
        });
    }
    
    // Validate amount limits (optional - adjust as per business rules)
    const minAmount = 1.00;
    const maxAmount = 100000.00;
    
    if (parseFloat(amount) < minAmount || parseFloat(amount) > maxAmount) {
        return res.status(400).json({
            success: false,
            error: `Payment amount must be between ₹${minAmount} and ₹${maxAmount}`
        });
    }
    
    next();
};

/**
 * Middleware to log payment operations securely
 */
const logPaymentOperation = (req, res, next) => {
    const timestamp = new Date().toISOString();
    const operation = req.path.replace('/', '').replace('-', '_').toUpperCase();
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
    
    // Log without sensitive data
    console.log(`[${timestamp}] CCAVENUE_${operation} - ${req.method} ${req.originalUrl} - IP: ${clientIP}`);
    
    // Log additional context for specific operations
    if (req.path === '/initiate-payment' && req.body) {
        console.log(`Order: ${req.body.orderId}, Amount: ${req.body.amount}, User: ${req.body.userId}`);
    }
    
    next();
};

/**
 * Middleware to handle CCAvenue callback validation
 */
const validateCCavenueCallback = (req, res, next) => {
    const { encResp } = req.body;
    
    if (!encResp) {
        console.error('Missing encrypted response in CCAvenue callback');
        return res.status(400).json({
            success: false,
            error: 'Invalid payment callback data'
        });
    }
    
    // Optional: Validate callback source IP (CCAvenue specific IPs)
    // This can be enabled if CCAvenue provides specific IP ranges
    /*
    const allowedIPs = ['ccavenue.ip.range'];
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
    if (!allowedIPs.includes(clientIP)) {
        console.error(`Unauthorized callback from IP: ${clientIP}`);
        return res.status(403).json({
            success: false,
            error: 'Unauthorized callback'
        });
    }
    */
    
    next();
};

/**
 * Rate limiting middleware for payment endpoints
 */
const createPaymentRateLimit = () => {
    const requests = new Map();
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const maxRequests = 5; // Maximum 5 payment initiations per 15 minutes per IP
    
    return (req, res, next) => {
        if (req.path !== '/initiate-payment') {
            return next();
        }
        
        const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
        const now = Date.now();
        
        // Clean old entries
        for (const [ip, data] of requests.entries()) {
            if (now - data.firstRequest > windowMs) {
                requests.delete(ip);
            }
        }
        
        const clientData = requests.get(clientIP);
        
        if (!clientData) {
            requests.set(clientIP, { count: 1, firstRequest: now });
            return next();
        }
        
        if (clientData.count >= maxRequests) {
            console.warn(`Payment rate limit exceeded for IP: ${clientIP}`);
            return res.status(429).json({
                success: false,
                error: 'Too many payment requests. Please try again later.'
            });
        }
        
        clientData.count++;
        next();
    };
};

/**
 * Error handling middleware for payment operations
 */
const handlePaymentErrors = (error, req, res, next) => {
    console.error('Payment Operation Error:', {
        path: req.path,
        method: req.method,
        error: error.message,
        timestamp: new Date().toISOString()
    });
    
    // Don't expose internal errors to client
    res.status(500).json({
        success: false,
        error: 'Payment processing error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
};

module.exports = {
    validateCCavenueConfig,
    validateOrderPayment,
    validatePaymentAmount,
    logPaymentOperation,
    validateCCavenueCallback,
    createPaymentRateLimit: createPaymentRateLimit(),
    handlePaymentErrors
}; 