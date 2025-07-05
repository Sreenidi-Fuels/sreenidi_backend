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

// Get all users with role 'credited'
exports.getAllCreditedUsers = async (req, res) => {
    try {
        const users = await User.find({ role: 'credited' }).populate(['address', 'assets']);
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get a single user by ID
exports.getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).populate(['address', 'assets']);
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
