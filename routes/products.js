import { Router } from 'express';
import { fetchProducts, fetchProduct, fetchCategories } from '../utils/woo-api.js';
const router = Router();

router.get('/', async (req, res) => {
  try{ const data = await fetchProducts(req.query); res.json(data); }
  catch(err){ res.status(500).json({ error: 'Failed to fetch products', detail: err.message }); }
});

router.get('/:id', async (req, res) => {
  try{ const data = await fetchProduct(req.params.id); res.json(data); }
  catch(err){ res.status(500).json({ error: 'Failed to fetch product', detail: err.message }); }
});

router.get('/category/list', async (req, res) => {
  try{ const data = await fetchCategories(req.query); res.json(data); }
  catch(err){ res.status(500).json({ error: 'Failed to fetch categories', detail: err.message }); }
});

export default router;
