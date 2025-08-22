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

// Create a new normal order
exports.createOrder = async (req, res) => {
    try {
        const order = new Order(req.body);
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
            deliveryMode: 'earliest', // Direct orders are always immediate
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
        const orderData = {
            ...req.body,
            orderType: 'direct',
            paymentType: 'credit',
            deliveryMode: 'earliest', // Direct orders are always immediate
            asset: req.body.assetId
        };
        const order = new Order(orderData);
        await order.save();
        await order.populate(populateOptions);
        
        // ✅ Create DEBIT entry for direct credit orders
        try {
            console.log('=== Creating DEBIT Entry for Direct Credit Order ===');
            console.log('Order ID:', order._id);
            console.log('User ID:', order.userId);
            console.log('Amount:', order.amount);
            console.log('Payment Type:', order.paymentType);
            console.log('Fuel Quantity:', order.fuelQuantity);

            await LedgerService.createDebitEntry(
                order.userId, 
                order._id, 
                order.amount,
                `Direct credit order - ${order.fuelQuantity}L fuel`
            );

            console.log('✅ DEBIT entry created successfully for direct credit order');
        } catch (ledgerError) {
            console.error('❌ DEBIT entry creation failed for direct credit order:', ledgerError);
            console.error('Error details:', {
                message: ledgerError.message,
                stack: ledgerError.stack,
                userId: order.userId,
                orderId: order._id,
                amount: order.amount
            });
            // Don't fail the order creation if ledger fails
        }
        
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
            
            // Generate invoice when order is completed
            try {
                const { generateInvoiceForCompletedOrder } = require('./invoice.controller.js');
                
                // Get vehicle ID from the driver's vehicle details
                let vehicleId = null;
                if (order.tracking.driverAssignment.driverId) {
                    const Driver = require('../models/Driver.model.js');
                    const driver = await Driver.findById(order.tracking.driverAssignment.driverId)
                        .populate('vehicleDetails');
                    
                    if (driver && driver.vehicleDetails) {
                        vehicleId = driver.vehicleDetails._id;
                    }
                }
                
                if (vehicleId) {
                    const invoiceResult = await generateInvoiceForCompletedOrder(order._id, vehicleId);
                    if (invoiceResult.success) {
                        console.log('Invoice generated successfully:', invoiceResult.invoiceId);
                    } else {
                        console.log('Failed to generate invoice:', invoiceResult.error);
                    }
                } else {
                    console.log('No vehicle found for driver, skipping invoice generation');
                }
            } catch (invoiceError) {
                console.error('Error generating invoice:', invoiceError);
                // Don't fail the order completion if invoice generation fails
            }
            
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

// Driver updates delivery details (jcno, deliveredLiters, deliveryImage as file)
exports.updateDriverDeliveryDetails = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ error: 'Order not found' });

        const { jcno, deliveredLiters } = req.body;
        if (jcno !== undefined) order.jcno = jcno;
        if (deliveredLiters !== undefined) order.deliveredLiters = deliveredLiters;
        if (req.file) {
            order.deliveryImage = {
                data: req.file.buffer,
                contentType: req.file.mimetype
            };
        }

        await order.save();
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
        res.set('Content-Type', order.deliveryImage.contentType);
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
