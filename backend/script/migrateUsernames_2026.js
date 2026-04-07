import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/user.js';

const MONGO = process.env.MONGODB_URI;

const connectors = ['da', 'de', 'do', 'dos', 'das', 'van', 'von', 'al'];

function generateBaseUsername(name) {
  const parts = name
    .toLowerCase()
    .split(' ')
    .filter((p) => p && !connectors.includes(p));

  const first = parts[0] || '';
  const last = parts[parts.length - 1] || '';

  return (first + last).replace(/[^a-z0-9]/g, '');
}

async function createUniqueUsername(base) {
  let username = base;
  let counter = 1;

  while (await User.findOne({ username })) {
    username = base + counter;
    counter++;
  }

  return username;
}

async function migrate() {
  await mongoose.connect(MONGO);

  console.log('Connected to database');

  const users = await User.find({
    $or: [{ username: { $exists: false } }, { username: null }],
  });

  console.log(`Users needing username: ${users.length}`);

  for (const user of users) {
    let base;

    if (user.name) {
      base = generateBaseUsername(user.name);
    } else {
      base = user.email
        .split('@')[0]
        .replace(/[^a-z0-9]/gi, '')
        .toLowerCase();
    }

    const username = await createUniqueUsername(base);

    user.username = username;

    await user.save({ validateBeforeSave: false });

    console.log(`Updated ${user.email} → ${username}`);
  }

  console.log('Migration complete');
  process.exit();
}

migrate();
