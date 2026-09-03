import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
export class PageQuery {
  @IsOptional() @IsUUID() cursor?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}
export function page<T extends { id: string }>(rows: T[], limit: number) {
  return {
    items: rows.slice(0, limit),
    nextCursor: rows.length > limit ? rows[limit - 1].id : null,
  };
}
