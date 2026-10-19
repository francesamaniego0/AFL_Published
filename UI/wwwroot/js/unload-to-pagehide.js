// Chrome no longer allows "unload" listeners, and logs a "Permissions policy violation: unload is not allowed"
// error for each one. blazor.web.js (.NET 8) still adds one, to tell the server the page has closed. "pagehide"
// fires at the same moments and is allowed, so listeners for "unload" are added as "pagehide" instead.
// Must load before blazor.web.js.
(function () {
    var add = window.addEventListener;
    var remove = window.removeEventListener;

    window.addEventListener = function (type, listener, options) {
        return add.call(this, type === 'unload' ? 'pagehide' : type, listener, options);
    };

    window.removeEventListener = function (type, listener, options) {
        return remove.call(this, type === 'unload' ? 'pagehide' : type, listener, options);
    };
})();
