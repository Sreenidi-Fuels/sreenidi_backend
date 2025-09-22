const Driver = require('../models/Driver.model.js');
const googleSheetsService = require('../services/googleSheets.service.js');

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
                creditFuelRate: driver.creditFuelRate,
                status: driver.status || 'signed_out'
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
            const admin = await Admin.findOne().sort({ updatedAt: -1 });
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

// Driver Sign-In
exports.driverSignIn = async (req, res) => {
    try {
        const { driverId, driverName, openReading } = req.body;

        // Validate required fields
        if (!driverId || !driverName || !openReading) {
            return res.status(400).json({ 
                error: 'driverId, driverName, and openReading are required' 
            });
        }

        // Check if driver exists and get current status
        const driver = await Driver.findById(driverId);
        if (!driver) {
            return res.status(404).json({
                success: false,
                error: 'Driver not found'
            });
        }

        // Check if driver is already signed in
        if (driver.status === 'signed_in') {
            return res.status(400).json({
                success: false,
                error: 'Driver is already signed in. Please sign out first.',
                currentStatus: driver.status,
                driverName: driver.name
            });
        }

        // Update driver status to 'signed_in' in database
        const updatedDriver = await Driver.findByIdAndUpdate(
            driverId,
            { status: 'signed_in' },
            { new: true, runValidators: true }
        );

        // Log the sign-in data to Google Sheets
        const signInData = await googleSheetsService.logSignIn(driverId, driverName, openReading);

        res.status(200).json({
            success: true,
            message: 'Driver sign-in recorded successfully',
            data: {
                ...signInData,
                status: updatedDriver.status,
                previousStatus: 'signed_out'
            }
        });
    } catch (err) {
        console.error('Error in driver sign-in:', err);
        res.status(500).json({ 
            success: false,
            error: 'Failed to record driver sign-in',
            details: err.message 
        });
    }
};

// Driver Sign-Out
exports.driverSignOut = async (req, res) => {
    try {
        const { driverId, driverName, closeReading, cashAmount } = req.body;

        // Validate required fields
        if (!driverId || !driverName || !closeReading || !cashAmount) {
            return res.status(400).json({ 
                error: 'driverId, driverName, closeReading, and cashAmount are required' 
            });
        }

        // Check if driver exists and get current status
        const driver = await Driver.findById(driverId);
        if (!driver) {
            return res.status(404).json({
                success: false,
                error: 'Driver not found'
            });
        }

        // Check if driver is already signed out
        if (driver.status === 'signed_out') {
            return res.status(400).json({
                success: false,
                error: 'Driver is already signed out. Please sign in first.',
                currentStatus: driver.status,
                driverName: driver.name
            });
        }

        // Update driver status to 'signed_out' in database
        const updatedDriver = await Driver.findByIdAndUpdate(
            driverId,
            { status: 'signed_out' },
            { new: true, runValidators: true }
        );

        // Log the sign-out data to Google Sheets
        const signOutData = await googleSheetsService.logSignOut(driverId, driverName, closeReading, cashAmount);

        res.status(200).json({
            success: true,
            message: 'Driver sign-out recorded successfully',
            data: {
                ...signOutData,
                status: updatedDriver.status,
                previousStatus: 'signed_in'
            }
        });
    } catch (err) {
        console.error('Error in driver sign-out:', err);
        res.status(500).json({ 
            success: false,
            error: 'Failed to record driver sign-out',
            details: err.message 
        });
    }
};

// Get Driver Status
exports.getDriverStatus = async (req, res) => {
    try {
        const { driverId } = req.params;

        // Find driver by ID
        const driver = await Driver.findById(driverId);

        if (!driver) {
            return res.status(404).json({ 
                success: false,
                error: 'Driver not found' 
            });
        }

        res.status(200).json({
            success: true,
            data: {
                driverId: driver._id,
                driverName: driver.name,
                status: driver.status,
                lastUpdated: driver.updatedAt
            }
        });
    } catch (err) {
        console.error('Error getting driver status:', err);
        res.status(500).json({ 
            success: false,
            error: 'Failed to get driver status',
            details: err.message 
        });
    }
};