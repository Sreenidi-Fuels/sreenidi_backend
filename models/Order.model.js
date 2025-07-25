const mongoose = require("mongoose");

function generateOtp() {
  return Math.floor(1000 + Math.random() * 9000);
}

const TrackingSchema = new mongoose.Schema(
  {
    orderConfirmation: {
      status: {
        type: String,
        enum: ["pending", "accepted", "rejected"],
        default: "pending",
      },
    },
    driverAssignment: {
      driverId: { type: mongoose.Schema.Types.ObjectId, ref: "Driver" },
    },
    dispatch: {
      status: {
        type: String,
        enum: ["pending", "dispatched", "completed"],
        default: "pending",
      },
    },
    fuelDispense: {
      startDispenseOtp: { type: Number, required: true },
      stopDispenseOtp: { type: Number, required: true },
      startVerified: { type: Boolean, default: false },
      stopVerified: { type: Boolean, default: false },
    },
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    shippingAddress: { type: mongoose.Schema.Types.ObjectId, ref: "Address", required: true },
    billingAddress: { type: mongoose.Schema.Types.ObjectId, ref: "Address", required: true },
    fuelQuantity: {
      type: Number,
      required: true,
    },
    amount: {// change this later as admin sets the amount for fuel.
      type: Number,
      required: true,
    },
    deliveryMode: {
      type: String,
      enum: ["earliest", "scheduled"],
      required: true,
    },
    deliveryDate: {
      type: Date,
      required: function () {
        return this.deliveryMode === "scheduled";
      },
    },
    tracking: {
      type: TrackingSchema,
      default: function() {
        return {
          orderConfirmation: { status: 'pending' },
          driverAssignment: { driverId: null },
          dispatch: { status: 'pending' },
          fuelDispense: {
            startDispenseOtp: generateOtp(),
            stopDispenseOtp: generateOtp(),
            startVerified: false,
            stopVerified: false
          }
        };
      }
    },
    orderType: {
      type: String,
      enum: ['normal', 'direct'],
      default: 'normal',
    },
    paymentType: {
      type: String,
      enum: ['credit', 'cash'],
    },
    asset: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Asset"
    },
    jcno: {
      type: String
    },
    deliveredLiters: {
      type: Number
    },
    receiverDetails: {
      type: {
        type: String,
        enum: ['self', 'other'],
        default:'self',
        required: true
      },
      name: {
        type: String,
        required: function() {
          return this.receiverDetails && this.receiverDetails.type === 'other';
        }
      },
      phoneNo: {
        type: String,
        required: function() {
          return this.receiverDetails && this.receiverDetails.type === 'other';
        }
      }
    }
  }, { timestamps: true }
);

module.exports = mongoose.model("Order", OrderSchema);
