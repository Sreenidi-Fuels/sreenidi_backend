const mongoose = require("mongoose");

const InvoiceCounterSchema = new mongoose.Schema(
  {
    fy: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    seq: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("InvoiceCounter", InvoiceCounterSchema);


