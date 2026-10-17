import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swgger';
import { DomainEventBus } from './domain-event-bus';
import {
  PublishXpEventDto,
  XpHistoryQueryDto,
  XP_AWARD_POLICY,
  XP_HISTORY_DEFAULT_LIMIT,
  XP_HISTORY_MAX_LIMIT,
  XP_HISTORY_CURSOR_MAX_LENGTH,
  XP_HISTORY_CURSOR_PATTERN,
} from './dto/publish-xp-event.dto';
import { XpService } from './xp.service';

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), 'utf-8').toString('base64');
}

function decodeCursor(cursor: string): number | null {
  if (!cursor || cursor.length > XP_HISTORY_CURSOR_MAX_LENGTH) {
    return null;
  }
  if (!XP_HISTORY_CURSOR_PATTERN.test(cursor)) {
    return null;
  }
  const raw = Buffer.from(cursor, 'base64').toString('utf-8');
  if (!/^[0-9]+$/.test(raw)) {
    return null;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    return null;
  }
  return value;
}

function resolveLimit(limit?: number): number {
  if (limit === undefined) {
    return XP_HISTORY_DEFAULT_LIMIT;
  }
  if (!Number.isInteger(limit) || limit < 1) {
    throw new BadRequestException({
      error: '"limit" must be a positive integer.',
      code: 'INVALID_XP_HISTORY_LIMIT',
    });
  }
  return Math.min(limit, XP_HISTORY_MAX_LIMIT);
}

@ApiTags('xp')
@Controller('v1/xp')
export class XpController {
  constructor(
    private readonly eventBus: DomainEventBus,
    private readonly xpService: XpService,
  ) {}

  @Post('events')
  @ApiOperation({ summary: 'Publish a domain event for XP awarding' })
  publish(@Body() event: PublishXpEventDto) {
    if (
      event.amount !== undefined &&
      (!Number.isInteger(event.amount) ||
        event.amount < 5 ||
        event.amount > 100 ||
        event.amount !== XP_AWARD_POLICY[event.type])
    ) {
      throw new BadRequestException({
        error: '"amount" must match the configured XP award for this event.',
        code: 'INVALID_XP_AWARD_AMOUNT',
      });
    }

    this.eventBus.publish(event);
    return { accepted: true, eventId: event.eventId, totalXp: this.xpService.getBalance(event.userId) };
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Get XP totals and bounded history for a user' })
  getTotals(@Param('userId') userId: string, @Query() query: XpHistoryQueryDto) {
    const limit = resolveLimit(query.limit);
    const ledger = this.xpService.getLedger(userId);
    let endExclusive = ledger.length;
    if (query.cursor) {
      const decoded = decodeCursor(query.cursor);
      if (decoded === null || decoded < 0 || decoded > ledger.length) {
        throw new BadRequestException({
          error: 'Invalid cursor.',
          code: 'INVALID_XP_HISTORY_CURSOR',
        });
      }
      endExclusive = decoded;
    }
    const startExclusive = Math.max(0, endExclusive - limit);
    const page = ledger.slice(startExclusive, endExclusive).reverse();
    const nextCursor = startExclusive > 0 ? encodeCursor(startExclusive) : null;
    return { totals: this.xpService.getTotals(userId), items: page, nextCursor: nextCursor, limit };
  }
}
