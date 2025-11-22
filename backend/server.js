import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import productsRouter from './routes/products.js';
import cartRouter from './routes/cart.js';
import ordersRouter from './routes/orders.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/api/health', (req, res)=> res.json({ ok: true, service: 'sell4life-backend' }));

app.use('/api/v1/products', productsRouter);
app.use('/api/v1/cart', cartRouter);
app.use('/api/v1/orders', ordersRouter);

app.listen(PORT, () => {
  console.log(`Sell4Life backend running on http://localhost:${PORT}`);
});
