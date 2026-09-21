import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code';

export type UploadFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };

type Policy = { mimes: string[]; maximum: number; signature: (buffer: Buffer) => boolean };
const mb = 1024 * 1024;
const starts = (value: string) => (buffer: Buffer) =>
  buffer.subarray(0, value.length).toString() === value;
const policies: Record<string, Policy> = {
  txt: { mimes: ['text/plain'], maximum: 10 * mb, signature: validText },
  md: { mimes: ['text/markdown', 'text/plain'], maximum: 10 * mb, signature: validText },
  csv: {
    mimes: ['text/csv', 'application/csv', 'text/plain'],
    maximum: 10 * mb,
    signature: validText,
  },
  json: {
    mimes: ['application/json', 'text/json', 'text/plain'],
    maximum: 10 * mb,
    signature: validJson,
  },
  png: {
    mimes: ['image/png'],
    maximum: 10 * mb,
    signature: (b) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  },
  jpg: { mimes: ['image/jpeg'], maximum: 10 * mb, signature: jpeg },
  jpeg: { mimes: ['image/jpeg'], maximum: 10 * mb, signature: jpeg },
  webp: {
    mimes: ['image/webp'],
    maximum: 10 * mb,
    signature: (b) => starts('RIFF')(b) && b.subarray(8, 12).toString() === 'WEBP',
  },
  pdf: { mimes: ['application/pdf'], maximum: 25 * mb, signature: starts('%PDF-') },
  docx: {
    mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    maximum: 25 * mb,
    signature: (b) =>
      b.subarray(0, 2).toString() === 'PK' &&
      b.includes(Buffer.from('[Content_Types].xml')) &&
      b.includes(Buffer.from('word/')),
  },
  wav: {
    mimes: ['audio/wav', 'audio/wave', 'audio/x-wav'],
    maximum: 20 * mb,
    signature: (b) => starts('RIFF')(b) && b.subarray(8, 12).toString() === 'WAVE',
  },
  mp3: {
    mimes: ['audio/mpeg', 'audio/mp3'],
    maximum: 20 * mb,
    signature: (b) => starts('ID3')(b) || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0),
  },
  m4a: {
    mimes: ['audio/mp4', 'audio/x-m4a', 'video/mp4'],
    maximum: 20 * mb,
    signature: (b) => b.subarray(4, 8).toString() === 'ftyp',
  },
};

function validText(buffer: Buffer) {
  if (buffer.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}
function validJson(buffer: Buffer) {
  if (!validText(buffer)) return false;
  try {
    JSON.parse(buffer.toString('utf8'));
    return true;
  } catch {
    return false;
  }
}
function jpeg(buffer: Buffer) {
  return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}
export function validateUpload(file: UploadFile, configuredMaximum: number) {
  const extension = file.originalname.split('.').pop()?.toLowerCase() || '';
  const policy = policies[extension];
  if (!policy || !policy.mimes.includes(file.mimetype.toLowerCase()))
    throw new AppException(415, ErrorCode.UNSUPPORTED_FILE_TYPE, '지원하지 않는 파일 형식입니다.');
  if (!file.size || file.size > Math.min(policy.maximum, configuredMaximum))
    throw new AppException(413, ErrorCode.FILE_TOO_LARGE, '파일 크기 제한을 초과했습니다.');
  if (!policy.signature(file.buffer))
    throw new AppException(
      415,
      ErrorCode.INVALID_FILE_SIGNATURE,
      '파일 내용과 형식이 일치하지 않습니다.',
    );
  return { extension, mimeType: policy.mimes[0]! };
}
