const express = require('express');
const router = express.Router();
const driverController = require('../controllers/driver.controller.js');

// Driver Login
router.post('/login', driverController.loginDriver);

// Create a new driver
router.post('/', driverController.createDriver);

// Get all drivers
router.get('/', driverController.getDrivers);


// Admin: Get driver credentials (including password)
router.get('/:id/credentials', driverController.getDriverCredentials);

// Admin: Set/Reset driver password
router.patch('/:id/password', driverController.setDriverPassword);

// Admin: Set driver role (normal/credited) and credit rate
router.patch('/:id/role', driverController.setDriverRoleAndCredit);

// Get daily rate for a driver
router.get('/:id/dailyRate', driverController.getDriverDailyRate);

// Update a driver by ID
router.patch('/:id', driverController.updateDriver);

// Get a single driver by ID
router.get('/:id', driverController.getDriverById);

// Delete a driver by ID
router.delete('/:id', driverController.deleteDriver);

// Driver Sign-In
router.post('/signin', driverController.driverSignIn);

// Driver Sign-Out
router.post('/signout', driverController.driverSignOut);

// Get Driver Status
router.get('/:driverId/status', driverController.getDriverStatus);

module.exports = router;