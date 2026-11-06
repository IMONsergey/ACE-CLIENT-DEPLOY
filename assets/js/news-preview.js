(() => {
  const id = new URLSearchParams(window.location.search).get('article');
  if (!id) return;
  const open = () => window.ACENews?.open(id);
  if (document.fonts?.ready) document.fonts.ready.then(open);
  else open();
})();
