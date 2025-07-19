const mongoose = require('mongoose')

const DriverSchema = mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    mobile: {
        type: String,
        required: true
    },
    vehicleDetails: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Vehicle",
        required: false
    },
    creditFuelRate: {
        type: Number,
        default: 0.0
    }
}, { timestamps: true });

module.exports = mongoose.model("Driver", DriverSchema);