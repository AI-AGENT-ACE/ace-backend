import { mkdtemp, access, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { VoiceTempService } from './voice-temp.service';

describe('VoiceTempService', () => {
  it('creates random temp WAV and removes it without exposing attachment storage', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ace-voice-'));
    const config = {
      getOrThrow: (key: string) =>
        key === 'VOICE_TEMP_DIR' ? directory : key === 'VOICE_TEMP_TTL_SECONDS' ? 3600 : 900,
    };
    const service = new VoiceTempService(config as never);
    await service.onModuleInit();
    const path = await service.create(Buffer.from('RIFF----WAVE'));
    expect(path.startsWith(directory)).toBe(true);
    await service.remove(path);
    await expect(access(path)).rejects.toThrow();
    service.onModuleDestroy();
    await rm(directory, { recursive: true, force: true });
  });
});
