import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString, IsISO8601, IsInt, Min, Max } from 'class-validator';
import { XpEventType } from '../xp.types';

export class PublishXpEventDto {
  @String()
  @IsNotEmpty()
  eventId: string;

  @String()
  @IsNotEmpty()
  userId: string;

  @IsIn(['task.passed', 'course.completed', 'streak.day', 'contribution.created'])
  type: XpEventType;

  @IsOptional()
  @IsISO8601()
  occurredAt?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class XpHistoryQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}
