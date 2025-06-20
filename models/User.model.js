const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phoneNumber: { type: String },
    companyName: { type: String },
    gstNumber: { type: String },
    address: [{ type: mongoose.Schema.Types.ObjectId, ref: "Address" }],
    role: { type: String, enum: ['normal', 'credited'], default: 'normal' },
    creditAvailable: {
        type: Number,
        required: function() { return this.role === 'credited'; },
        default: function() { return this.role === 'credited' ? 0 : undefined; }
    },
    assets: [
        {
            name: { type: String, required: true },
            type: { type: String, required: true },
            industry: { type: String, required: true }
        }
    ],
    feedback: [
        {
            name: { type: String, required: true },
            issueType: { type: String, enum: ['bug', 'feature', 'other'], required: true, default: 'Issue type' },
            message: { type: String, required: true }
        }
    ]
}, { timestamps: true });



module.exports = mongoose.model('User', UserSchema);