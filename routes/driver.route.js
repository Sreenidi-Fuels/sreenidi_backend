const express = require('express');
const router = express.Router();
const driverController = require('../controllers/driver.controller.js');

// Driver Login
router.post('/login', driverController.loginDriver);

// Create a new driver
router.post('/', driverController.createDriver);

// Get all drivers
router.get('/', driverController.getDrivers);

// Get a single driver by ID
router.get('/:id', driverController.getDriverById);

// Admin: Get driver credentials (including password)
router.get('/:id/credentials', driverController.getDriverCredentials);

// Admin: Set/Reset driver password
router.patch('/:id/password', driverController.setDriverPassword);

// Update a driver by ID
router.patch('/:id', driverController.updateDriver);

// Delete a driver by ID
router.delete('/:id', driverController.deleteDriver);

module.exports = router;