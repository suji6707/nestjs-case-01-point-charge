import { Injectable } from '@nestjs/common';
import { PointHistory, TransactionType, UserPoint } from './point.model';
import { PointHistoryTable } from 'src/database/pointhistory.table';
import { UserPointTable } from 'src/database/userpoint.table';

export const MAX_POINT = 10000000;

@Injectable()
export class PointService {
	constructor(
		private readonly userPointRepository: UserPointTable,
		private readonly historyRepository: PointHistoryTable,
	) {}

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

		await this.historyRepository.insert(
			userId,
			amount,
			TransactionType.CHARGE,
			Date.now(),
		);

		const newAmount = userPoint.point + amount;
		const updatedUserPoint = await this.userPointRepository.insertOrUpdate(
			userId,
			newAmount,
		);

		return updatedUserPoint;
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
		const userPoint = await this.userPointRepository.selectById(userId);
		if (!userPoint) {
			throw new Error('USER_NOT_FOUND');
		}
		if (userPoint.point < amount) {
			throw new Error('NOT_ENOUGH_POINT');
		}

		await this.historyRepository.insert(
			userId,
			amount,
			TransactionType.USE,
			Date.now(),
		);

		const newAmount = userPoint.point - amount;
		const updatedUserPoint = await this.userPointRepository.insertOrUpdate(
			userId,
			newAmount,
		);

		return updatedUserPoint;
	}
}
