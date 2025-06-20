const Order = require('../models/Order.model.js');

// Create a new order
exports.createOrder = async (req, res) => {
    try {
        const order = new Order(req.body);
        await order.save();
        res.status(201).json(order);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Get all orders
exports.getOrders = async (req, res) => {
    try {
        const orders = await Order.find();
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get a single order by ID
exports.getOrderById = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ error: 'Order not found' });
        res.json(order);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Update an order by ID
exports.updateOrder = async (req, res) => {
    try {
        const order = await Order.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!order) return res.status(404).json({ error: 'Order not found' });
        res.json(order);
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

        if (order.tracking.fuelDispense.startDispenseOtp === Number(otp)) {
            order.tracking.fuelDispense.startVerified = true;
            await order.save();
            return res.json({ success: true, message: 'OTP verified successfully' });
        } else {
            return res.status(400).json({ success: false, error: 'Invalid OTP' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
