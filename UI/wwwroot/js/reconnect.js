// Keeps the CMS usable for people who leave it open and idle.
//
// 1. Every few minutes the open page sends a tiny request to /session/ping. IIS treats it as activity, so the
//    site is not stopped for being idle while a tab is open (the connection's own heartbeat is not a request).
// 2. If the browser cannot rejoin the server (the site restarted after a deployment, or was stopped), Blazor shows
//    "could not reconnect ... Reload". Instead of waiting for someone to notice, the page reloads itself as soon
//    as the server answers again. The sign-in cookie is kept, so they land back where they were.
(function () {
    var PING_EVERY_MS = 4 * 60 * 1000;

    setInterval(function () {
        fetch('/session/ping', { cache: 'no-store', credentials: 'same-origin' }).catch(function () { /* offline: try again next time */ });
    }, PING_EVERY_MS);

    var reloading = false;
    var observer = new MutationObserver(function () {
        // the link Blazor shows only after it has given up on reconnecting
        if (reloading || !document.querySelector('#components-reconnect-modal h5 a')) return;
        reloading = true;
        observer.disconnect();

        var attempt = function () {
            fetch('', { cache: 'no-store' })
                .then(function (response) { if (response.ok) location.reload(); })
                .catch(function () { /* server still down */ });
        };
        attempt();
        setInterval(attempt, 10000);
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
