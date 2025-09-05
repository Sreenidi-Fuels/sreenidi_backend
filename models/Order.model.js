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
    shippingAddress: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Address", 
      required: function () { 
        // For driver-initiated orders, address is optional
        return this.orderType !== 'driver-initiated'; 
      } 
    },
    billingAddress: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Address", 
      required: function () { 
        // For driver-initiated orders, address is optional
        return this.orderType !== 'driver-initiated'; 
      } 
    },
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
      enum: ['normal', 'direct', 'driver-initiated'],
      default: 'normal',
    },
    paymentType: {
      type: String,
      enum: ['credit', 'cash', 'online'],
    },
    paymentDetails: {
      status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
        default: 'pending'
      },
      method: {
        type: String,
        enum: ['ccavenue', 'cash', 'credit'],
        default: function() {
          return this.paymentType === 'online' ? 'ccavenue' : this.paymentType;
        }
      },
      transactionId: String,
      bankRefNo: String,
      trackingId: String,
      paymentMode: String, // Card, NetBanking, UPI, etc.
      bankName: String,
      amount: Number,
      currency: {
        type: String,
        default: 'INR'
      },
      paidAt: Date,
      ccavenueResponse: {
        type: mongoose.Schema.Types.Mixed,
        select: false // Don't include in normal queries for security
      },
      failureReason: String,
      retryCount: {
        type: Number,
        default: 0
      },
      lastPaymentAttempt: Date
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
    CustomersCash: {
      type: Number,
      default: null
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
  }, {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (_doc, ret) {
        if (Object.prototype.hasOwnProperty.call(ret, 'amount')) {
          ret.orderAmount = ret.amount;
          delete ret.amount;
        }
        return ret;
      }
    },
    toObject: {
      virtuals: true,
      transform: function (_doc, ret) {
        if (Object.prototype.hasOwnProperty.call(ret, 'amount')) {
          ret.orderAmount = ret.amount;
          delete ret.amount;
        }
        return ret;
      }
    }
  }
);

// Virtual for clearer naming in application code
OrderSchema.virtual('orderAmount')
  .get(function () { return this.amount; })
  .set(function (value) { this.amount = value; });

module.exports = mongoose.model("Order", OrderSchema);
