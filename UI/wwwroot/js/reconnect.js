// Keeps the CMS usable for people who leave it open and idle.
//
// 1. Every few minutes the open page sends a tiny request to /session/ping. IIS treats it as activity, so the
//    site is not stopped for being idle while a tab is open (the connection's own heartbeat is not a request).
// 2. Reconnecting stays out of the way. App.razor puts its own #components-reconnect-modal on the page, so Blazor
//    shows no "Attempting to reconnect" overlay and only sets a class on that element (app.css shows it as a
//    small "Reconnecting…" hint):
//      components-reconnect-show     - retrying on its own; nothing to do
//      components-reconnect-failed   - gave up retrying; keep retrying here until the server answers
//      components-reconnect-rejected - the server answered but no longer has this page's session (restart,
//                                      deployment, or idle too long); reload. The sign-in cookie is kept, so
//                                      they land back where they were.
(function () {
    var PING_EVERY_MS = 4 * 60 * 1000;
    var RETRY_EVERY_MS = 5000;

    setInterval(function () {
        fetch('/session/ping', { cache: 'no-store', credentials: 'same-origin' }).catch(function () { /* offline: try again next time */ });
    }, PING_EVERY_MS);

    var modal = document.getElementById('components-reconnect-modal');
    if (!modal) return;

    var reloading = false;
    var retryTimer = null;

    function reload() {
        if (reloading) return;
        reloading = true;
        location.reload();
    }

    function stopRetrying() {
        if (retryTimer) {
            clearInterval(retryTimer);
            retryTimer = null;
        }
    }

    function retry() {
        // wait for the server to answer before asking Blazor to rejoin, so a server that is still down
        // doesn't use up attempts
        fetch('', { cache: 'no-store', credentials: 'same-origin' })
            .then(function (response) {
                if (!response.ok) return;
                return Blazor.reconnect().then(function (rejoined) {
                    if (rejoined) stopRetrying();
                    else reload();
                });
            })
            .catch(function () { /* server still down */ });
    }

    new MutationObserver(function () {
        var classes = modal.classList;

        if (classes.contains('components-reconnect-rejected')) {
            stopRetrying();
            reload();
        } else if (classes.contains('components-reconnect-failed')) {
            if (!retryTimer) {
                retry();
                retryTimer = setInterval(retry, RETRY_EVERY_MS);
            }
        } else if (classes.contains('components-reconnect-hide')) {
            stopRetrying();
        }
    }).observe(modal, { attributes: true, attributeFilter: ['class'] });
})();
