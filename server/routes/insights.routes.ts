import { Router } from 'express';
import { InsightsController } from '../controllers/insights.controller';
import { AllAnimeProvider } from '../providers/allanime.provider';

export function createInsightsRouter(provider: AllAnimeProvider): Router {
    const router = Router();
    const controller = new InsightsController(provider);

    router.get('/insights', controller.getWatchInsights);

    return router;
}
