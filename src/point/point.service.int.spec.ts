import { Test } from '@nestjs/testing';
import { PointHistoryTable } from 'src/database/pointhistory.table';
import { UserPointTable } from 'src/database/userpoint.table';
import { MAX_POINT, PointService } from 'src/point/point.service';
import { TransactionType } from './point.model';

describe('PointService Integration Test', () => {
	let pointService: PointService;
	let userPointRepository: UserPointTable;
	let pointHistoryRepository: PointHistoryTable;

	beforeEach(async () => {
		const moduleRef = await Test.createTestingModule({
			providers: [PointService, UserPointTable, PointHistoryTable],
		}).compile();

		pointService = moduleRef.get<PointService>(PointService);
		userPointRepository = moduleRef.get<UserPointTable>(UserPointTable);
		pointHistoryRepository =
			moduleRef.get<PointHistoryTable>(PointHistoryTable);
	});

	describe('charge', () => {
		it('정상적으로 충전한다.', async () => {
			// given
			const userId = 1;
			const amount = 100;

			// when
			const userPoint = await pointService.charge(userId, amount);

			// then
			expect(userPoint.point).toBe(amount);
		});

		it('포인트가 최대 잔고를 초과하면 예외를 던진다.', async () => {
			// given
			const userId = 1;
			const amount = 100;

			// when
			jest.spyOn(userPointRepository, 'selectById').mockResolvedValue({
				id: userId,
				point: MAX_POINT - 1,
				updateMillis: Date.now(),
			});

			// then
			await expect(pointService.charge(userId, amount)).rejects.toThrow(
				'EXCEED_MAX_POINT',
			);
		});

		it('연속적으로 충전시 정상적으로 충전된다.', async () => {
			// given
			const userId = 1;
			const amount = 100;

			// when
			await pointService.charge(userId, amount);
			await pointService.charge(userId, amount);

			// then
			const userPoint = await userPointRepository.selectById(userId);
			expect(userPoint.point).toBe(amount * 2);
		});
	});

	describe('use', () => {
		it('충전을 하지 않으면 사용할 수 없다.', async () => {
			// given
			const userId = 1;
			const amount = 100;

			// when
			// then
			await expect(pointService.use(userId, amount)).rejects.toThrow(
				'NOT_ENOUGH_POINT',
			);
		});

		it('사용하려는 포인트보다 잔액이 부족하면 사용할 수 없다.', async () => {
			// given
			const userId = 1;
			const amount = 100;

			// when
			jest.spyOn(userPointRepository, 'selectById').mockResolvedValue({
				id: userId,
				point: amount - 1,
				updateMillis: Date.now(),
			});

			// then
			await expect(pointService.use(userId, amount)).rejects.toThrow(
				'NOT_ENOUGH_POINT',
			);
		});

		it('정상적으로 사용되고, 사용내역에 추가된다.', async () => {
			// given
			const userId = 1;
			const amount = 100;

			// when
			await pointService.charge(userId, amount);
			await pointService.use(userId, amount);

			// then
			const userPoint = await userPointRepository.selectById(userId);
			expect(userPoint.point).toBe(0);

			const history =
				await pointHistoryRepository.selectAllByUserId(userId);
			console.log('history', history);
			expect(history).toHaveLength(2);
			expect(history[0].type).toBe(TransactionType.CHARGE);
			expect(history[1].type).toBe(TransactionType.USE);
		});
	});
});
