const mongoose = require("mongoose");

const VehicleSchema = new mongoose.Schema(
  {
    vehicleNo: {
      type: String,
      required: true,
      unique: true,
    },
    fuelCapacity: {
      type: String,
      enum: ["2KL", "6KL"],
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Vehicle", VehicleSchema);
