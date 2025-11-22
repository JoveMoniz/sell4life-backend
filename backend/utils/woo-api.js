import axios from 'axios';
import { WOO } from '../config/woo-config.js';

const store = axios.create({
  baseURL: `${WOO.url}/wp-json/wc/store/v1`,
  timeout: 10000
});

export async function fetchProducts(params = {}){
  const { data } = await store.get('/products', { params });
  return data;
}

export async function fetchProduct(id){
  const { data } = await store.get(`/products/${id}`);
  return data;
}

export async function fetchCategories(params = {}){
  const { data } = await store.get('/products/categories', { params });
  return data;
}
