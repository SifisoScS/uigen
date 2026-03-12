import { PrismaClient } from './src/generated/prisma/index.js';
import bcrypt from 'bcrypt';

const email = process.argv[2];
const newPassword = process.argv[3];

const p = new PrismaClient();

if (!email && !newPassword) {
  const users = await p.user.findMany({ select: { id: true, email: true, createdAt: true } });
  console.log('Users:', JSON.stringify(users, null, 2));
} else if (email && newPassword) {
  const hash = await bcrypt.hash(newPassword, 10);
  const user = await p.user.update({ where: { email }, data: { password: hash } });
  console.log('Password reset for:', user.email);
}

await p.$disconnect();
