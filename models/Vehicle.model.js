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
      required: true,
      validate: {
        validator: function(v) {
          // Allow any digit followed by "KL" (e.g., "2KL", "6KL", "8KL", "10KL", etc.)
          return /^\d+KL$/.test(v);
        },
        message: props => `${props.value} is not a valid fuel capacity format. Use format like "2KL", "6KL", "8KL", etc.`
      }
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Vehicle", VehicleSchema);
