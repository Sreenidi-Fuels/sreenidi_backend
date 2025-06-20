const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller.js');

// Create a new order
router.post('/', orderController.createOrder);

// Get all orders
router.get('/', orderController.getOrders);

// Get a single order by ID
router.get('/:id', orderController.getOrderById);

// Update an order by ID
router.put('/:id', orderController.updateOrder);

// Delete an order by ID
router.delete('/:id', orderController.deleteOrder);

// Accept an order (admin action)
router.patch('/:id/accept', orderController.acceptOrder);

// assign a driver to the order
router.patch('/:id/assign-driver', orderController.assignDriver);

// update dispatch status
router.patch('/:id/dispatch', orderController.updateDispatchStatus);

// validate startDispenseOtp
router.patch('/:id/validate-start-otp', orderController.validateStartDispenseOtp);

module.exports = router;