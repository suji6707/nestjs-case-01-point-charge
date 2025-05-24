import { Injectable } from '@nestjs/common';
import { PointHistory, TransactionType, UserPoint } from './point.model';
import { PointHistoryTable } from 'src/database/pointhistory.table';
import { UserPointTable } from 'src/database/userpoint.table';

export const MAX_POINT = 10000000;

@Injectable()
export class PointService {
	private readonly acquiredLocks = new Set<number>();
	private readonly waitQueues = new Map<
		number,
		Array<(releaseFn: () => void) => void>
	>();

	constructor(
		private readonly userPointRepository: UserPointTable,
		private readonly historyRepository: PointHistoryTable,
	) {}

	// Exclusive lock (should not read userPoint during charge)
	/**
	 * 락 획득 조건:
	 * 1. no one using the lock
	 * 2. no one waiting for the lock
	 *
	 * 락 해제:
	 * 1. if lock already released, do nothing
	 * 2. release lock and wake up waitQueue callback in FIFO.
	 */

	// callback: 어떤 함수를 원하는 타이밍에 실행시키는 방법.
	private releaseFn(userId: number): () => void {
		return () => {
			if (!this.acquiredLocks.has(userId)) {
				return;
			}
			this.acquiredLocks.delete(userId);
			this._processNextInQueue(userId);
		};
	}

	private acquire(userId: number): Promise<() => void> {
		return new Promise((resolve) => {
			const queue = this.waitQueues.get(userId) ?? [];
			if (!this.acquiredLocks.has(userId) && queue.length === 0) {
				this.acquiredLocks.add(userId);
				return resolve(this.releaseFn(userId));
			} else {
				queue.push(resolve);
				this.waitQueues.set(userId, queue);
			}
		});
	}

	private _processNextInQueue(userId: number): void {
		const queue = this.waitQueues.get(userId) ?? [];
		const nextResolver = queue.shift();
		if (nextResolver) {
			this.acquiredLocks.add(userId);
			nextResolver(this.releaseFn(userId));
		}
	}

	// 포인트 조회
	async getUserPoint(userId: number): Promise<UserPoint> {
		return this.userPointRepository.selectById(userId);
	}

	// 포인트 내역 조회
	async getUserPointHistory(userId: number): Promise<PointHistory[]> {
		return this.historyRepository.selectAllByUserId(userId);
	}

	// 충전 후 잔액 리턴
	/**
	 * 1. get user point
	 * if it's null, create user point
	 * if user point + amount > max, return error
	 *
	 * 2. add point history
	 * 3. add user point
	 */
	async charge(userId: number, amount: number): Promise<UserPoint> {
		const release = await this.acquire(userId);

		try {
			let userPoint = await this.userPointRepository.selectById(userId);
			// 없으면 생성
			if (!userPoint) {
				userPoint = await this.userPointRepository.insertOrUpdate(
					userId,
					0,
				);
			}

			if (userPoint.point + amount > MAX_POINT) {
				throw new Error('EXCEED_MAX_POINT');
			}

			// =========== TRANSACTION START ===========
			const newAmount = userPoint.point + amount;
			const updatedUserPoint =
				await this.userPointRepository.insertOrUpdate(
					userId,
					newAmount,
				);

			await this.historyRepository.insert(
				userId,
				amount,
				TransactionType.CHARGE,
				Date.now(),
			);
			// =========== TRANSACTION END ===========

			return updatedUserPoint;
		} finally {
			release();
		}
	}

	// 사용 후 잔액 리턴
	/**
	 * 1. get user point
	 * if it's null, return error
	 * if user point < amount, return error
	 *
	 * 2. add point history
	 * 3. subtract user point
	 */
	async use(userId: number, amount: number): Promise<UserPoint> {
		const release = await this.acquire(userId);

		try {
			const userPoint = await this.userPointRepository.selectById(userId);
			if (!userPoint) {
				throw new Error('USER_NOT_FOUND');
			}
			if (userPoint.point < amount) {
				throw new Error('NOT_ENOUGH_POINT');
			}

			// =========== TRANSACTION START ===========
			const newAmount = userPoint.point - amount;
			const updatedUserPoint =
				await this.userPointRepository.insertOrUpdate(
					userId,
					newAmount,
				);

			await this.historyRepository.insert(
				userId,
				amount,
				TransactionType.USE,
				Date.now(),
			);
			// =========== TRANSACTION END ===========

			return updatedUserPoint;
		} finally {
			release();
		}
	}
}
