import { Router } from 'express';
const router = Router();
router.post('/', (req, res) => { res.status(501).json({ error: 'Not implemented yet' }); });
export default router;
