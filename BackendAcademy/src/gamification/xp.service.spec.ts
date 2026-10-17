import { BadRequestException } from '@nestjs/common';
import { DomainEventBus } from './domain-event-bus';
import { XpController } from './xp.controller';
import { XpService } from './xp.service';

describe('XpService', () => {
  it('awards an event once when the event is replayed', () => {
    const bus = new DomainEventBus();
    const service = new XpService(bus);
    service.onModuleInit();

    const event = { eventId: 'evt-1', userId: 'user-1', type: 'task.passed' as const };
    bus.publish(event);
    bus.publish(event);

    expect(service.getBalance('user-1')).toBe(10);
    expect(service.getLedger('user-1')).toHaveLength(1);
    expect(service.getTotals('user-1').totalXp).toBe(10);

    service.onModuleDestroy();
  });

  describe('XP award amount validation', () => {
    let bus: DomainEventBus;
    let service: XpService;
    let controller: XpController;

    beforeEach(() => {
      bus = new DomainEventBus();
      service = new XpService(bus);
      service.onModuleInit();
      controller = new XpController(bus, service);
    });

    afterEach(() => service.onModuleDestroy());

    it.each([
      ['streak.day', 5],
      ['task.passed', 10],
      ['contribution.created', 25],
      ['course.completed', 100],
    ] as const)('accepts configured award %s = %i XP', (type, amount) => {
      expect(
        controller.publish({ eventId: `evt-${type}`, userId: 'user-1', type, amount }),
      ).toMatchObject({ accepted: true });
      expect(service.getBalance('user-1')).toBe(amount);
    });

    it.each([
      ['negative amount', 'task.passed', -1],
      ['above policy maximum', 'course.completed', 101],
      ['fractional amount', 'task.passed', 10.5],
      ['amount that conflicts with event policy', 'streak.day', 10],
    ] as const)('rejects %s', (_description, type, amount) => {
      expect(() =>
        controller.publish({ eventId: 'evt-invalid', userId: 'user-1', type, amount }),
      ).toThrow(BadRequestException);
      expect(service.getBalance('user-1')).toBe(0);
    });
  });

  describe('XP history bounds and continuation', () => {
    let bus: DomainEventBus;
    let service: XpService;
    let controller: XpController;

    beforeEach(() => {
      bus = new DomainEventBus();
      service = new XpService(bus);
      service.onModuleInit();
      controller = new XpController(bus, service);
      for (let i = 0; i < 25; i++) {
        bus.publish({ eventId: `evt-${i}`, userId: 'user-1', type: 'streak.day' });
      }
    });

    afterEach(() => service.onModuleDestroy());

    it('defaults to a bounded page size', () => {
      const result = controller.getTotals('user-1', {});
      expect(result.limit).toBe(20);
      expect(result.items).toHaveLength(20);
      expect(result.nextCursor).not.toBeNull();
    });

    it('caps an oversized requested limit', () => {
      const result = controller.getTotals('user-1', { limit: 1000 });
      expect(result.limit).toBe(100);
      expect(result.items).toHaveLength(25);
    });

    it('returns stable continuation pages without duplicates', () => {
      const first = controller.getTotals('user-1', { limit: 10 });
      const second = controller.getTotals('user-1', { limit: 10, cursor: first.nextCursor! });
      const third = controller.getTotals('user-1', { limit: 10, cursor: second.nextCursor! });
      const all = [...first.items, ...second.items, ...third.items];
      expect(all).toHaveLength(25);
      expect(new Set(all.map((e) => e.eventId)).size).toBe(25);
      expect(third.nextCursor).toBeNull();
    });

    it('rejects an invalid cursor', () => {
      expect(() => controller.getTotals('user-1', { cursor: 'not-a-cursor' })).toThrow(BadRequestException);
    });

    it('rejects a cursor that exceeds the maximum length', () => {
      expect(() =>
        controller.getTotals('user-1', { cursor: 'a'.repeat(257) }),
      ).toThrow(BadRequestException);
    });

    it('rejects a non-positive limit', () => {
      expect(() => controller.getTotals('user-1', { limit: 0 })).toThrow(BadRequestException);
    });
  });
});
