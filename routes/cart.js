import { Router } from 'express';
const router = Router();
router.get('/', (req, res) => { res.json({ items: [], items_count: 0, total: 0 }); });
export default router;
