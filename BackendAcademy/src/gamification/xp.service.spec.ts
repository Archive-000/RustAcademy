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

  it('applies distinct valid events normally', () => {
    const bus = new DomainEventBus();
    const service = new XpService(bus);
    service.onModuleInit();

    bus.publish({ eventId: 'evt-1', userId: 'user-1', type: 'task.passed' });
    bus.publish({ eventId: 'evt-2', userId: 'user-1', type: 'task.passed' });
    bus.publish({ eventId: 'evt-3', userId: 'user-2', type: 'task.passed' });

    expect(service.getBalance('user-1')).toBe(20);
    expect(service.getLedger('user-1')).toHaveLength(2);
    expect(service.getBalance('user-2')).toBe(10);
    expect(service.getLedger('user-2')).toHaveLength(1);

    service.onModuleDestroy();
  });

  it('ignores replayed event IDs but still applies new ones', () => {
    const bus = new DomainEventBus();
    const service = new XpService(bus);
    service.onModuleInit();

    bus.publish({ eventId: 'evt-1', userId: 'user-1', type: 'task.passed' });
    bus.publish({ eventId: 'evt-1', userId: 'user-1', type: 'task.passed' });
    bus.publish({ eventId: 'evt-2', userId: 'user-1', type: 'task.passed' });
    bus.publish({ eventId: 'evt-2', userId: 'user-1', type: 'task.passed' });

    expect(service.getBalance('user-1')).toBe(20);
    expect(service.getLedger('user-1')).toHaveLength(2);
    expect(service.getTotals('user-1').totalXp).toBe(20);

    service.onModuleDestroy();
  });
});
