import { S } from "../Squaremap.js";
import L from "leaflet";

/**
 * "Diplomacy" overlay: an entry in the normal layer control checkbox list.
 * While ticked, clicking any marker that has a `nation` UUID set in its
 * marker options recolors every other nation-tagged marker based on that
 * nation's relationship to the clicked one, using data pulled from the URL
 * given in the "diplomacy" block of tiles/settings.json.
 *
 * Markers opt in individually via MarkerOptions#nation(...) - this class
 * doesn't know or care which plugin/layer produced them, it just watches
 * for any layer carrying that option as it's added to the map (see the
 * observeLayer() call from World.js#markers()).
 *
 * Towns with no nation are treated as neutral (grey).
 */
class Diplomacy {
    constructor() {
        this.enabled = false;
        this.label = "Diplomacy";
        this.dataUrl = null;
        this.colors = {
            self: "#2ecc71",
            ally: "#3498db",
            enemy: "#e74c3c",
            neutral: "#888888",
        };

        this.nations = {}; // nationUUID -> { name, allies: [...], wars: [...] }
        this.active = false; // whether the "Diplomacy" checkbox is currently ticked
        this.activeNation = null; // currently highlighted nation UUID, or null

        this.watched = new Set(); // Set<L.Layer>
        this.originalStyle = new Map(); // L.Layer -> { fillColor, color }
        this.byNation = new Map(); // nationUUID | null -> Set<L.Layer>

        // Control-only layer group: never holds real markers, just gives us
        // an on/off checkbox in the existing layer control UI.
        this.controlLayer = new L.LayerGroup();
        this.controlLayer.id = "diplomacy_control";

        this.refreshTimer = null;
    }

    /**
     * @param {object|undefined} settings - the "diplomacy" block of tiles/settings.json
     */
    configure(settings) {
        if (!settings || !settings.enabled || !settings.url) {
            this.enabled = false;
            return;
        }

        this.enabled = true;
        this.label = settings.label || this.label;
        this.dataUrl = settings.url;
        if (settings.colors) {
            Object.assign(this.colors, settings.colors);
        }

        S.layerControl.addOverlay(this.label, this.controlLayer, true);
        this.controlLayer.on("add", () => {
            this.active = true;
        });
        this.controlLayer.on("remove", () => {
            this.active = false;
            this.clearHighlight();
        });

        // Path layers don't bubble click events to the map by default, so this
        // only fires when the person clicks empty space, not a marker.
        S.map.on("click", () => this.clearHighlight());

        this.loadData();
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }
        this.refreshTimer = setInterval(() => this.loadData(), 60_000);
    }

    async loadData() {
        try {
            const res = await fetch(this.dataUrl, { cache: "no-store" });
            if (!res.ok) {
                console.warn(`[diplomacy] could not fetch ${this.dataUrl}: ${res.status}`);
                return;
            }
            const json = await res.json();
            this.nations = json.nations || {};
            if (this.activeNation) {
                this.applyHighlight(this.activeNation);
            }
        } catch (e) {
            console.error(`[diplomacy] failed to load ${this.dataUrl}`, e);
        }
    }

    /**
     * Called for every individual marker layer as it's added to the map
     * (see World.js). Accepts any path-style layer (has fillColor).
     * @param {L.Layer} layer
     */
    observeLayer(layer) {
        if (!this.enabled) return;
        if (!layer.options || layer.options.fillColor === undefined) return;

        const nation = layer.options.nation || null; // null = no nation

        this.watched.add(layer);
        this.originalStyle.set(layer, {
            fillColor: layer.options.fillColor,
            color: layer.options.color,
        });

        // Reverse index for fast special-colour application
        if (!this.byNation.has(nation)) {
            this.byNation.set(nation, new Set());
        }
        this.byNation.get(nation).add(layer);

        // Only nation-bearing markers can be clicked to start a highlight
        if (nation) {
            layer.on("click", (e) => {
                L.DomEvent.stopPropagation(e);
                if (e.originalEvent) {
                    L.DomEvent.stop(e.originalEvent);
                }
                this.onMarkerClick(nation);
            });
        }

        layer.on("remove", () => {
            this.watched.delete(layer);
            this.originalStyle.delete(layer);
            const set = this.byNation.get(nation);
            if (set) {
                set.delete(layer);
                if (set.size === 0) {
                    this.byNation.delete(nation);
                }
            }
        });

        // Layer was (re)built while a highlight was active - keep it in sync
        if (this.active && this.activeNation) {
            this.styleLayerForCurrentHighlight(layer, nation);
        }
    }

    onMarkerClick(nationUUID) {
        if (!this.active) return; // overlay checkbox is off
        if (this.activeNation === nationUUID) {
            this.clearHighlight();
        } else {
            this.applyHighlight(nationUUID);
        }
    }

    /**
     * Paint everything neutral, then only the self/ally/enemy exceptions.
     */
    applyHighlight(nationUUID) {
        this.activeNation = nationUUID;

        const neutral = this.colors.neutral;

        // 1. Everything → neutral
        for (const layer of this.watched) {
            layer.setStyle({ fillColor: neutral, color: neutral });
        }

        // 2. Build the small set of special colours
        const special = new Map();
        special.set(nationUUID, this.colors.self);

        const clicked = this.nations[nationUUID];
        if (clicked) {
            for (const ally of clicked.allies || []) {
                special.set(ally, this.colors.ally);
            }
            for (const enemy of clicked.wars || []) {
                special.set(enemy, this.colors.enemy);
            }
        }

        // 3. Apply special colours using the reverse index (fast)
        for (const [uuid, color] of special) {
            const layers = this.byNation.get(uuid);
            if (layers) {
                for (const layer of layers) {
                    layer.setStyle({ fillColor: color, color: color });
                }
            }
        }
        // Layers with nation === null (or any nation not in `special`)
        // already have the neutral colour from step 1.
    }

    /**
     * Used only when a new layer appears while a highlight is already active.
     */
    styleLayerForCurrentHighlight(layer, nation) {
        if (!this.activeNation) return;

        let color = this.colors.neutral;

        if (nation === this.activeNation) {
            color = this.colors.self;
        } else if (nation) {
            const clicked = this.nations[this.activeNation];
            if (clicked) {
                if ((clicked.allies || []).includes(nation)) {
                    color = this.colors.ally;
                } else if ((clicked.wars || []).includes(nation)) {
                    color = this.colors.enemy;
                }
            }
        }

        layer.setStyle({ fillColor: color, color: color });
    }

    clearHighlight() {
        if (!this.activeNation) return;
        this.activeNation = null;

        for (const layer of this.watched) {
            const orig = this.originalStyle.get(layer);
            if (orig) {
                layer.setStyle(orig);
            }
        }
    }
}

export const diplomacy = new Diplomacy();