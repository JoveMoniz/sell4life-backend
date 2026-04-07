export async function deleteResource(url) {
  const token = localStorage.getItem('s4l_token');

  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(text);
    throw new Error('Delete failed');
  }

  return res.json();
}
