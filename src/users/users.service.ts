import { Injectable } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly users: UsersRepository) {}
  async profile(userId: string) {
    const user = await this.users.findProfile(userId);
    if (!user) throw new AppException(404, ErrorCode.USER_NOT_FOUND, 'User not found');
    return user;
  }
  updateProfile(userId: string, displayName: string) {
    return this.users.updateProfile(userId, displayName);
  }
}
