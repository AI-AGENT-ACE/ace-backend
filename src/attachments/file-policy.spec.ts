import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code';
import { validateUpload } from './file-policy';

const file = (name: string, mimetype: string, buffer: Buffer) => ({
  originalname: name,
  mimetype,
  buffer,
  size: buffer.length,
});

describe('attachment file policy', () => {
  it('accepts a PNG only when extension, MIME and signature agree', () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    expect(validateUpload(file('사진 1.png', 'image/png', png), 26214400)).toEqual({
      extension: 'png',
      mimeType: 'image/png',
    });
  });
  it('blocks executable extensions', () => {
    expect(() =>
      validateUpload(file('virus.exe', 'application/octet-stream', Buffer.from('MZ')), 26214400),
    ).toThrow(AppException);
  });
  it('rejects spoofed file signatures with a stable error code', () => {
    try {
      validateUpload(file('fake.pdf', 'application/pdf', Buffer.from('not a pdf')), 26214400);
      fail('expected rejection');
    } catch (error) {
      expect((error as AppException).getResponse()).toMatchObject({
        code: ErrorCode.INVALID_FILE_SIGNATURE,
      });
    }
  });
});
