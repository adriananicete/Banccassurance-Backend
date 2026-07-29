import express from 'express';
import { requireApiKey } from '../middleware/apiKey.js';
import { getClosedPendingReferrals, updateUnderwritingStatus } from '../controllers/underwritingController.js';

const router = express.Router();

router.get('/', requireApiKey, getClosedPendingReferrals);
router.put('/:id/status', requireApiKey, updateUnderwritingStatus);
export default router;