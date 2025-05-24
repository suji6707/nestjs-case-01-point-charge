import { PointHistoryTable } from 'src/database/pointhistory.table';
import { UserPointTable } from 'src/database/userpoint.table';
import { PointService } from 'src/point/point.service';
import { TransactionType } from './point.model';

describe('PointService', () => {
	let pointService: PointService;
	let userPointRepository: UserPointTable;
	let pointHistoryRepository: PointHistoryTable;

	beforeEach(() => {
		userPointRepository = {
			selectById: jest.fn(),
			insertOrUpdate: jest.fn(),
		} as any as UserPointTable;

		pointHistoryRepository = {
			insert: jest.fn(),
		} as any as PointHistoryTable;

		pointService = new PointService(
			userPointRepository,
			pointHistoryRepository,
		);
	});

	describe('charge', () => {
		it('레포지토리 의존성이 올바른 인자로 호출되어야 한다.', async () => {
			// given
			const userId = 1;
			const amount = 100;

			// when
			jest.spyOn(userPointRepository, 'selectById').mockResolvedValue({
				id: userId,
				point: 0,
				updateMillis: Date.now(),
			});
			jest.spyOn(userPointRepository, 'insertOrUpdate').mockResolvedValue(
				{ id: userId, point: amount, updateMillis: Date.now() },
			);
			jest.spyOn(pointHistoryRepository, 'insert').mockResolvedValue({
				id: 1,
				userId,
				amount,
				type: TransactionType.CHARGE,
				timeMillis: Date.now(),
			});

			const userPoint = await pointService.charge(userId, amount);

			// then
			expect(userPoint.point).toBe(amount);

			expect(userPointRepository.selectById).toHaveBeenCalledWith(userId);
			expect(userPointRepository.insertOrUpdate).toHaveBeenCalledWith(
				userId,
				amount,
			);
			expect(pointHistoryRepository.insert).toHaveBeenCalledWith(
				userId,
				amount,
				TransactionType.CHARGE,
				expect.any(Number),
			);

			expect(userPointRepository.selectById).toHaveBeenCalledTimes(1);
			expect(userPointRepository.insertOrUpdate).toHaveBeenCalledTimes(1);
			expect(pointHistoryRepository.insert).toHaveBeenCalledTimes(1);
		});

		it('레포지토리 의존성이 예외를 throw할 때 charge도 예외를 throw한다.', async () => {
			// given
			const userId = 1;
			const amount = 100;

			// when
			jest.spyOn(userPointRepository, 'selectById').mockRejectedValue(
				new Error('userPointRepository selectById error'),
			);

			// then
			await expect(pointService.charge(userId, amount)).rejects.toThrow(
				'userPointRepository selectById error',
			);
		});
	});

	describe('use', () => {
		it('사용하려는 포인트보다 잔액이 부족하면 에러를 반환한다.', async () => {
			// given
			const userId = 1;
			const amount = 100;

			// when
			jest.spyOn(userPointRepository, 'selectById').mockResolvedValue({
				id: userId,
				point: 0,
				updateMillis: Date.now(),
			});

			// then
			await expect(pointService.use(userId, amount)).rejects.toThrow(
				'NOT_ENOUGH_POINT',
			);
		});

		it('정상적으로 사용된다.', async () => {
			// given
			const userId = 1;
			const chargedAmount = 200;
			const useAmount = 100;

			// when - 시나리오
			// 충전 가정
			jest.spyOn(pointService, 'charge').mockResolvedValue({
				id: userId,
				point: chargedAmount,
				updateMillis: Date.now(),
			});
			// 기존 포인트 내역 = 200
			jest.spyOn(userPointRepository, 'selectById').mockResolvedValue({
				id: userId,
				point: chargedAmount,
				updateMillis: Date.now(),
			});
			// 포인트 사용 후 잔액 = 100
			jest.spyOn(userPointRepository, 'insertOrUpdate').mockResolvedValue(
				{
					id: userId,
					point: chargedAmount - useAmount,
					updateMillis: Date.now(),
				},
			);
			// 포인트 사용 내역 추가
			jest.spyOn(pointHistoryRepository, 'insert').mockResolvedValue({
				id: 2,
				userId,
				amount: useAmount,
				type: TransactionType.USE,
				timeMillis: Date.now(),
			});

			await pointService.charge(userId, useAmount);
			const userPoint = await pointService.use(userId, useAmount);

			// then
			expect(userPoint.point).toBe(chargedAmount - useAmount);

			expect(userPointRepository.selectById).toHaveBeenCalledWith(userId);
			expect(userPointRepository.insertOrUpdate).toHaveBeenCalledWith(
				userId,
				chargedAmount - useAmount,
			);
			expect(pointHistoryRepository.insert).toHaveBeenCalledWith(
				userId,
				useAmount,
				TransactionType.USE,
				expect.any(Number),
			);
		});
	});

	describe('point', () => {
		it('유저 포인트 정보가 정상적으로 조회된다.', async () => {
			// given
			const userId = 1;
			const amount = 100;

			// when
			jest.spyOn(userPointRepository, 'selectById').mockResolvedValue({
				id: userId,
				point: amount,
				updateMillis: Date.now(),
			});

			const userPoint = await pointService.getUserPoint(userId);

			// then
			expect(userPoint.point).toBe(amount);
			expect(userPointRepository.selectById).toHaveBeenCalledWith(userId);
			expect(userPointRepository.selectById).toHaveBeenCalledTimes(1);
		});
	});

	describe('point history', () => {
		it('유저 포인트 내역이 정상적으로 조회된다.', async () => {
			// given
			const userId = 1;

			// when
			jest.spyOn(
				pointHistoryRepository,
				'selectAllByUserId',
			).mockResolvedValue([
				{
					id: 1,
					userId,
					amount: 100,
					type: TransactionType.CHARGE,
					timeMillis: Date.now(),
				},
				{
					id: 2,
					userId,
					amount: 100,
					type: TransactionType.USE,
					timeMillis: Date.now(),
				},
			]);

			const pointHistory = await pointService.getUserPointHistory(userId);

			// then
			expect(pointHistory.length).toBe(2);

			expect(
				pointHistoryRepository.selectAllByUserId,
			).toHaveBeenCalledWith(userId);

			expect(
				pointHistoryRepository.selectAllByUserId,
			).toHaveBeenCalledTimes(1);
		});
	});
});
