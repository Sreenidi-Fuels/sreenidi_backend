const mongoose = require('mongoose')

const DriverSchema = mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    mobile: {
        type:String,
        required: true
    }
}, {timestamps: true});

module.exports = mongoose.model("Driver", DriverSchema);