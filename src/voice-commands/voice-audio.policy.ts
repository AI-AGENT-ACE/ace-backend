import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code';

export type VoiceUpload = { originalname: string; mimetype: string; size: number; buffer: Buffer };

export function validateVoiceWav(file: VoiceUpload | undefined, maximum: number) {
  if (!file?.size || file.buffer.length !== file.size)
    throw new AppException(400, ErrorCode.VOICE_FILE_INVALID, 'Voice WAV file is empty or invalid');
  if (file.size > maximum)
    throw new AppException(413, ErrorCode.VOICE_FILE_TOO_LARGE, 'Voice WAV file is too large');
  if (!['audio/wav', 'audio/wave', 'audio/x-wav'].includes(file.mimetype.toLowerCase()))
    throw new AppException(415, ErrorCode.VOICE_FILE_INVALID, 'Voice file must use WAV MIME type');
  const bytes = file.buffer;
  if (
    bytes.length < 44 ||
    bytes.subarray(0, 4).toString('ascii') !== 'RIFF' ||
    bytes.subarray(8, 12).toString('ascii') !== 'WAVE' ||
    bytes.subarray(12, 16).toString('ascii') !== 'fmt ' ||
    bytes.subarray(36, 40).toString('ascii') !== 'data'
  )
    throw new AppException(415, ErrorCode.VOICE_FILE_INVALID, 'Voice WAV signature is invalid');
  const declared = bytes.readUInt32LE(40);
  if (!declared || declared + 44 !== bytes.length)
    throw new AppException(415, ErrorCode.VOICE_FILE_INVALID, 'Voice WAV length is invalid');
  return file;
}
