(() => {
  const token = localStorage.getItem('s4l_token');
  const role = localStorage.getItem('s4l_role');

  if (!token || role !== 'admin') {
    window.location.href = '/account/admin/signin.html';
  }
})();
