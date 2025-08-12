const mongoose = require("mongoose");

const InvoiceSchema = new mongoose.Schema(
  {
    invoiceNo: {
      type: String,
      required: true,
      unique: true,
    },
    invoiceDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
      required: false,
    },
    shippingAddress: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Address",
      required: true,
    },
    billingAddress: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Address",
      required: true,
    },
    dispatchedThrough: {
      type: String,
      required: false,
      default: null,
    },
    vehicleNO: {
      type: String,
      required: false,
      default: "N/A",
    },
    // NEW FIELDS
    paymentMethod: {
      type: String,
      default: null
    },
    destination: {
      type: String,
      default: ""
    },
    rate: {
      type: Number,
      default: null
    },
    deliveryCharges: {
      type: Number,
      default: 0
    },
    cgst: {
      type: Number,
      default: 0
    },
    sgst: {
      type: Number,
      default: 0
    },
    totalAmount: {
      type: Number,
      default: null
    },
    amountInChargeable: {
      type: String,
      default: ""
    },
    // EXISTING FIELDS
    fuelQuantity: {
      type: Number,
      required: true,
    },
    amount: {
      type: Number,
      default: null,
    },
    remarks: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["draft", "issued", "cancelled"],
      default: "draft",
    },
  },
  { timestamps: true }
);

// Generate unique invoice number
InvoiceSchema.statics.generateInvoiceNumber = async function() {
  const timestamp = Date.now();
  const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  const invoiceNo = `SF-${timestamp}-${randomSuffix}`;
  
  // Check if this invoice number already exists
  const existingInvoice = await this.findOne({ invoiceNo });
  if (existingInvoice) {
    // If exists, generate a new one recursively
    return this.generateInvoiceNumber();
  }
  
  return invoiceNo;
};

module.exports = mongoose.model("Invoice", InvoiceSchema);