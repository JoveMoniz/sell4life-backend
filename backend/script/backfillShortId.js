import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from '../models/order.js';

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  const orders = await Order.find({ shortId: { $exists: false } });

  console.log(`Found ${orders.length} orders to update`);

  for (const order of orders) {
    order.shortId = String(order._id).slice(0, 10).toUpperCase();
    await order.save();
  }

  console.log('Backfill complete');
  process.exit();
}

run();
