const Admin = require('../models/Admin.model');

// Get current daily rate (public endpoint)
const getDailyRate = async (req, res) => {
    try {
        // Get the most recently updated admin to get the latest dailyRate
        const admin = await Admin.findOne().sort({ updatedAt: -1 });
        if (!admin) {
            return res.status(404).json({ 
                success: false,
                error: 'Daily rate not found' 
            });
        }
        
        res.json({ 
            success: true,
            dailyRate: admin.dailyRate,
            lastUpdated: admin.updatedAt
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: 'Error fetching daily rate', 
            details: error.message 
        });
    }
};

// Update daily rate (public endpoint)
const updateDailyRate = async (req, res) => {
    try {
        const { dailyRate } = req.body;
        
        if (!dailyRate || isNaN(dailyRate) || dailyRate <= 0) {
            return res.status(400).json({ 
                success: false,
                error: 'Valid daily rate is required' 
            });
        }

        // Get the most recently updated admin
        const admin = await Admin.findOne().sort({ updatedAt: -1 });
        if (!admin) {
            return res.status(404).json({ 
                success: false,
                error: 'Admin configuration not found' 
            });
        }

        // Update the daily rate
        admin.dailyRate = parseFloat(dailyRate);
        await admin.save();

        // Propagate to all normal users and drivers
        try {
            const User = require('../models/User.model.js');
            const Driver = require('../models/Driver.model.js');
            
            // Update all users with role 'normal' to use the new dailyRate
            await User.updateMany(
                { role: 'normal' },
                { $unset: { creditFuelRate: 1 } } // Remove creditFuelRate for normal users
            );
            
            // Update all drivers to use the new dailyRate
            await Driver.updateMany(
                {},
                { $unset: { creditFuelRate: 1 } } // Remove creditFuelRate for drivers
            );
            
            console.log(`✅ Daily rate updated to ${dailyRate} for all normal users and drivers`);
        } catch (propagationError) {
            console.error('Error propagating daily rate:', propagationError);
            // Don't fail the update if propagation fails
        }

        res.json({
            success: true,
            message: 'Daily rate updated successfully',
            dailyRate: admin.dailyRate,
            updatedAt: admin.updatedAt
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: 'Error updating daily rate', 
            details: error.message 
        });
    }
};

module.exports = {
    getDailyRate,
    updateDailyRate
};