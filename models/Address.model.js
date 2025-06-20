const mongoose = require("mongoose");

const AddressSchema = mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    typeOfLocation: String,
    company: String,
    building: String,
    street: String,
    landmark: String,
    city: String,
    state: String,
    pin: Number,
    maps: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Address", AddressSchema);
