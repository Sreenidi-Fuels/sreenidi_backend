const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller.js');

// Create a new order
router.post('/', orderController.createOrder);

// Create a direct credit order
router.post('/direct/credit', orderController.createDirectCreditOrder);

// Create a direct cash order
router.post('/direct/cash', orderController.createDirectCashOrder);

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

// validate stopDispenseOtp
router.patch('/:id/validate-stop-otp', orderController.validateStopDispenseOtp);

// Get all orders for a specific user by userId
router.get('/user/:userId', orderController.getOrdersByUserId);

// Get all orders for a specific driver by driverId
router.get('/driver/:driverId', orderController.getOrdersByDriverId);

// Get completed orders for a specific user by userId
router.get('/user/:userId/completed', orderController.getCompletedOrdersByUserId);

// Get completed orders for a specific driver by driverId
router.get('/driver/:driverId/completed', orderController.getCompletedOrdersByDriverId);

module.exports = router;