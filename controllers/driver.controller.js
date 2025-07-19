const Driver = require('../models/Driver.model.js');

// Create a new driver
exports.createDriver = async (req, res) => {
    try {
        const driver = new Driver(req.body);
        await driver.save();
        await driver.populate('vehicleDetails');
        res.status(201).json(driver);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Get all drivers
exports.getDrivers = async (req, res) => {
    try {
        const drivers = await Driver.find().populate('vehicleDetails');
        res.json(drivers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get a single driver by ID
exports.getDriverById = async (req, res) => {
    try {
        const driver = await Driver.findById(req.params.id).populate('vehicleDetails');
        if (!driver) return res.status(404).json({ error: 'Driver not found' });
        res.json(driver);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Update a driver by ID
exports.updateDriver = async (req, res) => {
    try {
        const driver = await Driver.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).populate('vehicleDetails');
        if (!driver) return res.status(404).json({ error: 'Driver not found' });
        res.json(driver);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Delete a driver by ID
exports.deleteDriver = async (req, res) => {
    try {
        const driver = await Driver.findByIdAndDelete(req.params.id).populate('vehicleDetails');
        if (!driver) return res.status(404).json({ error: 'Driver not found' });
        res.json({ message: 'Driver deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};