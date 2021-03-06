CAC.Map.Control = (function ($, Handlebars, cartodb, L, turf, _) {
    'use strict';

    var defaults = {
        id: 'map',
        selectors: {
            id: '#map',
            isMobile: false,
            leafletMinimizer: '.leaflet-minimize',
            leafletLayerList: '.leaflet-control-layers-list',
            leafletLayerControl: '.leaflet-control-layers',
            layerListMinimizedClass: 'minimized'
        },
        center: [39.95, -75.1667],
        zoom: 14,
    };

    var map = null;
    var currentLocationMarker = null;
    var geocodeMarker = null;
    var directionsMarkers = {
        origin: null,
        destination: null
    };

    var currentLocationMarkerOptions = {
        color: '#fff',
        opacity: 1,
        weight: 2,
        fillColor: '#3f88ef',
        fillOpacity: 1,
        radius: 6
    };

    var currentLocationMarkerHaloOptions = {
        color: '#3f88ef',
        weight: 0,
        fillColor: '#3f88ef',
        fillOpacity: 0.3,
        radius: 16
    };

    var overlaysControl = null;

    var events = $({});
    var eventNames = {
        currentLocationClick: 'cac:map:control:currentlocation',
        originMoved: 'cac:map:control:originmoved',
        destinationMoved: 'cac:map:control:destinationmoved',
        destinationPopupClick: 'cac:map:control:destinationpopup',
        mapMoved: 'cac:map:control:mapmoved'
    };
    var basemaps = {};
    var overlays = {};
    var lastDisplayPointMarker = null;

    var layerControl = null;
    var tabControl = null;
    var zoomControl = null;

    // track whether map tiles are loaded (on mobile, they're not loaded until they're in view)
    var mapLoaded = false;
    // track whether overlays and controls are loaded (separate from map because not shown on Home)
    var componentsLoaded = false; // Whether the overlays and controls are loaded

    var esriSatelliteAttribution = [
        '&copy; <a href="http://www.esri.com/">Esri</a> ',
        'Source: Esri, DigitalGlobe, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, ',
        'AEX, Getmapping, Aerogrid, IGN, IGP, swisstopo, and the GIS User Community'
    ].join('');
    var cartodbAttribution = [
        '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, ',
        '&copy; <a href="http://cartodb.com/attributions">CartoDB</a>'
    ].join('');

    function MapControl(options) {
        var self = this;

        this.events = events;
        this.eventNames = eventNames;
        this.options = $.extend({}, defaults, options);
        tabControl = this.options.tabControl;
        overlaysControl = new CAC.Map.OverlaysControl();

        this.itineraryControl = new CAC.Map.ItineraryControl({map: null});

        // only load map tiles if map visible
        if ($(this.options.selector).is(':visible')) {
            loadMap.apply(this, null);
        }

        tabControl.events.on(tabControl.eventNames.tabShown, function (event, tab) {
            if (tab === tabControl.TABS.DIRECTIONS || tab === tabControl.TABS.EXPLORE) {
                loadMap.apply(self, null);
                self.loadMapComponents();
            } else {
                self.clearMapComponents();
            }
            if (map) {
                map.invalidateSize();
            }
        });
    }

    MapControl.prototype.isLoaded = isLoaded;
    MapControl.prototype.fitToBounds = fitToBounds;
    MapControl.prototype.loadMap = loadMap;
    MapControl.prototype.setGeocodeMarker = setGeocodeMarker;
    MapControl.prototype.setDirectionsMarkers = setDirectionsMarkers;
    MapControl.prototype.clearDirectionsMarker = clearDirectionsMarker;
    MapControl.prototype.displayPoint = displayPoint;
    MapControl.prototype.clearMapComponents = clearMapComponents;
    MapControl.prototype.loadMapComponents = loadMapComponents;

    return MapControl;

    /**
     * Helper to determine if Leaflet base map has already loaded tiles.
     *
     * @returns {boolean} True if base map tiles have already been loaded
     */
    function isLoaded() {
        return mapLoaded;
    }

    /**
     * Load base map tiles and set map on associated controls.
     *
     */
    function loadMap() {
        if (mapLoaded) {
            return; // already loaded; nothing to do
        }

        map = new cartodb.L.map(this.options.id, { zoomControl: false })
                           .setView(this.options.center, this.options.zoom);

        map.on('moveend', function() {
            events.trigger(eventNames.mapMoved, map.getCenter());
        });

        tabControl = this.options.tabControl;

        // put zoom control on top right
        zoomControl = new cartodb.L.Control.Zoom({
            position: 'topright',
            zoomInText: '<i class="icon-plus"></i>',
            zoomOutText: '<i class="icon-minus"></i>'
        });

        initializeBasemaps();

        this.isochroneControl = new CAC.Map.IsochroneControl({map: map, tabControl: tabControl});
        this.itineraryControl.setMap(map);

        // bubble up destination directions click events
        this.isochroneControl.events.on(this.isochroneControl.eventNames.destinationPopupClick,
                                        function(event, place) {
                                            events.trigger(eventNames.destinationPopupClick, place);
                                        });

        if (this.options.isMobile) {
            showCurrentLocation();
        }

        mapLoaded = true;
    }

    function initializeBasemaps() {
        var retina = '';
        if (window.devicePixelRatio > 1) {
            retina = '@2x';
        }

        basemaps.Light = cartodb.L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}' + retina + '.png', {
            attribution: cartodbAttribution
        });

        basemaps.Dark = cartodb.L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}' + retina + '.png', {
            attribution: cartodbAttribution
        });

        basemaps.Satellite = cartodb.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: esriSatelliteAttribution
        });

        basemaps.Light.addTo(map);

        // In case the base layer changes after the bike routes overlay has been added,
        // make sure the bike routes overlay shows on top of the new base layer.
        map.on('baselayerchange', function() {
            if (map.hasLayer(overlays['Bike Routes'])) {
                overlays['Bike Routes'].bringToFront();
            }
        });
    }

    function initializeOverlays() {
        overlays['Bike Share Locations'] = overlaysControl.bikeShareOverlay();
        overlays['Bike Routes'] = overlaysControl.bikeRoutesOverlay(map);

        // TODO: re-enable when Uwishunu feed returns
        //overlays['Nearby Events'] = overlaysControl.nearbyEventsOverlay();
        //overlays['Nearby Events'].addTo(map);
    }

    function initializeLayerControl() {
        if (!layerControl) {
            layerControl = cartodb.L.control.layers(basemaps, overlays, {
                position: 'topright',
                collapsed: false
            });
        }

        layerControl.addTo(map);

        // Add minimize button to layer control.
        // This needs to happen after the layer control has been added to the map,
        // or else the selectors will not find it.
        var $layerContainer = $(this.options.selectors.leafletLayerControl);

        $layerContainer.prepend('<div class="leaflet-minimize minimized"><i class="icon-layers"></i></div>');

        var $minimizer = $(this.options.selectors.leafletMinimizer);
        var selectors = this.options.selectors;
        $minimizer.click(function() {
            if ($minimizer.hasClass(selectors.layerListMinimizedClass)) {
                // show again
                $(selectors.leafletLayerList).show();
                $minimizer.html('<i class="icon-layers"></i>');
                $minimizer.removeClass(selectors.layerListMinimizedClass);
            } else {
                // minimize it
                $minimizer.html('<i class="icon-layers"></i>');
                $minimizer.addClass(selectors.layerListMinimizedClass);
                $(selectors.leafletLayerList).hide();
            }
        });
    }

    function fitToBounds(bounds) {
        map.invalidateSize();
        map.fitBounds(bounds);
    }

    function setGeocodeMarker(latLng) {
        // helper for when marker dragged to new place
        function markerDrag(event) {
            var marker = event.target;
            var position = marker.getLatLng();
            var latlng = new cartodb.L.LatLng(position.lat, position.lng);
            marker.setLatLng(latlng, {draggable: true});
            map.panTo(latlng); // allow user to drag marker off map
        }

        if (latLng === null) {
            if (geocodeMarker) {
                map.removeLayer(geocodeMarker);
            }
            geocodeMarker = null;
            return;
        }
        if (geocodeMarker) {
            geocodeMarker.setLatLng(latLng);
        } else {
            var icon = L.AwesomeMarkers.icon({
                icon: 'marker-origin',
                prefix: 'icon',
                markerColor: 'green'
            });
            geocodeMarker = new cartodb.L.marker(latLng, { icon: icon, draggable: true });
            geocodeMarker.addTo(map);
            geocodeMarker.on('dragend', markerDrag);
        }
        map.panTo(latLng);
    }

    /**
     * Show markers for trip origin/destination.
     * Will unset the corresponding marker if either coordinate set is null/empty.
     *
     * @param {Array} originCoords Start point coordinates [lat, lng]
     * @param {Array} destinationCoords End point coordinates [lat, lng]
     * @param {Boolean} [zoomToFit] Zoom the view to the marker(s)
     */
    function setDirectionsMarkers(originCoords, destinationCoords, zoomToFit) {
        // helper for when origin/destination dragged to new place
        function markerDrag(event) {
            var marker = event.target;
            var position = marker.getLatLng();
            var latlng = new cartodb.L.LatLng(position.lat, position.lng);
            marker.setLatLng(latlng, {draggable: true});

            var trigger = (marker.options.isOrigin) ?
                            eventNames.originMoved : eventNames.destinationMoved;

            events.trigger(trigger, position);
        }

        // Due to time constraints, these two icon definitions were copied to cac-pages-directions.js
        // for use on the static map page there. If you change them here, change them there as well
        // Remove comment if icon definitions are abstracted elsewhere
        var originIcon = L.AwesomeMarkers.icon({
            icon: 'marker-origin',
            prefix: 'icon',
            markerColor: 'green'
        });

        var destIcon = L.AwesomeMarkers.icon({
            icon: 'marker-destination',
            prefix: 'icon',
            markerColor: 'red'
        });

        if (originCoords) {
            var origin = cartodb.L.latLng(originCoords[0], originCoords[1]);

            if (directionsMarkers.origin) {
                directionsMarkers.origin.setLatLng(origin);
            } else {
                var originOptions = {
                    icon: originIcon,
                    draggable: true,
                    isOrigin: true,
                    title: 'Drag to change origin',
                    zIndexOffset: 1001
                };
                directionsMarkers.origin = new cartodb.L.marker(origin, originOptions);
                directionsMarkers.origin.addTo(map);
                directionsMarkers.origin.on('dragend', markerDrag);
            }
        } else {
            clearDirectionsMarker('origin');
        }

        if (destinationCoords) {
            var destination = cartodb.L.latLng(destinationCoords[0], destinationCoords[1]);

            if (directionsMarkers.destination) {
                directionsMarkers.destination.setLatLng(destination);
            } else {
                var destOptions = {
                    icon: destIcon,
                    draggable: true,
                    isOrigin: false,
                    title: 'Drag to change destination',
                    zIndexOffset: 1000
                };
                directionsMarkers.destination = new cartodb.L.marker(destination, destOptions);
                directionsMarkers.destination.addTo(map);
                directionsMarkers.destination.on('dragend', markerDrag);
            }
        } else {
            clearDirectionsMarker('destination');
        }

        var markers = _.compact(_.values(directionsMarkers));
        if (zoomToFit && !_.isEmpty(markers)) {
            // zoom to fit all markers if several, or if there's only one, center on it
            if (markers.length > 1) {
                map.fitBounds(L.latLngBounds(markers), { maxZoom: defaults.zoom });
            } else {
                map.setView(markers[0].getLatLng());
            }
        }
    }

    function clearDirectionsMarker(type) {
        if (directionsMarkers[type]) {
            map.removeLayer(directionsMarkers[type]);
        }
        directionsMarkers[type] = null;
    }

    function loadMapComponents() {
        if (!componentsLoaded) {
            zoomControl.addTo(map);
            initializeOverlays();
            initializeLayerControl.apply(this, null);
            if (currentLocationMarker) {
                currentLocationMarker.addTo(map);
            }
            componentsLoaded = true;
        }
    }

    function clearMapComponents() {
        if (!map) { return; }

        if (zoomControl) {
            zoomControl.removeFrom(map);
        }
        if (layerControl) {
            layerControl.removeFrom(map);
        }
        if (currentLocationMarker) {
            map.removeLayer(currentLocationMarker);
        }

        map.removeLayer(overlays['Bike Share Locations']);
        map.removeLayer(overlays['Bike Routes']);
        overlays = {};

        clearDirectionsMarker('origin');
        clearDirectionsMarker('destination');

        if (this.itineraryControl) {
            this.itineraryControl.clearItineraries();
        }
        componentsLoaded = false;
    }

    /**
     * Displays a simple point marker on the map.
     * Currently only used while a leg of a direction is hovered over.
     *
     * Only one point can be displayed at a time.
     * If this is called without lon/lat params, the current point is removed.
     *
     * @param {Int} Longitude
     * @param {Int} Latitude
     */
    function displayPoint(lon, lat) {
        if (lon && lat) {
            var latlng = new cartodb.L.LatLng(lat, lon);
            if (!lastDisplayPointMarker) {
                lastDisplayPointMarker = new cartodb.L.CircleMarker(latlng);
                lastDisplayPointMarker.addTo(map);
            } else {
                lastDisplayPointMarker.setLatLng(latlng);
            }
        } else if (lastDisplayPointMarker) {
            map.removeLayer(lastDisplayPointMarker);
            lastDisplayPointMarker = null;
        }
    }

    /**
     * Track user location with map marker.
     */
    function showCurrentLocation() {
        map.locate({
            watch: true,
            enableHighAccuracy: true,
            maximumAge: 3000 // use cached location up to 3 seconds
        });

        map.on('locationfound', function(event) {
            if (!currentLocationMarker) {
                currentLocationMarker = new cartodb.L.LayerGroup([
                    new cartodb.L.circleMarker(event.latlng, currentLocationMarkerHaloOptions),
                    new cartodb.L.circleMarker(event.latlng, currentLocationMarkerOptions)
                ]);
            } else {
                currentLocationMarker.invoke('setLatLng', event.latlng);
            }

            if (map && componentsLoaded) {
                currentLocationMarker.addTo(map);
            }
        });

        map.on('locationerror', function(error) {
            console.error('could not get user location:');
            console.error(error);

            if (currentLocationMarker) {
                map.removeLayer(currentLocationMarker);
            }
        });
    }

})(jQuery, Handlebars, cartodb, L, turf, _);
