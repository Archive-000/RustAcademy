import { BadRequestException } from '@nestjs/common';
import { DomainEventBus } from './domain-event-bus';
import { XpService } from './xp.service';
import { XpController } from './xp.controller';

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
});

describe('XpController history', () => {
  function setup() {
    const bus = new DomainEventBus();
    const service = new XpService(bus);
    service.onModuleInit();
    const controller = new XpController(bus, service);
    return { bus, service, controller };
  }

  function publishMany(bus: DomainEventBus, count: number) {
    for (let i = 0; i < count; i++) {
      bus.publish({ eventId: `evt-${i}`, userId: 'user-1', type: 'task.passed' });
    }
  }

  it('defaults to a bounded page size', () => {
    const { bus, controller } = setup();
    publishMany(bus, 30);
    const result = controller.getHistory('user-1');
    expect(result.items).toHaveLength(20);
    expect(result.limit).toBe(20);
    expect(result.nextCursor).toBoTruthy();
  });

  it('clamps limit to the validated maximum', () => {
    const { bus, controller } = setup();
    publishMany(bus, 150);
    const result = controller.getHistory('user-1', '500');
    expect(result.items).toHaveLength(100);
    expect(result.limit).toBe(100);
  });

  it('rejects non-integer or non-positive limits', () => {
    const { controller } = setup();
    expect(() => controller.getHistory('user-1', '0')).toThrow(BadRequestException);
    expect(() => controller.getHistory('user-1', 'abc')).toThrow(BadRequestException);
    expect(() => controller.getHistory('user-1', '1.5')).toThrow(BadRequestException);
  });

  it('paginates with stable cursors without duplicates or gaps', () => {
    const { bus, controller } = setup();
    publishMany(bus, 25);
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = controller.getHistory('user-1', '10', cursor);
      for (const item of page.items) {
        seen.push(item.eventId);
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);
  });

  it('rejects an invalid cursor', () => {
    const { bus, controller } = setup();
    publishMany(bus, 3);
    expect(() => controller.getHistory('user-1', '10', 'not-a-cursor')).toThrow(BadRequestException);
  });

  it('returns null nextCursor on the last page', () => {
    const { bus, controller } = setup();
    publishMany(bus, 5);
    const result = controller.getHistory('user-1', '10');
    expect(result.items).toHaveLength(5);
    expect(result.nextCursor).toBeNull();
  });
});
