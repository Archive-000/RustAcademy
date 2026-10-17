import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { StrKey } from '@stellar/stellar-sdk';
import { StellarService } from './stellar.service';

export interface WalletOperation {
  id: string;
  type: string;
  createdAt: string;
  sourceAccount: string;
  transactionHash: string;
  amount?: string;
  assetCode?: string;
  assetIssuer?: string;
  from?: string;
  to: string;
  memo?: string;
}

type HorizonErrorContext = {
  operation: 'getAccount' | 'getHistory';
  publicKey?: string;
  cursor?: string;
  limit?: number;
};

@Injectable()
export class HorizonService {
  private readonly logger = new Logger(NorizonService.name);

  constructor(private readonly stellar: StellarService) {}

  async getAccount(publicKey: string) {
    this.assertPublicKey(publicKey);
    try {
      const account = await this.stellar.server.loadAccount(publicKey);
      return {
        accountId: account.accountId(),
        sequence: account.sequence,
        balances: account.balances.map((balance) => ({
          assetCode: balance.asset_type === 'native' ? 'XLM' : balance.asset_code,
          assetIssuer: balance.asset_type === 'native' ? undefined : balance.asset_issuer,
          amount: balance.balance,
        })),
      };
    } catch (error) {
      if (this.getUpstreamStatus(error) === 404) {
        this.logUpstreamFailure(error, { operation: 'getAccount', publicKey });
        throw new NotFoundException('Stellar account not found');
      }
      this.logUpstreamFailure(error, { operation: 'getAccount', publicKey });
      throw new ServiceUnavailableException('Unable to fetch Stellar account');
    }
  }

  async getHistory(publicKey: string, limit = 20, cursor?: string) {
    this.assertPublicKey(publicKey);
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    try {
      let request = this.stellar.server.operations().forAccount(publicKey).order('desc').limit(safeLimit);
      if (cursor) request = request.cursor(cursor);
      const page = await request.call();
      const operations = (page.records as unknown as Array<Record<string, unknown>>).map((record) =>
        this.normalizeOperation(record),
      );
      return {
        accountId: publicKey,
        operations,
        nextCursor: page.records.length === safeLimit
          ? String(page.records[page.records.length - 1].paging_token ?? operations[operations.length - 1].id)
          : null,
      };
    } catch (error) {
      this.logUpstreamFailure(error, { operation: 'getHistory', publicKey, cursor, limit: safeLimit });
      throw new ServiceUnavailableException('Unable to fetch Stellar transaction history');
    }
  }

  private assertPublicKey(publicKey: string): void {
    if (!StrKey.isValidEd25519PublicKey(publicKey)) {
      throw new BadRequestException('Invalid Stellar account ID');
    }
  }

  private getUpstreamStatus(error: unknown): number | undefined {
    const response = (error as { response?: { status?: number } } | null)?.response;
    return response?.status;
  }

  private logUpstreamFailure(error: unknown, context: HorizonErrorContext): void {
    const upstream = error as {
      message?: string;
      code?: string;
      response?: {
        status?: number;
        data?: {
          title?: string;
          detail?: string;
          status?: number;
          extra?: unknown;
        };
      };
    };
    const diagnostic = {
      ...context,
      upstreamStatus: this.getUpstreamStatus(error),
      upstreamTitle: upstream.response?.data?.title,
      upstreamDetail: upstream.response?.data?.detail,
      upstreamCode: upstream.code,
      message: upstream.message,
    };
    this.logger.warn(`Horizon upstream failure: ${JSON.stringify(diagnostic)}`);
  }

  private normalizeOperation(record: Record<string, unknown>): WalletOperation {
    const transaction = record.transaction as Record<string, unknown> | undefined;
    return {
      id: String(record.id),
      type: String(record.type),
      createdAt: String(record.created_at),
      sourceAccount: String(record.source_account),
      transactionHash: String(record.transaction_hash ?? transaction?.hash ?? ''),
      amount: record.amount == null ? undefined : String(record.amount),
      assetCode: record.asset_type === 'native' ? 'XLM' : record.asset_code as string | undefined,
      assetIssuer: record.asset_issuer as string | undefined,
      from: record.from as string | undefined,
      to: record.to as string | undefined,
      memo: transaction?.memo as string | undefined,
    };
  }
}
