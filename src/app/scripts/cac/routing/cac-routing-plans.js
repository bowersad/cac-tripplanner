CAC.Routing.Plans = (function($, L, moment, _, UserPreferences, Itinerary, Settings) {
    'use strict';

    var module = {
        planTrip: planTrip
    };

    return module;

    /**
     * Find shortest path from one point to another
     *
     * @param {array} coordsFrom The coords in lat-lng which we would like to travel from
     * @param {array} coordsTo The coords in lat-lng which we would like to travel to
     * @param {Object} moment.js date/time object for when the trip should be
     * @param {String} Modes of travel to use for this trip
     *
     * @return {promise} The promise object which - if successful - resolves to a
     *                   an object with itineraries
     */
    function planTrip(coordsFrom, coordsTo, when, extraOptions) {
        var deferred = $.Deferred();
        var urlParams = prepareParams(coordsFrom, coordsTo, when, extraOptions);
        $.ajax({
            url: Settings.routingUrl,
            type: 'GET',
            crossDomain: true,
            data: urlParams
        }).then(function(data) {
            if (data.plan) {
                var itineraries = _(data.plan.itineraries).map(function(itinerary, i) {
                    return new Itinerary(itinerary, i, data.requestParameters);
                }).value();
                deferred.resolve(itineraries);
            } else {
                deferred.reject(data.error);
            }
        }, function (error) {
            deferred.reject(error);
        });
        return deferred.promise();
    }

    /**
     * Helper function to prepare the parameter string for consumption by the OTP api
     *
     * @param {Array} coordsFrom The coords in lat-lng which we would like to travel from
     * @param {Array} coordsTo The coords in lat-lng which we would like to travel to
     * @param {Object} when Moment.js object for date/time of travel
     * @param {Object} extraOptions Other parameters to pass to OpenTripPlanner as-is
     *
     * @return {Object} Get parameters, ready for consumption
     */
    function prepareParams(coordsFrom, coordsTo, when, extraOptions) {
        var formattedOpts = {
            fromPlace: coordsFrom.join(','),
            toPlace: coordsTo.join(','),
            time: when.format('hh:mma'),
            date: when.format('MM-DD-YYYY'),
        };

        return $.extend(formattedOpts, extraOptions);
    }

})(jQuery, L, moment, _, CAC.User.Preferences, CAC.Routing.Itinerary, CAC.Settings);
