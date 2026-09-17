import { Type } from 'class-transformer';
import { IsInt, IsString, Matches, Max, Min } from 'class-validator';
import { OptionalField } from '../validation/optional-field.decorator';

export class PageQueryDto {
  @OptionalField()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 30;

  @OptionalField()
  @IsString()
  @Matches(/^[a-z0-9]{20,40}$/)
  cursor?: string;
}

export function cursorPage<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  return { items, nextCursor: hasMore ? items.at(-1)!.id : null, hasMore };
}
