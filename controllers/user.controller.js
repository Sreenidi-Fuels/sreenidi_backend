const AddressModel = require('../models/Address.model.js');
const User = require('../models/User.model.js');
const Asset = require('../models/Asset.model.js');

// Create a new user
exports.createUser = async (req, res) => {
    try {
        let addressObj = req.body.address;
        // Remove address from req.body for initial user creation
        delete req.body.address;

        // Ensure address field is not set to null or [null] in req.body
        if (req.body.address === null || (Array.isArray(req.body.address) && req.body.address.length === 1 && req.body.address[0] === null)) {
            delete req.body.address;
        }
        
        // Create user first (without address)
        const user = new User(req.body);
        await user.save();

        // If address is provided, create address and link to user
        if (addressObj && typeof addressObj === 'object') {
            addressObj.userId = user._id;
            const newAddress = await AddressModel.create(addressObj);
            user.address.push(newAddress._id);
            // Remove any nulls from the address array
            user.address = user.address.filter(a => a !== null);
            await user.save();
        } else {
            // Ensure address array is empty if no address is provided
            user.address = [];
            await user.save();
        }

        // Populate address and assets fields for response
        await user.populate(['address', 'assets']);
        res.status(201).json(user);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Get all users
exports.getUsers = async (req, res) => {
    try {
        const users = await User.find().populate(['address', 'assets']);
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Helper function to calculate credit limit usage with automatic credit release
async function calculateCreditLimitUsage(userId) {
    try {
        const Order = require('../models/Order.model.js');
        const Invoice = require('../models/Invoice.model.js');
        const UserLedger = require('../models/UserLedger.model.js');
        
        // Get all ACTIVE credit orders for this user (pending, dispatched, completed)
        const creditOrders = await Order.find({
            userId: userId,
            paymentType: 'credit',
            'tracking.dispatch.status': { $in: ['pending', 'dispatched', 'completed'] }
        }).select('_id amount');
        
        // Get user ledger to know total payments made
        const userLedger = await UserLedger.findOne({ userId });
        const totalPaid = userLedger ? userLedger.totalPaid : 0;
        
        let creditLimitUsed = 0;
        
        // Check each order to see if it should still count toward credit limit
        for (const order of creditOrders) {
            // Check if this order has a finalised invoice
            const invoice = await Invoice.findOne({ 
                orderId: order._id, 
                status: 'finalised' 
            });
            
            if (invoice) {
                // Order has finalised invoice - check if it's been paid
                const orderAmount = Number(order.amount) || 0;
                
                // Calculate how much of this order has been paid
                // We need to check if the total payments cover this order
                if (totalPaid >= orderAmount) {
                    // This order is fully paid, don't count it toward credit limit
                    console.log(`✅ Order ${order._id} (₹${orderAmount}) is fully paid - not counting toward credit limit`);
                } else {
                    // This order is partially paid, count remaining amount
                    const remainingAmount = orderAmount - totalPaid;
                    creditLimitUsed += remainingAmount;
                    console.log(`⚠️ Order ${order._id} (₹${orderAmount}) is partially paid - counting ₹${remainingAmount} toward credit limit`);
                }
            } else {
                // Order doesn't have finalised invoice yet - count it toward credit limit
                creditLimitUsed += (Number(order.amount) || 0);
                console.log(`💳 Order ${order._id} (₹${order.amount}) has no finalised invoice - counting toward credit limit`);
            }
        }
        
        console.log(`Credit limit usage for user ${userId}:`, {
            totalOrders: creditOrders.length,
            totalPaid: totalPaid,
            creditLimitUsed: creditLimitUsed
        });
        
        return creditLimitUsed;
    } catch (error) {
        console.error('Error calculating credit limit usage:', error);
        return 0;
    }
}

// Get all users with role 'credited'
exports.getAllCreditedUsers = async (req, res) => {
    try {
        const users = await User.find({ role: 'credited' }).populate(['address', 'assets']);
        
        // Add fresh credit data for all credited users
        try {
            const UserLedger = require('../models/UserLedger.model.js');
            
            const usersWithCreditData = await Promise.all(users.map(async (user) => {
                const userLedger = await UserLedger.findOne({ userId: user._id });
                const userData = user.toObject();
                
                if (userLedger) {
                    // Add fresh credit data
                    userData.outstandingAmount = userLedger.outstandingAmount;
                    userData.totalPaid = userLedger.totalPaid;
                    userData.totalOrders = userLedger.totalOrders;
                    
                    // ✅ FIXED: Calculate credit available based on credit limit usage, not outstanding amount
                    if (user.creditLimit && user.creditLimit > 0) {
                        const creditLimitUsed = await calculateCreditLimitUsage(user._id);
                        userData.creditLimitUsed = creditLimitUsed;
                        userData.amountOfCreditAvailable = Math.max(0, user.creditLimit - creditLimitUsed);
                    } else {
                        userData.creditLimitUsed = 0;
                        userData.amountOfCreditAvailable = 0;
                    }
                    
                    userData.lastTransactionDate = userLedger.lastTransactionDate;
                } else {
                    // No ledger found, set defaults
                    userData.outstandingAmount = 0;
                    userData.totalPaid = 0;
                    userData.totalOrders = 0;
                    
                    // ✅ FIXED: Credit available equals credit limit when no orders used
                    if (user.creditLimit && user.creditLimit > 0) {
                        userData.creditLimitUsed = 0;
                        userData.amountOfCreditAvailable = user.creditLimit;
                    } else {
                        userData.creditLimitUsed = 0;
                        userData.amountOfCreditAvailable = 0;
                    }
                    
                    userData.lastTransactionDate = null;
                }
                
                return userData;
            }));
            
            res.json(usersWithCreditData);
        } catch (ledgerError) {
            console.error('Error fetching user ledgers:', ledgerError);
            // Fallback to basic user data if ledger fetch fails
            res.json(users);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get a single user by ID
exports.getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).populate(['address', 'assets']);
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        // For credited users, add fresh credit data from UserLedger
        if (user.role === 'credited') {
            try {
                const UserLedger = require('../models/UserLedger.model.js');
                const userLedger = await UserLedger.findOne({ userId: req.params.id });
                
                const userData = user.toObject();
                
                if (userLedger) {
                    // Add fresh credit data
                    userData.outstandingAmount = userLedger.outstandingAmount;
                    userData.totalPaid = userLedger.totalPaid;
                    userData.totalOrders = userLedger.totalOrders;
                    
                    // ✅ FIXED: Calculate credit available based on credit limit usage, not outstanding amount
                    if (user.creditLimit && user.creditLimit > 0) {
                        const creditLimitUsed = await calculateCreditLimitUsage(req.params.id);
                        userData.creditLimitUsed = creditLimitUsed;
                        userData.amountOfCreditAvailable = Math.max(0, user.creditLimit - creditLimitUsed);
                    } else {
                        userData.creditLimitUsed = 0;
                        userData.amountOfCreditAvailable = 0;
                    }
                    
                    userData.lastTransactionDate = userLedger.lastTransactionDate;
                } else {
                    // No ledger found, set defaults
                    userData.outstandingAmount = 0;
                    userData.totalPaid = 0;
                    userData.totalOrders = 0;
                    
                    // ✅ FIXED: Credit available equals credit limit when no orders used
                    if (user.creditLimit && user.creditLimit > 0) {
                        userData.creditLimitUsed = 0;
                        userData.amountOfCreditAvailable = user.creditLimit;
                    } else {
                        userData.creditLimitUsed = 0;
                        userData.amountOfCreditAvailable = 0;
                    }
                    
                    userData.lastTransactionDate = null;
                }
                
                res.json(userData);
            } catch (ledgerError) {
                console.error('Error fetching user ledger:', ledgerError);
                // Fallback to basic user data if ledger fetch fails
                res.json(user);
            }
        } else {
            res.json(user);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get a single user by phone number
exports.getUserByPhoneNumber = async (req, res) => {
    try {
        const phoneNumber = "+91"+req.params.phoneNumber;
        if (!phoneNumber) return res.status(400).json({ error: 'Phone number is required' });

        const user = await User.findOne({ phoneNumber: phoneNumber }).populate(['address', 'assets']);
        if (!user) return res.status(404).json({ error: 'User not found' });

        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Update a user by ID
exports.updateUser = async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!user) return res.status(404).json({ error: 'User not found' });
        await user.save();
        res.json(user);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Delete a user by ID
exports.deleteUser = async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


// Add assets to a user
exports.addAssetsToUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { assets } = req.body;

        if (!Array.isArray(assets) || assets.length === 0) {
            return res.status(400).json({ error: 'Assets must be a non-empty array' });
        }

        // Create assets in Asset collection
        const createdAssets = await Asset.insertMany(assets);
        const assetIds = createdAssets.map(asset => asset._id);

        // Push asset ObjectIds to user's assets array
        const user = await User.findByIdAndUpdate(
            id,
            { $push: { assets: { $each: assetIds } } },
            { new: true, runValidators: true }
        );  

        if (!user) return res.status(404).json({ error: 'User not found' });

        // Populate address and assets fields for response
        await user.populate(['address', 'assets']);
        res.json(user);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Add additional addresses to a user
exports.addAddressToUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { address } = req.body;

        if (!address || typeof address !== 'object') {
            return res.status(400).json({ error: 'Address must be a valid object' });
        }

        const newAddress = await AddressModel.create(address);

        const user = await User.findByIdAndUpdate(
            id,
            { $push: { address: newAddress._id } },
            { new: true, runValidators: true }
        );

        if (!user) return res.status(404).json({ error: 'User not found' });

        // Populate address and assets fields for response
        await user.populate(['address', 'assets']);
        res.json(user);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Get addresses of a user by ID
exports.getUserAddresses = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).populate('address');
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user.address);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get assets of a user by ID
exports.getUserAssets = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).populate('assets');
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user.assets);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get a single address of a user by userId and addressId
exports.getUserAddressById = async (req, res) => {
    try {
        const { userId, addressId } = req.params;
        // Check if the address belongs to the user
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (!user.address.includes(addressId)) return res.status(404).json({ error: 'Address not found for this user' });
        const address = await AddressModel.findById(addressId);
        if (!address) return res.status(404).json({ error: 'Address not found' });
        res.json(address);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get a single asset of a user by userId and assetId
exports.getUserAssetById = async (req, res) => {
    try {
        const { userId, assetId } = req.params;
        // Check if the asset belongs to the user
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (!user.assets.includes(assetId)) return res.status(404).json({ error: 'Asset not found for this user' });
        const asset = await Asset.findById(assetId);
        if (!asset) return res.status(404).json({ error: 'Asset not found' });
        res.json(asset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get daily rate for a user
exports.getUserDailyRate = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        let dailyRate;
        if (user.role === 'credited') {
            dailyRate = user.creditFuelRate;
        } else {
            // Get the latest admin (or you can use a specific admin if needed)
            const admin = await require('../models/Admin.model').findOne().sort({ createdAt: -1 });
            if (!admin) return res.status(404).json({ error: 'Admin data not found' });
            dailyRate = admin.dailyRate;
        }
        res.json({ userId: user._id, role: user.role, dailyRate });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
