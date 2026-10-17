import { DomainEventBus } from './domain-event-bus';
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

  it('normalizes an event time with a non-UTC offset to UTC', () => {
    const bus = new DomainEventBus();
    const service = new XpService(bus);
    service.onModuleInit();

    bus.publish({
      eventId: 'evt-offset',
      userId: 'user-offset',
      type: 'task.passed',
      occurredAt: '2024-01-15T10:30:00+02:00',
    });

    const [award] = service.getLedger('user-offset');
    expect(award.occurredAt).toBe('2024-01-15T08:30:00.000Z');

    service.onModuleDestroy();
  });

  it('defaults a missing event time to a UTC timestamp', () => {
    const bus = new DomainEventBus();
    const service = new XpService(bus);
    service.onModuleInit();

    bus.publish({ eventId: 'evt-default', userId: 'user-default', type: 'task.passed' });

    const [award] = service.getLedger('user-default');
    expect(award.occurredAt).match(/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$/);
    expect(award.occurredAt).toBe(new Date(award.occurredAt).toISOString());

    service.onModuleDestroy();
  });
});
