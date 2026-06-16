// Registers Shepherd's Dog as a "linked" arcade game: the hub card opens its
// own standalone page (js/games/shepards-dog/index.html). The game keeps its
// own loop / canvas / persistence — the shell just lists and links it.
// Skipped when opened as the offline single-file build (file://), where the
// separate page is unreachable.
(function () {
  const SY = (window.SY = window.SY || {});
  if (location.protocol === 'file:') return;
  SY.registerGame({
    id: 'shepherd',
    title: "SHEPHERD'S DOG",
    blurb: 'A PASTORAL HERDING GAME · HERD THEM HOME',
    accent: '#e8a33d',
    href: 'js/games/shepards-dog/index.html',
  });
})();
