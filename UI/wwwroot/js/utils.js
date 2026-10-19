// The API's sign-in cookies belong to the API's domain, which the browser doesn't send to this site while
// the two are on different domains. When a response carries tokens (login verify, banner select, refresh),
// hand them to this site's server so its own side of the CMS can read them too.
async function mirrorTokensToUiHost(response) {
    const tokens = [response, response && response.data, response && response.Data]
        .find(s => s && (s.accessToken || s.AccessToken));

    if (!tokens) return;

    rememberAccessTokenExpiry(tokens.accessToken || tokens.AccessToken);

    try {
        await fetch('/session/tokens', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                accessToken: tokens.accessToken || tokens.AccessToken,
                refreshToken: tokens.refreshToken || tokens.RefreshToken
            })
        });
    } catch (error) {
        console.error('mirrorTokensToUiHost', error);
    }
}

async function clearUiTokens() {
    forgetAccessTokenExpiry();

    try {
        await fetch('/session/clear', { method: 'POST', credentials: 'same-origin' });
    } catch (error) {
        console.error('clearUiTokens', error);
    }
}

// The accessToken cookie is HttpOnly, so this script can't see when it runs out. Remember the expiry
// of the last access token handed out instead, so an expired session is refreshed before a call rather
// than after it fails with a 401 (which the browser always logs to the console as an error).
const ACCESS_TOKEN_EXPIRY_KEY = 'accessTokenExpiresAt';
const ACCESS_TOKEN_EXPIRY_MARGIN_MS = 15 * 1000;

function rememberAccessTokenExpiry(accessToken) {
    try {
        const payload = JSON.parse(atob(accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (payload.exp) {
            localStorage.setItem(ACCESS_TOKEN_EXPIRY_KEY, String(payload.exp * 1000));
        }
    } catch {
        forgetAccessTokenExpiry();
    }
}

function forgetAccessTokenExpiry() {
    try {
        localStorage.removeItem(ACCESS_TOKEN_EXPIRY_KEY);
    } catch { }
}

function isAccessTokenExpired() {
    try {
        const expiresAt = Number(localStorage.getItem(ACCESS_TOKEN_EXPIRY_KEY));
        return expiresAt > 0 && Date.now() >= expiresAt - ACCESS_TOKEN_EXPIRY_MARGIN_MS;
    } catch {
        return false;
    }
}

// The API's own message when it sent one. A request that never got an answer (server down, blocked by CORS, network
// lost) has status 0 and no body, and an IIS error page isn't JSON, so neither may throw here: that would leave the
// caller's promise hanging and the page stuck.
function errorMessage(err) {
    if (!err || err.status === 0) {
        return 'Unable to reach the server. Please check your connection and try again.';
    }

    try {
        const body = JSON.parse(err.responseText);
        if (body && (body.message || body.Message)) {
            return body.message || body.Message;
        }
    } catch { }

    return err.statusText || 'Unexpected error';
}

async function invokeApiAsync(baseUrl, url, payload, httpMethod = 'POST', retry = true) {
    // Refresh up front when the access token is known to have run out. If that fails, send the call
    // anyway and let the 401 handling below decide (a sign-in call needs no token at all).
    if (retry && isAccessTokenExpired() && !(await refreshToken(baseUrl))) {
        forgetAccessTokenExpiry();
    }

    return new Promise((resolve, reject) => {
        $.ajax({
            url: baseUrl + url,
            type: httpMethod,
            xhrFields: {
                withCredentials: true
            },
            contentType: "application/json",
            data: JSON.stringify(payload),
            success: async function (response) {
                await mirrorTokensToUiHost(response);
                resolve(response);
            },
            error: async function (err) {

                // If Unauthorized → Try refresh token
                if (err.status === 401 && retry) {

                    try {
                        let refreshResult = await refreshToken(baseUrl);

                        if (refreshResult) {
                            // Retry original request once
                            let retryResult = await invokeApiAsync(baseUrl, url, payload, httpMethod, false);
                            resolve(retryResult);
                            return;
                        }
                        else {
                            await clearUiTokens();
                            window.location.href = "account/user/login";
                            return;
                        }
                    }
                    catch (error) {

                        if (error.status === 403) { //Forbidden
                            await clearUiTokens();
                            window.location.href = "account/user/login";
                            return;
                        }

                        resolve({
                            Data: null,
                            IsSuccess: false,
                            Message: errorMessage(error)
                        });
                    }

                    return;
                }

                console.log("Fetch Error", baseUrl + url, err.status, err);

                // Data stays null: callers deserialize it into their own type (a list, a DTO), and an object
                // like { status } cannot convert to a list - the exception took down the whole circuit.
                resolve({
                    Data: null,
                    IsSuccess: false,
                    Message: errorMessage(err)
                });
            }
        });
    });
}
// Calls that start together (the nav menu, the page, ApiClient) share one /Auth/refresh instead of each
// sending their own: every refresh replaces the refresh token, so parallel ones would race each other.
// Resolves to the refresh response, or null when the session can't be refreshed.
let refreshInFlight = null;

function requestRefresh(baseUrl) {
    if (!refreshInFlight) {
        refreshInFlight = new Promise((resolve) => {
            $.ajax({
                url: baseUrl + '/Auth/refresh',
                type: 'POST',
                xhrFields: {
                    withCredentials: true
                },
                success: async function (response) {
                    await mirrorTokensToUiHost(response);
                    resolve(response);
                },
                error: function () {
                    resolve(null);
                }
            });
        }).finally(() => {
            refreshInFlight = null;
        });
    }

    return refreshInFlight;
}

async function refreshToken(baseUrl) {
    const response = await requestRefresh(baseUrl);

    if (!response) return false;

    // tell Blazor auth state changed
    if (window.notifyBlazorAuth) {
        await window.notifyBlazorAuth(response.data.accessToken);
    }

    return true;
}

// A fresh access token for the server side of the CMS (ApiClient) when it has none of its own: the
// circuit's request predates sign-in, or the API's cookies never reached this site. Resolves to null
// instead of rejecting so the caller can fall back to sending the user to login.
window.getApiAccessToken = async function (baseUrl) {
    const response = await requestRefresh(baseUrl);
    return (response && response.data && response.data.accessToken) || null;
};

window.hasAccessToken = function (baseUrl) {
    return new Promise((resolve) => {
        $.ajax({
            url: baseUrl + '/Auth/has-access-token',
            type: 'GET',
            xhrFields: {
                withCredentials: true
            },
            success: function (response) {
                resolve(response === true);
            },
            error: function (err) {
                console.error('err/Auth/has-access-token', err);
                resolve(false);
            }
        });
    });
};

window.blazorExtensions = {
    ReadCookie: function (name) {
        let value = "; " + document.cookie;
        let parts = value.split("; " + name + "=");
        if (parts.length === 2) return parts.pop().split(";").shift();
        return null;
    }
};

async function getDeviceId() {
    let deviceId = localStorage.getItem("deviceId");
    if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem("deviceId", deviceId);
    }
    return deviceId;
}

async function decodeJwtAsync(token) {
    if (!token) return null;
    try {
        const base64Url = token.split('.')[1];
        if (!base64Url) return null;
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64)
            .split('')
            .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error('Invalid JWT:', e);
        return null;
    }
}


// window.registerNotifyBlazorAuth = function (dotnetHelper) {
//     window.blazorAuthHelper = dotnetHelper;
// };

// window.notifyBlazorAuth = function (accessToken) {
//     if (window.blazorAuthHelper) {
//         window.blazorAuthHelper.invokeMethodAsync('NotifyBlazorAuth', accessToken);
//     }
// };


window.registerNotifyBlazorAuth = function (dotnetHelper) {
    window.blazorAuthHelper = dotnetHelper;
};

window.unregisterNotifyBlazorAuth = function () {
    window.blazorAuthHelper = null;
};

window.notifyBlazorAuth = async function (accessToken) {
    if (!window.blazorAuthHelper) {
        return;
    }

    try {
        await window.blazorAuthHelper.invokeMethodAsync(
            'NotifyBlazorAuth',
            accessToken
        );
    }
    catch (error) {
        console.warn('Blazor auth interop is no longer available.', error);

        // Remove stale reference
        window.blazorAuthHelper = null;
    }
};


window.getClientTimeZone = () => {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
};


window.makeSortable = (dotNetHelper) => {
    const el = document.querySelector(".mud-table-body");

    if (!el) return;

    Sortable.create(el, {
        animation: 150,
        ghostClass: "dragging",
        onEnd: function (evt) {
            dotNetHelper.invokeMethodAsync("UpdateOrder", evt.oldIndex, evt.newIndex);
        }
    });
};

function startGrabbing(element) {
    element.style.cursor = "grabbing!important;";
}

function stopGrabbing(element) {
    element.style.cursor = "grab!important;";
}

function showElement(element) {
    console.log(element)
    $(element).removeClass('d-none');
}

function hideElement(element) {
    $(element).addClass('d-none');
}

window.chatScrollToBottom = (element) => {
    if (!element) return;

    element.style.overflow = "hidden";

    element.scrollTop = element.scrollHeight;

    requestAnimationFrame(() => {
        element.style.overflow = "auto";
    });
};

// Chat search: bring the current occurrence of the word into the middle of the conversation,
// like Messenger.
window.chatScrollToCurrentHit = (element) => {
    if (!element) return;

    const target = element.querySelector('mark.chat-search-hit.current');

    if (target) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
};

window.blazorGetWidth = () => window.innerWidth;

// Chat message box: Enter sends, Shift+Enter inserts a newline. This has to be a real JS
// keydown listener (not Blazor's @onkeydown:preventDefault) because Blazor Server decides
// whether to preventDefault from the PREVIOUS render, before the .NET handler for this same
// keystroke has even run - too late to stop the newline the browser is about to insert.
//
// Uses ONE delegated listener on document, bound exactly once for the page's lifetime (guarded
// by window.__chatEnterToSendBound), instead of attaching directly to the textarea. Re-render
// re-attaching per element was firing 2-3x per Enter press (MudTextField's autogrow can
// recreate/re-render the textarea, and each attempt to (re)bind on it raced with the others).
// Delegation sidesteps that entirely - there's nothing per-element to duplicate. The three chat
// pages (Maintenance/Concierge/CustomerService) are separate routes, only one ever mounted at a
// time, so a single global "which page is currently active" ref is sufficient.
window.chatEnterToSend = (wrapperSelector, dotNetRef) => {
    window.__chatEnterToSendRef = dotNetRef;
    window.__chatEnterToSendSelector = wrapperSelector;

    if (window.__chatEnterToSendBound) return;
    window.__chatEnterToSendBound = true;

    document.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" || e.shiftKey) return;
        if (!(e.target instanceof HTMLTextAreaElement)) return;
        if (!window.__chatEnterToSendSelector) return;
        if (!e.target.closest(window.__chatEnterToSendSelector)) return;

        e.preventDefault();

        if (window.__chatEnterToSendRef) {
            window.__chatEnterToSendRef.invokeMethodAsync("SendChatMessageFromJs");
        }
    });
};

window.downloadFileFromBase64 = (fileName, contentType, base64Data) => {
    const link = document.createElement("a");
    link.download = fileName;
    link.href = `data:${contentType};base64,${base64Data}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

window.playNotificationSound = () => {
    const audio = document.getElementById("notificationSound");

    if (audio) {
        audio.currentTime = 0;
        audio.play();
    }
};

window.downloadMasterFile = (data) => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(data);

    worksheet["!cols"] = [
        { wpx: 80 },   // ID
        { wpx: 200 },  // Name
        { wpx: 200 }   // Location
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, "Masterfiles");

    XLSX.writeFile(workbook, "Masterfiles_Data.xlsx");
};

window.downloadOffersImportTemplate = (data) => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(data);

    // Set all cells to Text format
    const range = XLSX.utils.decode_range(worksheet["!ref"]);

    for (let row = range.s.r; row <= range.e.r; row++) {
        for (let col = range.s.c; col <= range.e.c; col++) {
            const cellAddress = XLSX.utils.encode_cell({
                r: row,
                c: col
            });

            if (worksheet[cellAddress]) {
                worksheet[cellAddress].z = "@";
            }
        }
    }

    worksheet["!cols"] = [
        { wpx: 180 }, // title
        { wpx: 150 }, // type
        { wpx: 200 }, // outlet
        { wpx: 120 }, // phone
        { wpx: 200 }, // location_detail
        { wpx: 220 }, // link
        { wpx: 120 }, // whatsapp
        { wpx: 150 }, // facebook
        { wpx: 150 }, // instagram
        { wpx: 150 }, // snapchat
        { wpx: 150 }, // tiktok
        { wpx: 100 }, // order
        { wpx: 350 }, // description
        { wpx: 100 }, // points
        { wpx: 220 }, // photo
        { wpx: 350 }, // property_id
        { wpx: 150 }, // tenant_type
        { wpx: 150 }, // validity_from
        { wpx: 150 }  // validity_to
    ];

    XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        "Offers"
    );

    XLSX.writeFile(
        workbook,
        "Offers_Import_Template.xlsx"
    );
};

window.initOffersTableScrollbar = function () {

    const topScroll = document.getElementById("offers-top-scroll");
    const topInner = document.getElementById("offers-top-scroll-inner");
    const tableContainer = document.querySelector(
        "#offers-table .mud-table-container"
    );

    if (!topScroll || !topInner || !tableContainer) {
        return;
    }

    // Prevent duplicate initialization
    if (topScroll._offersInitialized) {
        return;
    }

    topScroll._offersInitialized = true;

    let syncing = false;

    const updateScrollbar = () => {

        const table = tableContainer.querySelector("table");

        if (!table) {
            return;
        }

        const width = Math.max(
            table.scrollWidth,
            tableContainer.scrollWidth
        );

        topInner.style.width = `${width}px`;

        // Force scrollbar to exist when table is wider
        topScroll.style.display =
            width > topScroll.clientWidth
                ? "block"
                : "none";

        // Keep both positions synchronized
        topScroll.scrollLeft = tableContainer.scrollLeft;
    };

    topScroll.addEventListener("scroll", () => {

        if (syncing) {
            return;
        }

        syncing = true;

        tableContainer.scrollLeft = topScroll.scrollLeft;

        syncing = false;
    });

    tableContainer.addEventListener("scroll", () => {

        if (syncing) {
            return;
        }

        syncing = true;

        topScroll.scrollLeft = tableContainer.scrollLeft;

        syncing = false;
    });

    const observer = new ResizeObserver(() => {
        requestAnimationFrame(updateScrollbar);
    });

    observer.observe(tableContainer);

    const table = tableContainer.querySelector("table");

    if (table) {
        observer.observe(table);
    }

    // Initial
    requestAnimationFrame(() => {
        updateScrollbar();
    });
};