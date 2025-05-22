import { Injectable } from '@nestjs/common';
import { PointHistory, TransactionType, UserPoint } from './point.model';
import { PointHistoryTable } from 'src/database/pointhistory.table';
import { UserPointTable } from 'src/database/userpoint.table';

export const MAX_POINT = 10000000;

@Injectable()
export class PointService {
	private readonly lock = new Map<number, boolean>();

	constructor(
		private readonly userPointRepository: UserPointTable,
		private readonly historyRepository: PointHistoryTable,
	) {}

	// Exclusive lock (should not read userPoint during charge)
	private async acquire(userId: number): Promise<() => void> {
		while (this.lock.has(userId)) {
			// setTimeout 완료시까지 다른 작업 수행 가능
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		this.lock.set(userId, true);
		const release = () => this.lock.delete(userId);
		return release;
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
