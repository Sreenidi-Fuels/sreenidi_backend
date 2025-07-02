const Asset = require('../models/Asset.model');

// Update asset by ID
exports.updateAssetById = async (req, res) => {
  try {
    const { id } = req.params;
    const update = req.body;
    const asset = await Asset.findByIdAndUpdate(id, update, { new: true });
    if (!asset) return res.status(404).json({ message: 'Asset not found' });
    res.json(asset);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Delete asset by ID
exports.deleteAssetById = async (req, res) => {
  try {
    const { id } = req.params;
    const asset = await Asset.findByIdAndDelete(id);
    if (!asset) return res.status(404).json({ message: 'Asset not found' });
    res.json({ message: 'Asset deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
