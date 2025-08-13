const Order = require('../models/Order.model.js');
const User = require('../models/User.model.js');
const Address = require('../models/Address.model.js');
const ccavenueUtils = require('../utils/ccavenue.js');
const mongoose = require('mongoose');

/**
 * Initiate CCAvenue Payment
 * POST /api/ccavenue/initiate-payment
 */
exports.initiatePayment = async (req, res) => {
    try {
        const {
            orderId,
            userId,
            amount,
            currency = 'INR',
            billingAddressId,
            shippingAddressId,
            redirectUrl,
            cancelUrl
        } = req.body;

        // Validate required fields
        if (!orderId || !userId || !amount) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: orderId, userId, amount'
            });
        }

        // Validate environment variables
        const { CCAVENUE_MERCHANT_ID, CCAVENUE_ACCESS_CODE, CCAVENUE_WORKING_KEY, BASE_URL } = process.env;
        if (!CCAVENUE_MERCHANT_ID || !CCAVENUE_ACCESS_CODE || !CCAVENUE_WORKING_KEY) {
            console.error('Missing CCAvenue configuration in environment variables');
            return res.status(500).json({
                success: false,
                error: 'Payment service configuration error'
            });
        }

        // Validate order exists and belongs to user
        console.log('=== Order Lookup Debug ===');
        console.log('Looking for orderId:', orderId);
        console.log('Looking for userId:', userId);
        console.log('OrderId type:', typeof orderId);
        console.log('UserId type:', typeof userId);
        
        const order = await Order.findOne({ 
            _id: orderId, 
            userId: userId 
        }).populate([
            { path: 'userId', select: 'name mobile email' },
            { path: 'billingAddress' },
            { path: 'shippingAddress' }
        ]);

        console.log('Order found:', !!order);
        if (order) {
            console.log('Order ID from DB:', order._id);
            console.log('User ID from DB:', order.userId);
            console.log('User populated:', !!order.userId);
        }
        console.log('=== End Order Debug ===');

        if (!order) {
            console.error(`Order not found - orderId: ${orderId}, userId: ${userId}`);
            return res.status(404).json({
                success: false,
                error: 'Order not found or unauthorized'
            });
        }

        // Additional safety check for populated user data
        if (!order.userId || !order.userId.name) {
            console.error('Order found but user data not properly populated:', {
                orderExists: !!order,
                userIdExists: !!order.userId,
                userNameExists: order.userId ? !!order.userId.name : false
            });
            return res.status(500).json({
                success: false,
                error: 'Order data incomplete - user information missing'
            });
        }

        // Check if order amount matches
        if (parseFloat(order.amount) !== parseFloat(amount)) {
            console.error(`Amount mismatch for order ${orderId}: expected ${order.amount}, received ${amount}`);
            return res.status(400).json({
                success: false,
                error: 'Amount mismatch'
            });
        }

        // Check if payment is already completed
        if (order.paymentDetails && order.paymentDetails.status === 'completed') {
            return res.status(400).json({
                success: false,
                error: 'Payment already completed for this order'
            });
        }

        // Get billing and shipping addresses
        let billingAddress = order.billingAddress;
        let shippingAddress = order.shippingAddress;

        // If specific address IDs provided, fetch them
        if (billingAddressId && billingAddressId !== order.billingAddress._id.toString()) {
            billingAddress = await Address.findById(billingAddressId);
        }
        if (shippingAddressId && shippingAddressId !== order.shippingAddress._id.toString()) {
            shippingAddress = await Address.findById(shippingAddressId);
        }

        // Prepare payment data
        const defaultRedirectUrl = `${BASE_URL}/api/ccavenue/payment-response`;
        const defaultCancelUrl = `${BASE_URL}/api/ccavenue/payment-cancel`;

        const paymentData = {
            orderId: order._id.toString(),
            amount: parseFloat(amount).toFixed(2),
            currency,
            redirectUrl: redirectUrl || defaultRedirectUrl,
            cancelUrl: cancelUrl || defaultCancelUrl,
            billingName: order.userId.name || '',
            billingAddress: billingAddress ? `${billingAddress.addressLine1}, ${billingAddress.addressLine2 || ''}` : '',
            billingCity: billingAddress ? billingAddress.city : '',
            billingState: billingAddress ? billingAddress.state : '',
            billingZip: billingAddress ? billingAddress.postalCode : '',
            billingCountry: 'India',
            billingTel: order.userId.mobile || '',
            billingEmail: order.userId.email || '',
            deliveryName: order.userId.name || '',
            deliveryAddress: shippingAddress ? `${shippingAddress.addressLine1}, ${shippingAddress.addressLine2 || ''}` : '',
            deliveryCity: shippingAddress ? shippingAddress.city : '',
            deliveryState: shippingAddress ? shippingAddress.state : '',
            deliveryZip: shippingAddress ? shippingAddress.postalCode : '',
            deliveryCountry: 'India',
            deliveryTel: order.userId.mobile || ''
        };

        // Generate encrypted payment request
        const paymentRequest = ccavenueUtils.generatePaymentRequest(
            paymentData,
            CCAVENUE_MERCHANT_ID,
            CCAVENUE_ACCESS_CODE
        );

        // DEBUG: Log the exact data being sent (temporarily for debugging)
        console.log('=== CCAvenue Debug Info ===');
        console.log('Merchant ID length:', CCAVENUE_MERCHANT_ID.length);
        console.log('Access Code length:', CCAVENUE_ACCESS_CODE.length);
        console.log('Working Key length:', CCAVENUE_WORKING_KEY.length);
        console.log('Payment Data Keys:', Object.keys(paymentData));
        console.log('Order ID:', paymentData.orderId);
        console.log('Amount:', paymentData.amount);
        console.log('Customer Name:', paymentData.billingName);
        console.log('Customer Email:', paymentData.billingEmail);
        console.log('Redirect URL:', paymentData.redirectUrl);
        console.log('=== End Debug Info ===');

        // Update order with payment initiation details
        const updateData = {
            paymentType: 'online',
            $set: {
                'paymentDetails.status': 'processing',
                'paymentDetails.method': 'ccavenue',
                'paymentDetails.amount': parseFloat(amount),
                'paymentDetails.currency': currency,
                'paymentDetails.lastPaymentAttempt': new Date(),
                'paymentDetails.retryCount': (order.paymentDetails?.retryCount || 0) + 1
            }
        };

        await Order.findByIdAndUpdate(orderId, updateData);

        // Log payment initiation (without sensitive data)
        console.log(`Payment initiated for order ${orderId}, amount: ${amount}, user: ${userId}`);

        // Response with payment form data
        const ccavenueBaseUrl = process.env.NODE_ENV === 'development' 
            ? 'https://secure.ccavenue.com' 
            : 'https://test.ccavenue.com';
        
        res.status(200).json({
            success: true,
            message: 'Payment request generated successfully',
            data: {
                paymentUrl: `${ccavenueBaseUrl}/transaction/transaction.do?command=initiateTransaction`,
                formData: {
                    merchant_id: paymentRequest.merchant_id,
                    access_code: paymentRequest.access_code,
                    encRequest: paymentRequest.encRequest
                },
                orderId: order._id,
                amount: parseFloat(amount).toFixed(2),
                currency
            }
        });

    } catch (error) {
        console.error('CCAvenue Payment Initiation Error:', error);
        res.status(500).json({
            success: false,
            error: 'Payment initiation failed',
            message: error.message
        });
    }
};

/**
 * Handle CCAvenue Payment Response
 * POST /api/ccavenue/payment-response
 */
exports.handlePaymentResponse = async (req, res) => {
    try {
        const { encResp } = req.body;

        if (!encResp) {
            console.error('No encrypted response received from CCAvenue');
            return res.status(400).json({
                success: false,
                error: 'Invalid payment response'
            });
        }

        // Decrypt the response
        const workingKey = process.env.CCAVENUE_WORKING_KEY;
        const decryptedResponse = ccavenueUtils.decrypt(encResp, workingKey);
        const responseData = ccavenueUtils.parseResponse(decryptedResponse);

        // Validate response
        if (!ccavenueUtils.validateResponse(responseData)) {
            console.error('Invalid payment response structure:', responseData);
            return res.status(400).json({
                success: false,
                error: 'Invalid payment response format'
            });
        }

        const orderId = responseData.order_id;
        const paymentStatus = ccavenueUtils.mapPaymentStatus(responseData.order_status);

        // Find the order
        const order = await Order.findById(orderId);
        if (!order) {
            console.error(`Order not found for payment response: ${orderId}`);
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        // Prepare update data based on payment status
        const updateData = {
            $set: {
                'paymentDetails.status': paymentStatus,
                'paymentDetails.transactionId': responseData.transaction_id || responseData.tracking_id,
                'paymentDetails.bankRefNo': responseData.bank_ref_no,
                'paymentDetails.trackingId': responseData.tracking_id,
                'paymentDetails.paymentMode': responseData.payment_mode,
                'paymentDetails.bankName': responseData.bank_name,
                'paymentDetails.ccavenueResponse': responseData
            }
        };

        // Set paid date for successful payments
        if (paymentStatus === 'completed') {
            updateData.$set['paymentDetails.paidAt'] = new Date();
            console.log(`Payment completed for order ${orderId}, transaction ID: ${responseData.tracking_id}`);
        } else {
            updateData.$set['paymentDetails.failureReason'] = responseData.failure_message || responseData.status_message;
            console.log(`Payment failed for order ${orderId}, reason: ${responseData.failure_message || responseData.status_message}`);
        }

        // Update the order
        await Order.findByIdAndUpdate(orderId, updateData);

        // Generate deep link for mobile app
        const deepLink = ccavenueUtils.generateDeepLink(paymentStatus, orderId, {
            transactionId: responseData.tracking_id,
            amount: responseData.amount,
            paymentMode: responseData.payment_mode
        });

        // Determine response based on payment status
        if (paymentStatus === 'completed') {
            res.status(200).json({
                success: true,
                message: 'Payment completed successfully',
                data: {
                    orderId,
                    transactionId: responseData.tracking_id,
                    amount: responseData.amount,
                    paymentMode: responseData.payment_mode,
                    bankRefNo: responseData.bank_ref_no,
                    deepLink
                }
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'Payment failed',
                data: {
                    orderId,
                    status: paymentStatus,
                    failureReason: responseData.failure_message || responseData.status_message,
                    deepLink
                }
            });
        }

    } catch (error) {
        console.error('CCAvenue Payment Response Error:', error);
        res.status(500).json({
            success: false,
            error: 'Payment response processing failed',
            message: error.message
        });
    }
};

/**
 * Handle CCAvenue Payment Cancellation
 * POST /api/ccavenue/payment-cancel
 */
exports.handlePaymentCancel = async (req, res) => {
    try {
        const { encResp } = req.body;
        
        if (!encResp) {
            console.error('No encrypted response received for payment cancellation');
            return res.status(400).json({
                success: false,
                error: 'Invalid cancellation response'
            });
        }

        // Decrypt the response
        const workingKey = process.env.CCAVENUE_WORKING_KEY;
        const decryptedResponse = ccavenueUtils.decrypt(encResp, workingKey);
        const responseData = ccavenueUtils.parseResponse(decryptedResponse);

        const orderId = responseData.order_id;
        
        if (!orderId) {
            console.error('Order ID not found in cancellation response');
            return res.status(400).json({
                success: false,
                error: 'Invalid cancellation data'
            });
        }

        // Find the order
        const order = await Order.findById(orderId);
        if (!order) {
            console.error(`Order not found for payment cancellation: ${orderId}`);
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        // Update order with cancellation details
        const updateData = {
            $set: {
                'paymentDetails.status': 'cancelled',
                'paymentDetails.failureReason': 'Payment cancelled by user',
                'paymentDetails.ccavenueResponse': responseData
            }
        };

        await Order.findByIdAndUpdate(orderId, updateData);

        // Log cancellation
        console.log(`Payment cancelled for order ${orderId} by user`);

        // Generate deep link for mobile app
        const deepLink = ccavenueUtils.generateDeepLink('cancelled', orderId, {
            reason: 'cancelled_by_user',
            timestamp: new Date().toISOString()
        });

        res.status(200).json({
            success: true,
            message: 'Payment cancellation processed',
            data: {
                orderId,
                status: 'cancelled',
                reason: 'Payment cancelled by user',
                deepLink
            }
        });

    } catch (error) {
        console.error('CCAvenue Payment Cancellation Error:', error);
        res.status(500).json({
            success: false,
            error: 'Payment cancellation processing failed',
            message: error.message
        });
    }
};

/**
 * Get Payment Status
 * GET /api/ccavenue/payment-status/:orderId
 */
exports.getPaymentStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { userId } = req.query; // Optional user validation

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid order ID'
            });
        }

        // Build query
        const query = { _id: orderId };
        if (userId) {
            query.userId = userId;
        }

        const order = await Order.findOne(query)
            .select('paymentDetails amount paymentType')
            .lean();

        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        res.status(200).json({
            success: true,
            data: {
                orderId,
                paymentStatus: order.paymentDetails?.status || 'pending',
                paymentMethod: order.paymentDetails?.method || order.paymentType,
                transactionId: order.paymentDetails?.transactionId,
                amount: order.amount,
                paidAt: order.paymentDetails?.paidAt,
                failureReason: order.paymentDetails?.failureReason
            }
        });

    } catch (error) {
        console.error('Get Payment Status Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get payment status',
            message: error.message
        });
    }
};

/**
 * Retry Payment
 * POST /api/ccavenue/retry-payment
 */
exports.retryPayment = async (req, res) => {
    try {
        const { orderId } = req.body;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        // Check if order can be retried
        if (order.paymentDetails?.status === 'completed') {
            return res.status(400).json({
                success: false,
                error: 'Payment already completed'
            });
        }

        const retryCount = order.paymentDetails?.retryCount || 0;
        if (retryCount >= 3) {
            return res.status(400).json({
                success: false,
                error: 'Maximum retry attempts exceeded'
            });
        }

        // Reset payment status to allow retry
        await Order.findByIdAndUpdate(orderId, {
            $set: {
                'paymentDetails.status': 'pending',
                'paymentDetails.failureReason': null
            }
        });

        res.status(200).json({
            success: true,
            message: 'Order ready for payment retry',
            data: {
                orderId,
                retryCount: retryCount + 1
            }
        });

    } catch (error) {
        console.error('Retry Payment Error:', error);
        res.status(500).json({
            success: false,
            error: 'Payment retry failed',
            message: error.message
        });
    }
}; 