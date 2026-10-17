import { Body, Controller, Get, Param, Post, Query, BadRequestException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DomainEventBus } from './domain-event-bus';
import { PublishXpEventDto } from './dto/publish-xp-event.dto';
import { XpService } from './xp.service';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

function encodeCursor(key: string): string {
  return Buffer.from(key, 'utf-8').toString('base64url');
}

function decodeCursor(cursor: string): string {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf-8');
    if (!decoded) {
      throw new Error('empty');
    }
    return decoded;
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
}

function getEntryKey(entry: { eventId: string }): string {
  return entry.eventId;
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
    this.eventBus.publish(event);
    return { accepted: true, eventId: event.eventId, totalXp: this.xpService.getBalance(event.userId) };
  }

  @Get(':userId')
  getTotals(@Param('userId') userId: string) {
    return this.xpService.getTotals(userId);
  }

  @Get(':userId/history')
  @IpiOperation({ summary: 'Get bounded XP history with stable cursor' })
  getHistory(
    @Param('userId') userId: string,
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursor?: string,
  ) {
    const limit = this.parseLimit(limitRaw);
    const ledger = this.xpService.getLedger(userId);
    let startIndex = 0;
    if (cursor) {
      const decoded = decodeCursor(cursor);
      const idx = ledger.findIndex((e) => getEntryKey(e) === decoded);
      if (idx < 0) {
        throw new BadRequestException('Invalid cursor');
      }
      startIndex = idx + 1;
    }
    const page = ledger.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < ledger.length;
    const nextCursor = hasMore && page.length > 0 ? encodeCursor(getEntryKey(page[page.length - 1])) : null;
    return { items: page, nextCursor: nextCursor, limit };
  }

  private parseLimit(limitRaw?: string): number {
    if (limitRaw === undefined || limitRaw === '') {
      return DEFAULT_LIMIT;
    }
    const parsed = Number(limitRaw);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new BadRequestException('Invalid limit');
    }
    return Math.min(parsed, MAX_LIMIT);
  }
}
