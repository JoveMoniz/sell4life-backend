import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    items: [
      {
        productId: String,
        name: String,
        price: Number,
        quantity: Number,
        image: {
          type: String,
          default: "/assets/images/products/default.png"
        }
      }
    ],

    total: {
      type: Number,
      required: true
    },

    status: {
      type: String,
      default: "pending"
    },

    statusHistory: [
      {
        status: String,
        date: {
          type: Date,
          default: Date.now
        }
      }
    ]
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
      }
    }
  }
);

export default mongoose.models.Order ||
  mongoose.model("Order", orderSchema);
