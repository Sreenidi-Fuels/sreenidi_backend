const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller.js');
const upload = require('../middleware/upload');

// Create a new order
router.post('/', orderController.createOrder);

// Create a direct credit order
router.post('/direct/credit', orderController.createDirectCreditOrder);

// Create a direct cash order
router.post('/direct/cash', orderController.createDirectCashOrder);

// Get all completed orders (regardless of user)
router.get('/completed', orderController.getAllCompletedOrders);

// Get all orders for a specific user by userId
router.get('/user/:userId', orderController.getOrdersByUserId);

// Get all ongoing orders for a specific user by userId
router.get('/user/:userId/ongoing', orderController.getOngoingOrdersByUserId);

// Get completed orders for a specific user by userId
router.get('/user/:userId/completed', orderController.getCompletedOrdersByUserId);

// Get the last order for a specific user by userId
router.get('/user/:userId/last', orderController.getLastOrderByUserId);

// Repeat a completed order for a user by userId and orderId
router.post('/user/:userId/repeat/:orderId', orderController.repeatCompletedOrder);

// Get all orders for a specific driver by driverId
router.get('/driver/:driverId', orderController.getOrdersByDriverId);

// Get completed orders for a specific driver by driverId
router.get('/driver/:driverId/completed', orderController.getCompletedOrdersByDriverId);

// Get all orders
router.get('/', orderController.getOrders);

// Get a single order by ID (keep this after all specific GET routes)
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

// Driver updates delivery details (jcno, deliveredLiters, deliveryImage as file)
router.patch('/:id/driver-delivery', upload.single('deliveryImage'), orderController.updateDriverDeliveryDetails);

// Admin gets delivery image for an order
router.get('/:id/delivery-image', orderController.getOrderDeliveryImage);

// Count how many orders a user has placed in the last week
router.get('/user/:userId/count/last-week', orderController.getUserOrderCountLastWeek);

// Get the total number of liters ordered by a user
router.get('/user/:userId/total-liters', orderController.getUserTotalLitersOrdered);

module.exports = router;