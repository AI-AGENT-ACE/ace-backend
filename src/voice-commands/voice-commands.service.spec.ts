import { VoiceCommandsService } from './voice-commands.service';

const file = {
  originalname: 'voice.wav',
  mimetype: 'audio/wav',
  size: 48,
  buffer: Buffer.alloc(48),
};
file.buffer.write('RIFF', 0);
file.buffer.writeUInt32LE(40, 4);
file.buffer.write('WAVE', 8);
file.buffer.write('fmt ', 12);
file.buffer.write('data', 36);
file.buffer.writeUInt32LE(4, 40);
describe('VoiceCommandsService', () => {
  const config = {
    getOrThrow: (key: string) => (key === 'VOICE_MAX_FILE_SIZE' ? 1024 : undefined),
  };
  it('forwards an authenticated request and removes temp audio after success', async () => {
    const temp = {
      create: jest.fn().mockResolvedValue('/tmp/voice.wav'),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const ai = {
      process: jest.fn().mockResolvedValue({
        requestId: 'voice_1234567890abcdef',
        type: 'message',
        transcript: '안녕',
      }),
    };
    const service = new VoiceCommandsService(config as never, temp as never, ai as never);
    await expect(
      service.process('user', 'voice_1234567890abcdef', undefined, file),
    ).resolves.toMatchObject({ transcript: '안녕' });
    expect(ai.process).toHaveBeenCalledWith(
      '/tmp/voice.wav',
      'voice_1234567890abcdef',
      'user',
      undefined,
    );
    expect(temp.remove).toHaveBeenCalledWith('/tmp/voice.wav');
  });
  it('removes temp audio when AI processing fails', async () => {
    const temp = {
      create: jest.fn().mockResolvedValue('/tmp/voice.wav'),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const ai = { process: jest.fn().mockRejectedValue(new Error('offline')) };
    const service = new VoiceCommandsService(config as never, temp as never, ai as never);
    await expect(
      service.process('user', 'voice_1234567890abcdef', undefined, file),
    ).rejects.toThrow('offline');
    expect(temp.remove).toHaveBeenCalled();
  });
});
