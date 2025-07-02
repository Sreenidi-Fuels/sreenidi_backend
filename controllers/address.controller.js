const Address = require('../models/Address.model');

// Update address by ID
exports.updateAddressById = async (req, res) => {
  try {
    const { id } = req.params;
    const update = req.body;
    const address = await Address.findByIdAndUpdate(id, update, { new: true });
    if (!address) return res.status(404).json({ message: 'Address not found' });
    res.json(address);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Delete address by ID
exports.deleteAddressById = async (req, res) => {
  try {
    const { id } = req.params;
    const address = await Address.findByIdAndDelete(id);
    if (!address) return res.status(404).json({ message: 'Address not found' });
    res.json({ message: 'Address deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
