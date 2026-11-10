/* site.js: the marks and charts appear as the reader reaches them: bars rise, lines draw, the highlighter and the
   red pen go on last. Nothing runs when the reader prefers reduced motion, and the page is complete without it. */
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('js');
  function styleOf(el) { return (el.getAttribute('style') || '').toUpperCase(); }
  function polyLength(p) {
    var len = 0;
    try { len = p.getTotalLength(); } catch (e) { len = 0; }
    if (!len) {
      var pts = (p.getAttribute('points') || '').trim().split(/\s+/).map(function (xy) { return xy.split(',').map(Number); });
      for (var k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    }
    return len;
  }
  document.querySelectorAll('figure.chart svg').forEach(function (svg) {
    var i = 0;
    svg.querySelectorAll('rect').forEach(function (r) {
      if (styleOf(r).indexOf('#6C8EB2') > -1) { r.classList.add('bar'); r.style.setProperty('--i', i++); }
    });
    svg.querySelectorAll('polyline').forEach(function (p) {
      if (styleOf(p).indexOf('STROKE: #1F2A44') > -1) {
        var len = polyLength(p);
        if (len) { p.classList.add('ln'); p.style.setProperty('--len', Math.ceil(len) + 2); }
      }
    });
    svg.querySelectorAll('circle').forEach(function (c) { c.classList.add('dot'); });
    svg.querySelectorAll('text').forEach(function (t) { if (styleOf(t).indexOf('CAVEAT') > -1) t.classList.add('hand'); });
  });
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  document.querySelectorAll('figure.chart, mark, .note, .circled').forEach(function (el) { io.observe(el); });
})();
