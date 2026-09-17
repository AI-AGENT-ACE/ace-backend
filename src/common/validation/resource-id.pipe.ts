import { Injectable, PipeTransform } from '@nestjs/common';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-code';

@Injectable()
export class ResourceIdPipe implements PipeTransform<string, string> {
  transform(value: string) {
    if (!/^[a-z0-9]{20,40}$/.test(value)) {
      throw new AppException(400, ErrorCode.VALIDATION_ERROR, 'Invalid resource identifier');
    }
    return value;
  }
}
