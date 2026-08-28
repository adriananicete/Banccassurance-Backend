import express from 'express';
import { requireApiKey } from '../middleware/apiKey.js';
import { getUnderwritingReferrals, updateUnderwritingStatus } from '../controllers/underwritingController.js';

const router = express.Router();

router.get('/', requireApiKey, getUnderwritingReferrals);
router.put('/:id/status', requireApiKey, updateUnderwritingStatus);
export default router;