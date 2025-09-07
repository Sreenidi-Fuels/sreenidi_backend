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

// Admin: Set driver role (normal/credited) and credit rate
exports.setDriverRoleAndCredit = async (req, res) => {
    try {
        const { id } = req.params;
        const { role, creditFuelRate } = req.body;

        if (!role || !['normal', 'credited'].includes(role)) {
            return res.status(400).json({ error: 'Role must be either normal or credited' });
        }

        // Fetch latest admin to read global daily rate
        const Admin = require('../models/Admin.model');
        const admin = await Admin.findOne().sort({ createdAt: -1 });
        if (!admin) {
            return res.status(404).json({ error: 'Admin data not found' });
        }

        const update = { role };

        if (role === 'credited') {
            // For credited drivers, their creditFuelRate becomes their daily rate
            if (typeof creditFuelRate !== 'number' || Number.isNaN(creditFuelRate)) {
                return res.status(400).json({ error: 'creditFuelRate must be provided as a number for credited role' });
            }
            update.creditFuelRate = Number(creditFuelRate);
        } else {
            // For normal drivers, set creditFuelRate equal to global daily rate
            update.creditFuelRate = Number(admin.dailyRate);
        }

        const driver = await Driver.findByIdAndUpdate(id, update, { new: true, runValidators: true }).populate('vehicleDetails');
        if (!driver) return res.status(404).json({ error: 'Driver not found' });

        res.json({
            message: 'Driver role and credit details updated successfully',
            driver
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Get daily rate for a driver (derived)
exports.getDriverDailyRate = async (req, res) => {
    try {
        const driver = await Driver.findById(req.params.id).populate('vehicleDetails');
        if (!driver) return res.status(404).json({ error: 'Driver not found' });

        let dailyRate;
        if (driver.role === 'credited') {
            dailyRate = Number(driver.creditFuelRate || 0);
        } else {
            const Admin = require('../models/Admin.model');
            const admin = await Admin.findOne().sort({ createdAt: -1 });
            if (!admin) return res.status(404).json({ error: 'Admin data not found' });
            dailyRate = Number(admin.dailyRate || 0);
        }

        res.json({ driverId: driver._id, role: driver.role, dailyRate });
    } catch (err) {
        res.status(500).json({ error: err.message });
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