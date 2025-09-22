const mongoose = require('mongoose')


const DriverSchema = mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    mobile: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        // required: true
    },
    vehicleDetails: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Vehicle",
        required: false
    },
    role: {
        type: String,
        enum: ['normal', 'credited'],
        default: 'normal'
    },
    creditFuelRate: {
        type: Number,
        default: 0.0
    },
    status: {
        type: String,
        enum: ['signed_in', 'signed_out'],
        default: 'signed_out'
    }
}, { timestamps: true });

module.exports = mongoose.model("Driver", DriverSchema);