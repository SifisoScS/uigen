import { PrismaClient } from './src/generated/prisma/index.js';
import bcrypt from 'bcrypt';

const email = process.argv[2];
const newPassword = process.argv[3];

const p = new PrismaClient();

if (!email && !newPassword) {
<<<<<<< HEAD
=======
  // List users
>>>>>>> 1eaa7d419912a5c62588847fb10220071c12810a
  const users = await p.user.findMany({ select: { id: true, email: true, createdAt: true } });
  console.log('Users:', JSON.stringify(users, null, 2));
} else if (email && newPassword) {
  const hash = await bcrypt.hash(newPassword, 10);
  const user = await p.user.update({ where: { email }, data: { password: hash } });
  console.log('Password reset for:', user.email);
<<<<<<< HEAD
=======
} else {
  console.log('Usage:');
  console.log('  List users:      node reset-password.mjs');
  console.log('  Reset password:  node reset-password.mjs your@email.com newpassword');
>>>>>>> 1eaa7d419912a5c62588847fb10220071c12810a
}

await p.$disconnect();
