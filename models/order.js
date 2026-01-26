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

    // ✅ RESILIENCE
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
    }
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

export default mongoose.model("Order", orderSchema);
