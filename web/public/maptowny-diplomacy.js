/**
 * MapTowny Diplomacy highlight script for squaremap.
 *
 * Place under your squaremap web root, e.g.:
 *   plugins/squaremap/web/maptowny-diplomacy.js
 *
 * Load it after the map UI (add a <script src="maptowny-diplomacy.js"></script>
 * in the main HTML, or inject however your modified squaremap loads extra JS).
 *
 * DIPLOMACY_URL must match config diplomacy.web-output relative to the site root.
 * Default config writes: plugins/squaremap/web/diplomacy.json → URL "diplomacy.json"
 */
(async function () {
  const DIPLOMACY_URL = 'diplomacy.json';

  const GREEN = { color: '#00c853', fillColor: '#00c853', fillOpacity: 0.45, weight: 2 };
  const BLUE  = { color: '#2979ff', fillColor: '#2979ff', fillOpacity: 0.40, weight: 2 };
  const RED   = { color: '#ff1744', fillColor: '#ff1744', fillOpacity: 0.40, weight: 2 };
  const GREY  = { color: '#9e9e9e', fillColor: '#9e9e9e', fillOpacity: 0.25, weight: 1 };

  let nations = {};
  try {
    const data = await fetch(DIPLOMACY_URL).then(function (r) { return r.json(); });
    nations = data.nations || {};
  } catch (e) {
    console.warn('[MapTowny Diplomacy] failed to load', e);
    return;
  }

  function nationUuid(layer) {
    try {
      var html = (layer.getPopup && layer.getPopup() && layer.getPopup().getContent()) || '';
      var m = /data-nation-uuid="([^"]*)"/.exec(html);
      return m ? m[1] : null;
    } catch (e) {
      return null;
    }
  }

  function styleFor(clicked, other) {
    if (!clicked || !other) return GREY;
    if (clicked === other) return GREEN;
    var n = nations[clicked];
    if (n && n.allies && n.allies.indexOf(other) !== -1) return BLUE;
    if (n && n.wars && n.wars.indexOf(other) !== -1) return RED;
    return GREY;
  }

  function collectPolygons(map) {
    var list = [];
    map.eachLayer(function (l) {
      if (typeof L !== 'undefined' && (l instanceof L.Polygon || l instanceof L.MultiPolygon)) {
        if (nationUuid(l) !== null || ((l.getPopup && l.getPopup() && l.getPopup().getContent()) || '').indexOf('infowindow') !== -1) {
          list.push(l);
        }
      }
      if (l.eachLayer) {
        l.eachLayer(function (child) {
          if (typeof L !== 'undefined' && (child instanceof L.Polygon || child instanceof L.MultiPolygon)) {
            if (nationUuid(child) !== null || ((child.getPopup && child.getPopup() && child.getPopup().getContent()) || '').indexOf('infowindow') !== -1) {
              list.push(child);
            }
          }
        });
      }
    });
    return list;
  }

  function attach(map) {
    var polygons = collectPolygons(map);
    if (!polygons.length) {
      setTimeout(function () { attach(map); }, 1000);
      return;
    }

    polygons.forEach(function (layer) {
      layer.on('click', function (e) {
        var clicked = nationUuid(e.target);
        var all = collectPolygons(map);
        all.forEach(function (other) {
          other.setStyle(styleFor(clicked, nationUuid(other)));
        });
        if (typeof L !== 'undefined' && L.DomEvent) {
          L.DomEvent.stopPropagation(e);
        }
      });
    });
    console.info('[MapTowny Diplomacy] attached to ' + polygons.length + ' polygons');
  }

  function findMap() {
    return (window.squaremap && window.squaremap.map) || window.map || null;
  }

  function tryAttach() {
    var map = findMap();
    if (map) attach(map);
    else setTimeout(tryAttach, 500);
  }
  tryAttach();
})();
