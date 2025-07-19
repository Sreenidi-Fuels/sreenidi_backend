const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: { type: String },
    email: { type: String, unique: true },
    phoneNumber: { type: String, required: true, unique: true },
    companyName: { type: String },
    gstNumber: { type: String },
    address: [{ type: mongoose.Schema.Types.ObjectId, ref: "Address" }],
    role: { type: String, enum: ['normal', 'credited'], default: 'normal' },
    creditFuelRate: { type: Number, default: 0.0 },
    creditAvailable: {
        type: Number,
        required: function() { return this.role === 'credited'; },
        default: function() { return this.role === 'credited' ? 0 : undefined; }
    },
    assets: [{ type: mongoose.Schema.Types.ObjectId, ref: "Asset" }],
    feedback: [
        {
            name: { type: String, required: true },
            issueType: { type: String, enum: ['bug', 'feature', 'other'], required: true, default: 'Issue type' },
            message: { type: String, required: true }
        }
    ]
}, { timestamps: true });



module.exports = mongoose.model('User', UserSchema);