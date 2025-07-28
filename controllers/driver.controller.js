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

// Driver Login
exports.loginDriver = async (req, res) => {
    try {
        const { mobile, password } = req.body;

        // Check if mobile and password are provided
        if (!mobile || !password) {
            return res.status(400).json({ error: 'Mobile number and password are required' });
        }

        // Find driver by mobile number
        const driver = await Driver.findOne({ mobile }).populate('vehicleDetails');
        
        // Check if driver exists
        if (!driver) {
            return res.status(404).json({ error: 'Driver not found' });
        }

        // Check if password matches
        if (driver.password !== password) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Login successful
        res.status(200).json({ 
            message: 'Login successful',
            driver: {
                id: driver._id,
                name: driver.name,
                mobile: driver.mobile,
                vehicleDetails: driver.vehicleDetails,
                creditFuelRate: driver.creditFuelRate
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Admin: Set/Reset driver password
exports.setDriverPassword = async (req, res) => {
    try {
        const { id } = req.params;
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({ error: 'Password is required' });
        }

        const driver = await Driver.findByIdAndUpdate(
            id, 
            { password }, 
            { new: true, runValidators: true }
        ).populate('vehicleDetails');

        if (!driver) {
            return res.status(404).json({ error: 'Driver not found' });
        }

        res.json({ 
            message: 'Password updated successfully',
            driver: {
                id: driver._id,
                name: driver.name,
                mobile: driver.mobile,
                vehicleDetails: driver.vehicleDetails
            }
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Admin: View driver credentials
exports.getDriverCredentials = async (req, res) => {
    try {
        const { id } = req.params;
        
        const driver = await Driver.findById(id).populate('vehicleDetails');
        
        if (!driver) {
            return res.status(404).json({ error: 'Driver not found' });
        }

        res.json({
            id: driver._id,
            name: driver.name,
            mobile: driver.mobile,
            password: driver.password, // Admin can see password
            vehicleDetails: driver.vehicleDetails,
            creditFuelRate: driver.creditFuelRate
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
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