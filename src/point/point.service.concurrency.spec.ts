import { Test } from '@nestjs/testing';
import { PointHistoryTable } from 'src/database/pointhistory.table';
import { UserPointTable } from 'src/database/userpoint.table';
import { PointService } from 'src/point/point.service';

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
		it('동시 충전시 정상적으로 충전된다.', async () => {
			// given
			const userId = 1;
			const amount = 100;

			// when
			const promises = [];
			promises.push(pointService.charge(userId, amount));
			promises.push(pointService.charge(userId, amount));
			promises.push(pointService.charge(userId, amount));
			promises.push(pointService.charge(userId, amount));
			promises.push(pointService.charge(userId, amount));
			await Promise.all(promises);

			// then
			const userPoint = await userPointRepository.selectById(userId);
			expect(userPoint.point).toBe(amount * 5);
		});

		// 동시 요청 중 하나가 락을 획득한 채 실패해도 자동으로 락이 해제되어 다른 요청은 정상적으로 처리된다.
		it('배타 락을 획득한 채로 에러 발생시 락이 해제된다.', async () => {
			// given
			const userId = 1;
			const amount = 100;

			// when
			jest.spyOn(
				userPointRepository,
				'insertOrUpdate',
			).mockRejectedValueOnce(new Error('DB_ERROR'));

			const promises = [];
			promises.push(pointService.charge(userId, amount));
			promises.push(pointService.charge(userId, amount));
			promises.push(pointService.charge(userId, amount));
			promises.push(pointService.charge(userId, amount));
			promises.push(pointService.charge(userId, amount));
			const result = await Promise.allSettled(promises);

			// then
			const success = result.filter((r) => r.status === 'fulfilled');
			expect(success.length).toBe(4);

			const userPoint = await userPointRepository.selectById(userId);
			expect(userPoint.point).toBe(amount * 4);

			const pointHistory =
				await pointHistoryRepository.selectAllByUserId(userId);
			expect(pointHistory).toHaveLength(4);
		});
	});

	describe('use', () => {
		it('동시 사용시 정상적으로 사용된다.', async () => {
			// given
			const userId = 1;
			const amount = 100;

			// when
			await pointService.charge(userId, amount * 4);

			const promises = [];
			promises.push(pointService.use(userId, amount));
			promises.push(pointService.use(userId, amount));
			promises.push(pointService.use(userId, amount));
			promises.push(pointService.use(userId, amount));
			promises.push(pointService.use(userId, amount));
			const result = await Promise.allSettled(promises);

			// then
			const success = result.filter((r) => r.status === 'fulfilled');
			expect(success.length).toBe(4);

			const userPoint = await userPointRepository.selectById(userId);
			expect(userPoint.point).toBe(0);

			const history =
				await pointHistoryRepository.selectAllByUserId(userId);
			expect(history).toHaveLength(5);
		});
	});
});
