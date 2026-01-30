(function () {
  const savedTheme = localStorage.getItem('selectedTheme') || 'default';
  document.documentElement.setAttribute('data-theme', savedTheme);
})();
