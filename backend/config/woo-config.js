


export async function fetchProducts(params = {}) {
  console.log(
    'Fetching from:',
    `${WOO.url.replace(/\/$/, '')}/wp-json/wc/store/v1/products`,
    params
  );

  try {
    const response = await axios.get(
      `${WOO.url.replace(/\/$/, '')}/wp-json/wc/store/v1/products`,
      { params }
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching products:', error.message);
    throw error;
  }
}


export const WOO = {
  url: process.env.WOO_URL || 'https://your-site.com',
  consumerKey: process.env.WOO_CONSUMER_KEY || 'ck_xxx',
  consumerSecret: process.env.WOO_CONSUMER_SECRET || 'cs_xxx',
};
