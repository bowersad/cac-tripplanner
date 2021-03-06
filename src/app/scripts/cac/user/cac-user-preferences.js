CAC.User.Preferences = (function(Storages, _) {
    'use strict';

    // set up local storage to track persistent notifications
    var namespace = 'cac_otp';
    var namespaceStorage = Storages.initNamespaceStorage(namespace);
    var localStorage = namespaceStorage.localStorage;


    // Initialize preference storage object.
    // All values in storages should be stringified first.
    // Setting to a falsy value will remove the object from storage;
    // if not in storage, defaults will be used as fallback.
    // Stringified undefined will remove the value from storage.
    // Preferences lives only as long as the page for which this is initialized.
    // With this setup we have the flexibility to store all or some of the parameters to local
    // storage if we decide that's valuable, and components that use these parameters don't need
    // to know the difference.
    var options = {};
    var storage = {
        set: function (pref, val) {
            if(!!val) {
                options[pref] = val;
            } else {
                delete options[pref];
            }
        },
        get: function (pref) {
            return _.has(options, pref) ? options[pref] : undefined;
        }
    };

    var defaults = {
        arriveBy: false, // depart at set time, by default
        bikeShare: false,
        bikeTriangle: 'any',
        dateTime: undefined, // explicitly list here for isDefault check
        exploreMinutes: 15,
        maxWalk: 482802, // in meters; set large, since not user-controllable
        method: 'directions',
        mode: 'TRANSIT,WALK',
        originText: '',
        destinationText: '',
        waypoints: [],
        wheelchair: false
    };

    var module = {
        isDefault: isDefault,
        getPreference: getPreference,
        setPreference: setPreference,
        setLocation: setLocation,
        clearLocation: clearLocation,
        clearSettings: clearSettings,
        sawTripOptions: sawTripOptions,
        showNeedWheelsPrompt: showNeedWheelsPrompt
    };
    return module;

    /**
     * Wipe out all user settings.
     * Helpful to reset state without forcing a page refresh.
     */
    function clearSettings() {
        options = {};
    }

    /**
     * Fetch stored setting.
     *
     * @param {String} preference Name of setting to fetch
     * @return {Object} setting found in storage, or default if none found
     */
    function getPreference(preference) {
        var val = storage.get(preference);
        if (!val || val === '') {
            val = _.has(defaults, preference) ? defaults[preference] : undefined;
        } else {
            val = JSON.parse(val);
        }
        return val;
    }

    /**
     * Save user preference to local storage (or cookie, if local storage not supported).
     *
     * @param {String} preference Name of setting to store
     * @param {Object} val Setting value to store
     */
    function setPreference(preference, val, ignoreDefault) {
        if (ignoreDefault && _.has(defaults, preference) && defaults[preference] === val) {
            delete options[preference];
            return;
        }
        storage.set(preference, JSON.stringify(val));
    }

    /**
     * Check if value has been set by user, or is a default.
     * Will return false if given preference does not exist.
     *
     * @param {String} preference Name of setting to check
     * @return {Boolean} True if getPreference will return a default value
     */
    function isDefault(preference) {
        return !_.has(options, preference) && _.has(defaults, preference);
    }

    /**
     * Convenience method to avoid having to manually set both preferences for origin and
     * destination.
     *
     * 'text' is optional and defaults to location.address if omitted
     */
    function setLocation(key, location, text) {
        setPreference(key, location);
        if (!_.isUndefined(text)) {
            setPreference(key + 'Text', text);
        } else {
            setPreference(key + 'Text', location.address);
        }
    }

    // Convenience method to clear 'origin' and 'destination'
    function clearLocation(key) {
        setPreference(key, undefined);
        setPreference(key + 'Text', undefined);
    }

    function showNeedWheelsPrompt() {
        // local storage may be undefined if cleared by user after page load
        if (localStorage && localStorage.get('sawTripOptions')) {
            return false; // user has already seen trip options
        }

        if (getPreference('mode').indexOf('BICYCLE') >= 0) {
            return true; // in bike mode and have not seen options yet
        }

        return false; // not in bike mode
    }

    function sawTripOptions() {
        localStorage.set('sawTripOptions', true);
    }

})(Storages, _);
