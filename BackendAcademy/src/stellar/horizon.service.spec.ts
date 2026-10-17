import { Keypair } from '@stellar/stellar-sdk';
import { HorizonService } from './horizon.service';
import { StellarService } from './stellar.service';

describe('HorizonService', () => {
  it('normalizes paginated operations and clamps the page size', async () => {
    const publicKey = Keypair.random().publicKey();
    const record = {
      id: 'operation-id',
      paging_token: 'next-page-token',
      type: 'payment',
      created_at: '2026-01-01T00:00:00Z',
      source_account: publicKey,
      transaction_hash: 'transaction-hash',
      amount: '1.5000000',
      asset_type: 'native',
      to: 'GDESTINATION',
    };
    const call = jest.fn().mockResolved({ records: [record] });
    const cursor = jest.fn().mockReturnValue({ call });
    const limit = jest.fn().mockReturnValue({ cursor, call });
    const order = jest.fn().mockReturnValue({ limit });
    const forAccount = jest.fn().mockReturnValue({ order });
    const operations = jest.fn().mockReturnValue({ forAccount });
    const service = new HorizonService({ server: { operations } } as unknown as StellarService);

    const result = await service.getHistory(publicKey, 500, 'previous-token');

    expect(limit).toHaveBeenCalledWith(100);
    expect(cursor).toHaveBeenCalledWith('previous-token');
    expect(result.operations[0]).toMatchObject({
      id: 'operation-id',
      type: 'payment',
      amount: '1.5000000',
      assetCode: 'XLM',
      transactionHash: 'transaction-hash',
    });
    expect(result.nextCursor).toBe('next-page-token');
  });

  it('maps a missing account to a safe not-found error', async () => {
    const publicKey = Keypair.random().publicKey();
    const loadAccount = jest.fn().mockRejected({
      response: {
        status: 404,
        data: { title: 'Resource Missing', detail: 'Account not found', extra: { upstream: 'truth' } },
      },
      message: 'Request failed with status code 404',
    });
    const service = new HorizonService({ server: { loadAccount } } as unknown as StellarService);

    await expect(service.getAccount(publicKey)).rejects.toMatchObject({
      status: 404,
      message: 'Stellar account not found',
    });
  });

  it('maps upstream failures to a safe service-unavailable error without leaking payloads', async () => {
    const publicKey = Keypair.random().publicKey();
    const upstreamPayload = {
      response: {
        status: 503,
        data: { title: 'Internal Server Error', detail: 'secret upstream detail', extra: { trace: 'internal' } },
      },
      message: 'Request failed with status code 503',
    };
    const loadAccount = jest.fn().mockRejected(upstreamPayload);
    const service = new HorizonService({ server: { loadAccount } } as unknown as StellarService);

    await expect(service.getAccount(publicKey)).rejects.toMatchObject({
      status: 503,
      message: 'Unable to fetch Stellar account',
    });
  });

  it('maps history upstream failures to a safe service-unavailable error', async () => {
    const publicKey = Keypair.random().publicKey();
    const call = jest.fn().mockRejected({
      response: {
        status: 500,
        data: { title: 'Internal Server Error', detail: 'secret upstream detail' },
      },
      message: 'Request failed with status code 500',
    });
    const cursor = jest.fn().mockReturnValue({ call });
    const limit = jest.fn().mockReturnValue({ cursor, call });
    const order = jest.fn().mockReturnValue({ limit });
    const forAccount = jest.fn().mockReturnValue({ order });
    const operations = jest.fn().mockReturnValue({ forAccount });
    const service = new HorizonService({ server: { operations } } as unknown as StellarService);

    await expect(service.getHistory(publicKey)).rejects.toMatchObject({
      status: 503,
      message: 'Unable to fetch Stellar transaction history',
    });
  });
});
