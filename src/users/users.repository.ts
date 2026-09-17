import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

export const publicUserSelect = {
  id: true,
  email: true,
  displayName: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}
  findCredentials(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }
  findProfile(id: string) {
    return this.prisma.user.findUnique({ where: { id }, select: publicUserSelect });
  }
  create(email: string, passwordHash: string, displayName?: string) {
    return this.prisma.user.create({
      data: { email, passwordHash, displayName, agentSettings: { create: {} } },
      select: publicUserSelect,
    });
  }
  updateProfile(id: string, displayName: string) {
    return this.prisma.user.update({
      where: { id },
      data: { displayName },
      select: publicUserSelect,
    });
  }
}
