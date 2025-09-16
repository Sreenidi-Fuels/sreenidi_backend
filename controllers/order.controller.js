const Order = require('../models/Order.model.js');
const mongoose = require('mongoose');
const Admin = require('../models/Admin.model.js');
const User = require('../models/User.model.js');
const LedgerService = require('../services/ledger.service.js');

async function computeUserPricing(userId) {
    try {
        const [user, admin] = await Promise.all([
            User.findById(userId).select('role creditFuelRate'),
            Admin.findOne().select('dailyRate')
        ]);

        const dailyRate = admin?.dailyRate ?? null;
        const creditFuelRate = user?.creditFuelRate ?? null;

        if (user && user.role === 'credited' && creditFuelRate) {
            return {
                appliedRate: Number(creditFuelRate),
                rateType: 'credited',
                dailyRate,
                creditFuelRate: Number(creditFuelRate)
            };
        }

        return {
            appliedRate: dailyRate,
            rateType: 'daily',
            dailyRate,
            creditFuelRate: creditFuelRate ? Number(creditFuelRate) : null
        };
    } catch (_err) {
        return { appliedRate: null, rateType: 'unknown', dailyRate: null, creditFuelRate: null };
    }
}

async function orderWithPricing(orderDoc) {
    const pricing = await computeUserPricing(orderDoc.userId);
    return { ...orderDoc.toObject(), pricing };
}

async function ordersWithPricing(orderDocs) {
    return Promise.all(orderDocs.map(async (o) => orderWithPricing(o)));
}

// Update population logic to include driver details and vehicle details
const populateOptions = [
    { path: 'shippingAddress' },
    { path: 'billingAddress' },
    { path: 'asset' },
    {
        path: 'tracking.driverAssignment.driverId',
        populate: { path: 'vehicleDetails' },
        select: 'name mobile vehicleDetails'
    }
];

// Create a driver-initiated cash order (QR or cash, no addresses required)
exports.createDriverCashOrder = async (req, res) => {
    try {
        const { userId, fuelQuantity, amount, paymentMethod, receiverDetails, phoneNumber, deliveryMode, deliveryDate } = req.body;

        // Required fields validation
        if (!Number.isFinite(Number(fuelQuantity)) || Number(fuelQuantity) <= 0) return res.status(400).json({ error: 'fuelQuantity must be a positive number' });
        if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) return res.status(400).json({ error: 'amount must be a positive number' });
        if (!paymentMethod || !['cash', 'qr'].includes(String(paymentMethod).toLowerCase())) return res.status(400).json({ error: 'paymentMethod must be cash or qr' });
        if (!receiverDetails || typeof receiverDetails !== 'object') return res.status(400).json({ error: 'receiverDetails is required' });
        if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber is required' });

        // If userId not provided, create/find a lightweight cash user using phoneNumber
        let resolvedUserId = userId;
        if (!resolvedUserId) {
            const existing = await User.findOne({ phoneNumber });
            if (existing) {
                resolvedUserId = existing._id;
            } else {
                const safeLocalPart = String(phoneNumber || 'anonymous').replace(/[^a-zA-Z0-9]/g, '');
                const tempUser = await User.create({
                    name: receiverDetails?.name || 'Cash Customer',
                    phoneNumber,
                    email: `cash+${safeLocalPart}@sreenidhifuels.local`,
                    role: 'normal'
                });
                resolvedUserId = tempUser._id;
            }
        }

        const normalizedPaymentMethod = String(paymentMethod).toLowerCase() === 'qr' ? 'cash' : 'cash';

        const orderData = {
            userId: resolvedUserId,
            fuelQuantity: Number(fuelQuantity),
            amount: Number(amount),
            paymentType: 'cash',
            orderType: 'driver-initiated',
            deliveryMode: deliveryMode || 'earliest',
            deliveryDate: deliveryMode === 'scheduled' ? deliveryDate : undefined,
            receiverDetails,
            CustomersCash: Number(amount), // customer pays upfront; used later by invoice flow
        };

        const order = new Order(orderData);

        // Driver-initiated cash: do not auto-complete dispatch/OTPs here.

        await order.save();
        await order.populate(populateOptions);

        // Attach convenience fields for client
        const response = await orderWithPricing(order);
        response.paymentDetails = {
            status: 'pending',
            method: normalizedPaymentMethod,
            currency: 'INR',
            retryCount: 0
        };
        response.orderAmount = order.amount;
        response.customerPhone = phoneNumber;

        return res.status(201).json(response);
    } catch (err) {
        console.error('Driver cash order creation failed:', err);
        return res.status(400).json({ error: err.message });
    }
};
// Create a driver-initiated credit order
exports.createDriverCreditOrder = async (req, res) => {
    try {
        const { userId, amount } = req.body;

        // Validate presence of required fields for credit
        if (!userId) {
            return res.status(400).json({ error: 'userId is required for credit orders' });
        }
        if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
            return res.status(400).json({ error: 'Invalid order amount' });
        }

        // Credit validation (same as other credit flows)
        const User = require('../models/User.model.js');
        const UserLedger = require('../models/UserLedger.model.js');

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (user.role !== 'credited') {
            return res.status(400).json({ error: 'User is not eligible for credit orders', userRole: user.role });
        }
        if (!user.creditLimit || user.creditLimit <= 0) {
            return res.status(400).json({ error: 'User does not have a valid credit limit set', creditLimit: user.creditLimit });
        }

        // Use credit orders that still consume limit until repaid (pending/dispatched/completed)
        const activeCreditOrders = await Order.find({
            userId,
            paymentType: 'credit',
            'tracking.dispatch.status': { $in: ['pending', 'dispatched', 'completed'] }
        }).select('amount totalAmount');
        const creditLimitUsed = activeCreditOrders.reduce((sum, o) => {
            // Use totalAmount if available, otherwise fall back to amount
            const orderAmount = o.totalAmount !== null && o.totalAmount !== undefined ? o.totalAmount : o.amount;
            return sum + (Number(orderAmount) || 0);
        }, 0);
        const amountOfCreditAvailable = Math.max(0, (user.creditLimit || 0) - creditLimitUsed);

        // Use totalAmount for validation if provided, otherwise use amount; coerce to Number
        const validationAmount = Number(
            (req.body.totalAmount ?? amount)
        );

        if (amountOfCreditAvailable <= 0 || validationAmount > amountOfCreditAvailable) {
            return res.status(400).json({
                error: `Order amount (₹${validationAmount}) exceeds available credit (₹${amountOfCreditAvailable})`,
                creditInfo: {
                    creditLimit: user.creditLimit,
                    creditLimitUsed,
                    amountOfCreditAvailable,
                    requestedAmount: validationAmount,
                    remainingCreditAfterOrder: Math.max(0, amountOfCreditAvailable - validationAmount)
                }
            });
        }

        const orderData = {
            ...req.body,
            orderType: 'driver-initiated',
            paymentType: 'credit',
            deliveryMode: req.body.deliveryMode || 'earliest',
            receiverDetails: req.body.receiverDetails || { type: 'self' },
            asset: req.body.asset || req.body.assetId,
            // For credit orders, use totalAmount as the order amount
            amount: req.body.totalAmount || req.body.amount
        };

        const order = new Order(orderData);
        // Driver-initiated credit: do not auto-complete dispatch/OTPs here.

        await order.save();
        await order.populate(populateOptions);
        return res.status(201).json(await orderWithPricing(order));
    } catch (err) {
        console.error('Driver credit order creation failed:', err);
        return res.status(400).json({ error: err.message });
    }
};

// Create a new normal order
exports.createOrder = async (req, res) => {
    try {
        const { userId, amount, paymentType } = req.body;
        
        // 🚨 CRITICAL: Validate credit limit for credit orders
        if (paymentType === 'credit') {
            console.log('=== Credit Order Validation ===');
            console.log('User ID:', userId);
            console.log('Order Amount:', amount);
            console.log('Total Amount:', req.body.totalAmount);
            console.log('Payment Type:', paymentType);
            
            // Get user credit information
            const User = require('../models/User.model.js');
            const UserLedger = require('../models/UserLedger.model.js');
            
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            
            // Check if user is eligible for credit
            if (user.role !== 'credited') {
                return res.status(400).json({ 
                    error: 'User is not eligible for credit orders',
                    userRole: user.role 
                });
            }
            
            // Check if user has a credit limit set
            if (!user.creditLimit || user.creditLimit <= 0) {
                return res.status(400).json({ 
                    error: 'User does not have a valid credit limit set',
                    creditLimit: user.creditLimit 
                });
            }
            
            // Get user's credit limit and usage (ACTIVE credit orders: pending, dispatched, completed)
            const creditLimit = user.creditLimit;
            // Use credit orders that still consume limit until repaid (pending/dispatched/completed)
            const activeCreditOrders = await Order.find({
                userId,
                paymentType: 'credit',
                'tracking.dispatch.status': { $in: ['pending', 'dispatched', 'completed'] }
            }).select('amount totalAmount');
            const creditLimitUsed = activeCreditOrders.reduce((sum, o) => {
                // Use totalAmount if available, otherwise fall back to amount
                const orderAmount = o.totalAmount !== null && o.totalAmount !== undefined ? o.totalAmount : o.amount;
                return sum + (Number(orderAmount) || 0);
            }, 0);
            const amountOfCreditAvailable = Math.max(0, creditLimit - creditLimitUsed);
            
            // Use totalAmount for validation if provided, otherwise use amount; coerce to Number
            const validationAmount = Number(
                (req.body.totalAmount ?? amount)
            );
            
            console.log('Credit Validation Details:');
            console.log('Credit Limit:', creditLimit);
            // Outstanding is independent; not used for limit
            const userLedger = await UserLedger.findOne({ userId });
            const outstandingAmount = userLedger?.outstandingAmount || 0;
            console.log('Outstanding Amount (independent):', outstandingAmount);
            console.log('Amount of Credit Available:', amountOfCreditAvailable);
            console.log('Requested Order Amount (for validation):', validationAmount);
            console.log('Using totalAmount for validation:', req.body.totalAmount !== null && req.body.totalAmount !== undefined);
            
            // Validate amount
            if (!Number.isFinite(Number(validationAmount)) || Number(validationAmount) <= 0) {
                return res.status(400).json({ error: 'Invalid order amount' });
            }
            
            // Check if order amount exceeds available credit
            if (amountOfCreditAvailable <= 0 || validationAmount > amountOfCreditAvailable) {
                return res.status(400).json({
                    error: `Order amount (₹${validationAmount}) exceeds available credit (₹${amountOfCreditAvailable})`,
                    creditInfo: {
                        creditLimit,
                        outstandingAmount,
                        creditLimitUsed,
                        amountOfCreditAvailable,
                        requestedAmount: validationAmount,
                        remainingCreditAfterOrder: Math.max(0, amountOfCreditAvailable - validationAmount)
                    }
                });
            }
            
            console.log('✅ Credit validation passed');
            console.log('Remaining credit after order:', amountOfCreditAvailable - validationAmount);
        }
        
        // For credit orders, use totalAmount as the order amount
        const orderData = {
            ...req.body,
            ...(req.body.paymentType === 'credit' && { amount: req.body.totalAmount || req.body.amount })
        };
        const order = new Order(orderData);
        await order.save();
        await order.populate(populateOptions);
        
        // ✅ REMOVED: No ledger entry created on order creation
        // Ledger entries are now created when:
        // 1. Payment is received (CREDIT entry - totalPaid increases)
        // 2. Fuel is delivered (DEBIT entry - totalOrders increases)
        
        console.log('=== Order Created Successfully ===');
        console.log('Order ID:', order._id);
        console.log('User ID:', order.userId);
        console.log('Amount:', order.amount);
        console.log('Fuel Quantity:', order.fuelQuantity);
        console.log('Note: CREDIT entry will be created when payment is received');
        console.log('Note: DEBIT entry will be created when fuel is delivered (invoice confirmed)');
        
        res.status(201).json(await orderWithPricing(order));
    } catch (err) {
        console.error('Order creation failed:', err);
        res.status(400).json({ error: err.message });
    }
};

// Create a direct cash order
exports.createDirectCashOrder = async (req, res) => {
    try {
        const orderData = {
            ...req.body,
            orderType: 'direct',
            paymentType: 'cash',
            // Preserve the deliveryMode from request body, don't override
        };
        const order = new Order(orderData);
        await order.save();
        await order.populate(populateOptions);
        res.status(201).json(await orderWithPricing(order));
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Create a direct credit order
exports.createDirectCreditOrder = async (req, res) => {
    try {
        const { userId, amount } = req.body;
        
        // 🚨 CRITICAL: Validate credit limit before creating order
        console.log('=== Credit Order Validation ===');
        console.log('User ID:', userId);
        console.log('Order Amount:', amount);
        console.log('Total Amount:', req.body.totalAmount);
        console.log('Payment Type: credit');
        
        // Get user credit information
        const User = require('../models/User.model.js');
        const UserLedger = require('../models/UserLedger.model.js');
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Check if user is eligible for credit
        if (user.role !== 'credited') {
            return res.status(400).json({ 
                error: 'User is not eligible for credit orders',
                userRole: user.role 
            });
        }
        
        // Check if user has a credit limit set
        if (!user.creditLimit || user.creditLimit <= 0) {
            return res.status(400).json({ 
                error: 'User does not have a valid credit limit set',
                creditLimit: user.creditLimit 
            });
        }
        
        // Get user's credit limit and usage (ACTIVE credit orders: pending, dispatched, completed)
        const creditLimit = user.creditLimit;
        // Use credit orders that still consume limit until repaid (pending/dispatched/completed)
        const activeCreditOrders = await Order.find({
            userId,
            paymentType: 'credit',
            'tracking.dispatch.status': { $in: ['pending', 'dispatched', 'completed'] }
        }).select('amount totalAmount');
        const creditLimitUsed = activeCreditOrders.reduce((sum, o) => {
            // Use totalAmount if available, otherwise fall back to amount
            const orderAmount = o.totalAmount !== null && o.totalAmount !== undefined ? o.totalAmount : o.amount;
            return sum + (Number(orderAmount) || 0);
        }, 0);
        const amountOfCreditAvailable = Math.max(0, creditLimit - creditLimitUsed);

        // Use totalAmount for validation if provided, otherwise use amount; coerce to Number
        const validationAmount = Number(
            (req.body.totalAmount ?? amount)
        );

        console.log('Credit Validation Details:');
        console.log('Credit Limit:', creditLimit);
        const userLedger = await UserLedger.findOne({ userId });
        const outstandingAmount = userLedger?.outstandingAmount || 0;
        console.log('Outstanding Amount (independent):', outstandingAmount);
        console.log('Credit Limit Used:', creditLimitUsed);
        console.log('Amount of Credit Available:', amountOfCreditAvailable);
        console.log('Requested Order Amount (for validation):', validationAmount);
        console.log('Using totalAmount for validation:', req.body.totalAmount !== null && req.body.totalAmount !== undefined);
        
        // Validate amount and available credit
        if (!Number.isFinite(validationAmount) || validationAmount <= 0) {
            return res.status(400).json({ error: 'Invalid order amount' });
        }
        // Check if order amount exceeds available credit
        if (validationAmount > amountOfCreditAvailable) {
            return res.status(400).json({
                error: `Order amount (₹${validationAmount}) exceeds available credit (₹${amountOfCreditAvailable})`,
                creditInfo: {
                    creditLimit,
                    outstandingAmount,
                    creditLimitUsed,
                    amountOfCreditAvailable,
                    requestedAmount: validationAmount,
                    remainingCreditAfterOrder: Math.max(0, amountOfCreditAvailable - validationAmount)
                }
            });
        }
        
        console.log('✅ Credit validation passed');
        console.log('Remaining credit after order:', amountOfCreditAvailable - validationAmount);
        
        const orderData = {
            ...req.body,
            orderType: 'direct',
            paymentType: 'credit',
            // Preserve the deliveryMode from request body, don't override
            asset: req.body.assetId,
            // For credit orders, use totalAmount as the order amount
            amount: req.body.totalAmount || req.body.amount
        };
        const order = new Order(orderData);
        await order.save();
        await order.populate(populateOptions);
        // ℹ️ No DEBIT entry here for credit orders.
        // DEBIT entry will be created when the invoice is updated to status 'finalised',
        // using the invoice total amount (same as ccavenue flow).
        
        res.status(201).json(await orderWithPricing(order));
    } catch (err) {
        console.error('Direct credit order creation failed:', err);
        res.status(400).json({ error: err.message });
    }
};

// Get all orders
exports.getOrders = async (req, res) => {
    try {
        const orders = await Order.find()
            .populate('shippingAddress')
            .populate('billingAddress')
            .populate('asset')
            .populate({ path: 'tracking.driverAssignment.driverId', populate: { path: 'vehicleDetails' } });
        res.json(await ordersWithPricing(orders));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get a single order by ID
exports.getOrderById = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('shippingAddress')
            .populate('billingAddress')
            .populate('asset')
            .populate({ path: 'tracking.driverAssignment.driverId', populate: { path: 'vehicleDetails' } });
        if (!order) return res.status(404).json({ error: 'Order not found' });
        res.json(await orderWithPricing(order));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get all orders for a specific user by userId
exports.getOrdersByUserId = async (req, res) => {
    try {
        const userId = req.params.userId;
        if (!userId) return res.status(400).json({ error: 'User ID is required' });
        const orders = await Order.find({ userId: userId })
            .populate('shippingAddress')
            .populate('billingAddress')
            .populate('asset')
            .populate({ path: 'tracking.driverAssignment.driverId', populate: { path: 'vehicleDetails' }, select: 'name mobile vehicleDetails' });
        res.json(await ordersWithPricing(orders));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get the last order for a specific user by userId
exports.getLastOrderByUserId = async (req, res) => {
    try {
        const userId = req.params.userId;
        if (!userId) return res.status(400).json({ error: 'User ID is required' });
        const lastOrder = await Order.findOne({ userId: userId })
            .sort({ createdAt: -1 })
            .populate('shippingAddress')
            .populate('billingAddress')
            .populate('asset')
            .populate({ path: 'tracking.driverAssignment.driverId', populate: { path: 'vehicleDetails' }, select: 'name mobile vehicleDetails' });
        if (!lastOrder) return res.status(404).json({ error: 'No orders found for this user' });
        res.json(await orderWithPricing(lastOrder));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get all orders assigned to a specific driver by driverId
exports.getOrdersByDriverId = async (req, res) => {
    try {
        const driverId = req.params.driverId;
        if (!driverId) return res.status(400).json({ error: 'Driver ID is required' });
        const orders = await Order.find({ 'tracking.driverAssignment.driverId': driverId })
            .populate('shippingAddress')
            .populate('billingAddress')
            .populate('asset')
            .populate({ path: 'tracking.driverAssignment.driverId', populate: { path: 'vehicleDetails' } });
        res.json(await ordersWithPricing(orders));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get completed orders for a specific user by userId
exports.getCompletedOrdersByUserId = async (req, res) => {
    try {
        const userId = req.params.userId;
        if (!userId) return res.status(400).json({ error: 'User ID is required' });
        const orders = await Order.find({ userId: userId, 'tracking.dispatch.status': 'completed' })
            .populate('shippingAddress')
            .populate('billingAddress')
            .populate('asset')
            .populate({ path: 'tracking.driverAssignment.driverId', populate: { path: 'vehicleDetails' }, select: 'name mobile vehicleDetails' });
        res.json(await ordersWithPricing(orders));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get completed orders for a specific driver by driverId
exports.getCompletedOrdersByDriverId = async (req, res) => {
    try {
        const driverId = req.params.driverId;
        if (!driverId) return res.status(400).json({ error: 'Driver ID is required' });
        const orders = await Order.find({ 'tracking.driverAssignment.driverId': driverId, 'tracking.dispatch.status': 'completed' })
            .populate('shippingAddress')
            .populate('billingAddress')
            .populate('asset')
            .populate({ path: 'tracking.driverAssignment.driverId', populate: { path: 'vehicleDetails' } });
        res.json(await ordersWithPricing(orders));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get all ongoing orders for a specific user by userId (not completed)
exports.getOngoingOrdersByUserId = async (req, res) => {
    try {
        const userId = req.params.userId;
        if (!userId) return res.status(400).json({ error: 'User ID is required' });
        const orders = await Order.find({
            userId: userId,
            'tracking.dispatch.status': { $ne: 'completed' }
        })
        .populate('shippingAddress')
        .populate('billingAddress')
        .populate('asset');
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Update an order by ID
exports.updateOrder = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ error: 'Order not found' });

        // Prevent editing if both startVerified and stopVerified are true
        if (order.tracking.fuelDispense.startVerified && order.tracking.fuelDispense.stopVerified) {
            return res.status(403).json({ error: 'Order cannot be edited after dispensing is completed.' });
        }

        // Proceed with update if allowed
        const updatedOrder = await Order.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
            .populate('shippingAddress')
            .populate('billingAddress')
            .populate('asset')
            .populate({ path: 'tracking.driverAssignment.driverId', populate: { path: 'vehicleDetails' }, select: 'name mobile vehicleDetails' });
        res.json(updatedOrder);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Delete an order by ID
exports.deleteOrder = async (req, res) => {
    try {
        const order = await Order.findByIdAndDelete(req.params.id);
        if (!order) return res.status(404).json({ error: 'Order not found' });
        res.json({ message: 'Order deleted successfully', order });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Accept or reject an order (admin action)
exports.acceptOrder = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ error: 'Order not found' });

        // Get status from request body (should be 'accepted' or 'rejected')
        const { status } = req.body;
        if (!status || !['accepted', 'rejected'].includes(status)) {
            return res.status(400).json({ error: "Status must be 'accepted' or 'rejected'" });
        }

        // Update order confirmation status
        order.tracking.orderConfirmation.status = status;

        // Only for driver-initiated orders: auto-verify OTPs when accepted
        if (order.orderType === 'driver-initiated' && status === 'accepted') {
            order.tracking.fuelDispense.startVerified = true;
            order.tracking.fuelDispense.stopVerified = true;
            // Optionally reflect delivered liters if not set yet
            if (!order.deliveredLiters && order.fuelQuantity) {
                order.deliveredLiters = order.fuelQuantity;
            }
        }

        await order.save();
        res.json(order);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Assign a driver to an order (admin action)
exports.assignDriver = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ error: 'Order not found' });

        const { driverId } = req.body;
        if (!driverId) {
            return res.status(400).json({ error: 'Driver ID is required' });
        }

        order.tracking.driverAssignment.driverId = driverId;
        // For driver-initiated orders only, auto-update statuses upon assignment
        if (order.orderType === 'driver-initiated') {
            // Confirm order and mark dispatch as completed upon assignment
            order.tracking.orderConfirmation.status = 'accepted';
            order.tracking.dispatch.status = 'completed';
        }
        await order.save();
        res.json(order);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Update dispatch status (driver action)
exports.updateDispatchStatus = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ error: 'Order not found' });

        const { status } = req.body;
        if (!status || !['pending', 'dispatched'].includes(status)) {
            return res.status(400).json({ error: 'Invalid or missing dispatch status' });
        }
        if(!order.tracking.driverAssignment.driverId){
             return res.status(400).json({ error: 'Cannot start dispatch as driver is not assigned!' });
        }

        order.tracking.dispatch.status = status;
        order.tracking.dispatch.dispatchedAt = new Date();
        await order.save();
        res.json(order);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Validate startDispenseOtp for an order
exports.validateStartDispenseOtp = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ error: 'Order not found' });

        const { otp } = req.body;
        if (!otp) return res.status(400).json({ error: 'OTP is required' });

        if (order.tracking.fuelDispense.startDispenseOtp === Number(otp) && order.tracking.fuelDispense.startVerified === false) {
            order.tracking.fuelDispense.startVerified = true;
            await order.save();
            return res.json({ success: true, message: 'OTP verified successfully', order });
        } else {
            return res.status(400).json({ success: false, error: 'Invalid OTP/ Already started dispensing' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

//validate stopDispenseOtp for an order
exports.validateStopDispenseOtp = async (req, res) => {
    try{
        const order = await Order.findById(req.params.id);
        if(!order) return res.status(404).json({ error: 'Order not found!'});

        const { otp } = req.body;
        if(!otp) return res.status(400).json({ error: 'OTP is required'});

        if(order.tracking.fuelDispense.startVerified === true && order.tracking.fuelDispense.stopDispenseOtp === Number(otp)){
            order.tracking.fuelDispense.stopVerified = true;
            order.tracking.dispatch.status = 'completed'
            await order.save();
            
            // Invoice generation removed - create manually via POST /api/invoice
            
            return res.json({ success: true, message: 'OTP verified succesfully', order });
        }else{
            return res.status(400).json({ success: false, error: 'Invalid OTP' });
        }
    }catch( err ){
        res.status(500).json({ error: err.message });
    }
};

// Repeat the last completed order for a user by userId
exports.repeatCompletedOrder = async (req, res) => {
    try {
        const { userId } = req.params;
        // Use the same logic as getCompletedOrdersByUserId, but only get the most recent one
        const lastCompletedOrder = await Order.findOne({
            userId: userId,
            'tracking.dispatch.status': 'completed'
        })
        .sort({ createdAt: -1 })
        .populate('shippingAddress')
        .populate('billingAddress')
        .populate('asset')
        .populate({ path: 'tracking.driverAssignment.driverId', populate: { path: 'vehicleDetails' }, select: 'name mobile vehicleDetails' });
        if (!lastCompletedOrder) {
            return res.status(404).json({ error: 'No completed order found for this user' });
        }

        // Prepare new order data (copy fields except _id, timestamps, and tracking)
        const newOrderData = {
            userId: lastCompletedOrder.userId,
            shippingAddress: lastCompletedOrder.shippingAddress._id || lastCompletedOrder.shippingAddress,
            billingAddress: lastCompletedOrder.billingAddress._id || lastCompletedOrder.billingAddress,
            fuelQuantity: lastCompletedOrder.fuelQuantity,
            amount: lastCompletedOrder.amount,
            deliveryMode: lastCompletedOrder.deliveryMode,
            deliveryDate: lastCompletedOrder.deliveryDate,
            orderType: lastCompletedOrder.orderType,
            paymentType: lastCompletedOrder.paymentType,
            asset: lastCompletedOrder.asset?._id || lastCompletedOrder.asset
            // tracking will be auto-generated
        };

        // Create and save the new order
        const newOrder = new Order(newOrderData);
        await newOrder.save();
        await newOrder.populate([
            { path: 'shippingAddress' },
            { path: 'billingAddress' },
            { path: 'asset' },
            {
                path: 'tracking.driverAssignment.driverId',
                populate: { path: 'vehicleDetails' },
                select: 'name mobile vehicleDetails'
            }
        ]);
        res.status(201).json(newOrder);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get all completed orders (regardless of user) or orders with orderConfirmation status as rejected
exports.getAllCompletedOrders = async (req, res) => {
    try {
        const orders = await Order.find({
            $or: [
                { 'tracking.dispatch.status': 'completed' },
                { 'tracking.orderConfirmation.status': 'rejected' }
            ]
        })
        .populate('shippingAddress')
        .populate('billingAddress')
        .populate('asset')
        .populate({ path: 'tracking.driverAssignment.driverId', populate: { path: 'vehicleDetails' }, select: 'name mobile vehicleDetails' });
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Driver updates delivery details (jcno, deliveredLiters, CustomersCash, deliveryImage as file)
exports.updateDriverDeliveryDetails = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ error: 'Order not found' });

        const { jcno, deliveredLiters, CustomersCash } = req.body;
        if (jcno !== undefined) {
            // Enforce JC No uniqueness across Orders and Invoices
            const [existingOrder, existingInvoice] = await Promise.all([
                Order.findOne({ jcno: jcno, _id: { $ne: order._id } }).select('_id'),
                require('../models/Invoice.model.js').findOne({ jcno: jcno }).select('_id')
            ]);
            if (existingOrder || existingInvoice) {
                return res.status(400).json({ error: 'JC No already exists. Please use a unique JC No.' });
            }
            order.jcno = jcno;
        }
        if (deliveredLiters !== undefined) order.deliveredLiters = deliveredLiters;
        if (CustomersCash !== undefined) order.CustomersCash = CustomersCash;
        if (req.file) {
            order.deliveryImage = {
                data: req.file.buffer,
                contentType: req.file.mimetype
            };
        }

        await order.save();

        // ✅ Store CustomersCash for later ledger entry creation (when invoice is confirmed)
        if (CustomersCash !== undefined && CustomersCash > 0 && order.paymentType === 'cash') {
            console.log('💰 Cash payment collected and stored for ledger entry');
            console.log('Order ID:', order._id);
            console.log('User ID:', order.userId);
            console.log('CustomersCash:', CustomersCash);
            console.log('Payment Type:', order.paymentType);
            console.log('Note: CREDIT entry will be created when invoice is confirmed');
        }

        await order.populate([
            { path: 'shippingAddress' },
            { path: 'billingAddress' },
            { path: 'asset' },
            {
                path: 'tracking.driverAssignment.driverId',
                populate: { path: 'vehicleDetails' },
                select: 'name mobile vehicleDetails'
            }
        ]);
        res.json(order);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Admin gets delivery image for an order
exports.getOrderDeliveryImage = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order || !order.deliveryImage || !order.deliveryImage.data) {
            return res.status(404).json({ error: 'Image not found for this order' });
        }
        
        // Set proper headers for image serving
        res.set({
            'Content-Type': order.deliveryImage.contentType,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Cache-Control': 'no-cache'
        });
        
        res.send(order.deliveryImage.data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Count how many orders a user has placed in the last week
exports.getUserOrderCountLastWeek = async (req, res) => {
    try {
        const userId = req.params.userId;
        if (!userId) return res.status(400).json({ error: 'User ID is required' });
        const now = new Date();
        const lastWeek = new Date(now);
        lastWeek.setDate(now.getDate() - 7);
        const count = await Order.countDocuments({
            userId: userId,
            createdAt: { $gte: lastWeek, $lte: now }
        });
        res.json({ userId, count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get the total number of liters ordered by a user across all their orders
exports.getUserTotalLitersOrdered = async (req, res) => {
    try {
        const userId = req.params.userId;
        if (!userId) return res.status(400).json({ error: 'User ID is required' });
        const objectId = new mongoose.Types.ObjectId(userId);
        const result = await Order.aggregate([
            { $match: { userId: objectId } },
            { $group: { _id: null, totalLiters: { $sum: "$fuelQuantity" } } }
        ]);
        const totalLiters = result.length > 0 ? result[0].totalLiters : 0;
        res.json({ userId, totalLiters });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get all current orders (not completed) for admin
exports.getAllCurrentOrders = async (req, res) => {
    try {
        const orders = await Order.find({ 'tracking.dispatch.status': { $ne: 'completed' } })
            .populate('shippingAddress')
            .populate('billingAddress')
            .populate('asset')
            .populate({ path: 'tracking.driverAssignment.driverId', populate: { path: 'vehicleDetails' }, select: 'name mobile vehicleDetails' });
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get all current orders for admin where driver is assigned and dispatch status is not completed
exports.getAllCurrentAssignedOrders = async (req, res) => {
    try {
        const orders = await Order.find({
            'tracking.driverAssignment.driverId': { $ne: null },
            'tracking.dispatch.status': { $ne: 'completed' }
        })
        .populate('shippingAddress')
        .populate('billingAddress')
        .populate('asset')
        .populate({ path: 'tracking.driverAssignment.driverId', populate: { path: 'vehicleDetails' }, select: 'name mobile vehicleDetails' });
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get all orders where orderConfirmation is pending OR driverAssignment.driverId is null
exports.getAllUserAcceptanceOrders = async (req, res) => {
    try {
        const orders = await Order.find({
            $or: [
                { 'tracking.orderConfirmation.status': 'pending' },
                { 'tracking.driverAssignment.driverId': null }
            ]
        })
        .populate('shippingAddress')
        .populate('billingAddress')
        .populate('asset')
        .populate({ path: 'tracking.driverAssignment.driverId', populate: { path: 'vehicleDetails' }, select: 'name mobile vehicleDetails' });
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get all ongoing orders (pending or dispatched) for a specific driver
exports.getAllDriverOngoingOrders = async (req, res) => {
    try {
        const driverId = req.params.driverId;
        if (!driverId) return res.status(400).json({ error: 'Driver ID is required' });
        const orders = await Order.find({
            'tracking.driverAssignment.driverId': driverId,
            'tracking.dispatch.status': { $in: ['pending', 'dispatched'] }
        })
        .populate('shippingAddress')
        .populate('billingAddress')
        .populate('asset')
        .populate({ path: 'tracking.driverAssignment.driverId', populate: { path: 'vehicleDetails' }, select: 'name mobile vehicleDetails' });
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get completed orders for all drivers (for admin)
exports.getCompletedOrdersForAllDrivers = async (req, res) => {
    try {
        const orders = await Order.find({ 'tracking.dispatch.status': 'completed' })
            .populate('shippingAddress')
            .populate('billingAddress')
            .populate('asset')
            .populate({ path: 'tracking.driverAssignment.driverId', populate: { path: 'vehicleDetails' }, select: 'name mobile vehicleDetails' });
        res.json(await ordersWithPricing(orders));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get completed orders from all drivers (admin view)
exports.getAllCompletedOrdersByDrivers = async (req, res) => {
    try {
        const orders = await Order.find({ 'tracking.dispatch.status': 'completed' })
            .populate('shippingAddress')
            .populate('billingAddress')
            .populate('asset')
            .populate({ path: 'tracking.driverAssignment.driverId', populate: { path: 'vehicleDetails' }, select: 'name mobile vehicleDetails' });
        res.json(await ordersWithPricing(orders));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
