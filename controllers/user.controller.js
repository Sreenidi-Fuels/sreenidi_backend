const AddressModel = require('../models/Address.model.js');
const User = require('../models/User.model.js');

// Create a new user
exports.createUser = async (req, res) => {
    try {
        const user = new User(req.body);
        await user.save();
        res.status(201).json(user);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Get all users
exports.getUsers = async (req, res) => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get a single user by ID
exports.getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
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

        const user = await User.findByIdAndUpdate(
            id,
            { $push: { assets: { $each: assets } } },
            { new: true, runValidators: true }
        );  

        if (!user) return res.status(404).json({ error: 'User not found' });
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
        res.json(user);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Get addresses of a user by ID
exports.getUserAddresses = async (req, res) => {
    try {
        const user = await User.findById(req.params.id, 'address');
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user.address);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get assets of a user by ID
exports.getUserAssets = async (req, res) => {
    try {
        const user = await User.findById(req.params.id, 'assets');
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user.assets);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
