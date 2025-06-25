const Order = require('../models/Order.model.js');

// Create a new normal order
exports.createOrder = async (req, res) => {
    try {
        const order = new Order(req.body);
        await order.save();
        await order.populate([
            { path: 'shippingAddress' },
            { path: 'billingAddress' },
            { path: 'asset' }
        ]);
        res.status(201).json(order);
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
        // Correct way to populate multiple fields after save
        await order.populate([
            { path: 'shippingAddress' },
            { path: 'billingAddress' },
            { path: 'asset' }
        ]);
        res.status(201).json(order);
    } catch (err) {
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
        await order.populate([
            { path: 'shippingAddress' },
            { path: 'billingAddress' },
            { path: 'asset' }
        ]);
        res.status(201).json(order);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Get all orders
exports.getOrders = async (req, res) => {
    try {
        const orders = await Order.find()
            .populate('shippingAddress')
            .populate('billingAddress')
            .populate('asset');
        res.json(orders);
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
            .populate('asset');
        if (!order) return res.status(404).json({ error: 'Order not found' });
        res.json(order);
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
            .populate('asset');
        res.json(orders);
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
            .populate('asset');
        if (!lastOrder) return res.status(404).json({ error: 'No orders found for this user' });
        res.json(lastOrder);
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
            .populate('asset');
        res.json(orders);
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
            .populate('asset');
        res.json(orders);
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
            .populate('asset');
        res.json(orders);
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
        const updatedOrder = await Order.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
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
        res.json({ message: 'Order deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Accept an order (admin action)
exports.acceptOrder = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ error: 'Order not found' });

        // Update order confirmation status to 'accepted'
        order.tracking.orderConfirmation.status = 'accepted';
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
            return res.json({ success: true, message: 'OTP verified successfully' });
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
            return res.json({ success: true, message: 'OTP verified succesfully' });
        }else{
            return res.json(400).json({ success: false, error: 'Invalid OTP' });
        }
    }catch( err ){
        res.status(500).json({ error: err.message });
    }
};

// Repeat a completed order for a user by userId and orderId
exports.repeatCompletedOrder = async (req, res) => {
    try {
        const { userId, orderId } = req.params;
        // Find the completed order for this user
        const prevOrder = await Order.findOne({
            _id: orderId,
            userId: userId,
            'tracking.dispatch.status': 'completed'
        });
        if (!prevOrder) return res.status(404).json({ error: 'Completed order not found for this user' });

        // Prepare new order data (copy fields except _id, timestamps, and tracking)
        const newOrderData = {
            userId: prevOrder.userId,
            shippingAddress: prevOrder.shippingAddress,
            billingAddress: prevOrder.billingAddress,
            fuelQuantity: prevOrder.fuelQuantity,
            amount: prevOrder.amount,
            deliveryMode: prevOrder.deliveryMode,
            deliveryDate: prevOrder.deliveryDate,
            orderType: prevOrder.orderType,
            paymentType: prevOrder.paymentType,
            asset: prevOrder.asset
            // tracking will be auto-generated
        };

        // Create and save the new order
        const newOrder = new Order(newOrderData);
        await newOrder.save();
        await newOrder.populate([
            { path: 'shippingAddress' },
            { path: 'billingAddress' },
            { path: 'asset' }
        ]);
        res.status(201).json(newOrder);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
