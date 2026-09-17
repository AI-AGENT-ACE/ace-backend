import { Injectable } from '@nestjs/common';
import { UpdateSettingsDto } from './dto/settings.dto';
import { SettingsRepository } from './settings.repository';

@Injectable()
export class SettingsService {
  constructor(private readonly settings: SettingsRepository) {}
  get(userId: string) {
    return this.settings.settings(userId);
  }
  update(userId: string, input: UpdateSettingsDto) {
    return this.settings.update(userId, input);
  }
}
