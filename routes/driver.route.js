const express = require('express');
const router = express.Router();
const driverController = require('../controllers/driver.controller.js');

// Create a new driver
router.post('/', driverController.createDriver);

// Get all drivers
router.get('/', driverController.getDrivers);

// Get a single driver by ID
router.get('/:id', driverController.getDriverById);

// Update a driver by ID
router.patch('/:id', driverController.updateDriver);

// Delete a driver by ID
router.delete('/:id', driverController.deleteDriver);

module.exports = router;