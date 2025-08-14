const mongoose = require("mongoose");
const InvoiceCounter = require("./InvoiceCounter.model");

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
      enum: ["draft", "issued", "confirmed", "cancelled"],
      default: "draft",
    },
  },
  { timestamps: true }
);

// Generate fiscal-year-based invoice number: SF/YY1-YY2/N
InvoiceSchema.statics.generateInvoiceNumber = async function() {
  const now = new Date();
  const monthIdx = now.getMonth(); // 0 = Jan, 3 = Apr
  const year = now.getFullYear();
  const fyStartYear = monthIdx >= 3 ? year : year - 1;
  const fyEndYear = fyStartYear + 1;
  const two = (y) => String(y).slice(-2).padStart(2, '0');
  const fyLabel = `${two(fyStartYear)}-${two(fyEndYear)}`; // e.g., 25-26

  // Atomically increment sequence for this FY
  const counter = await InvoiceCounter.findOneAndUpdate(
    { fy: fyLabel },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const invoiceNo = `SF/${fyLabel}/${counter.seq}`;

  // Extremely defensive: ensure uniqueness; if collision (very unlikely), retry once
  const existing = await this.findOne({ invoiceNo }).select('_id');
  if (existing) {
    const retryCounter = await InvoiceCounter.findOneAndUpdate(
      { fy: fyLabel },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    return `SF/${fyLabel}/${retryCounter.seq}`;
  }

  return invoiceNo;
};

module.exports = mongoose.model("Invoice", InvoiceSchema);