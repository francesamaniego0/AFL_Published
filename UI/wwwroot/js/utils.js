async function invokeApiAsync(baseUrl, url, payload, httpMethod = 'POST', retry = true) {
    return new Promise((resolve, reject) => {
        $.ajax({
            url: baseUrl + url,
            type: httpMethod,
            xhrFields: {
                withCredentials: true
            },
            contentType: "application/json",
            data: JSON.stringify(payload),
            success: function (response) {
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
                            window.location.href = "account/user/login";
                            return;
                        }
                    }
                    catch (error) {

                        if (error.status === 403) { //Forbidden
                            window.location.href = "account/user/login";
                            return;
                        }

                        resolve({
                            Data: { status: 'Unexpected Error' },
                            IsSuccess: false,
                            Message: error
                        });
                    }

                    return;
                }

                console.log("Fetch Error", err);

                resolve({
                    Data: { status: err.status },
                    IsSuccess: false,
                    Message: JSON.parse(err.responseText).message
                });
            }
        });
    });
}
async function refreshToken(baseUrl) {
    return new Promise((resolve, reject) => {

        $.ajax({
            url: baseUrl + '/Auth/refresh',
            type: "POST",
            xhrFields: {
                withCredentials: true
            },
            success: async function (response) {

                console.log('/Auth/refresh',response);

                // tell Blazor auth state changed
                if (window.notifyBlazorAuth) {
                    await window.notifyBlazorAuth(response.data.accessToken);
                }

                resolve(true);
            },
            error: function (err) {
                console.error('err/Auth/refresh', err);
                resolve(false);
            }
        });

    });
}

window.hasAccessToken = function (baseUrl) {
    return new Promise((resolve) => {
        $.ajax({
            url: baseUrl + '/Auth/has-access-token',
            type: 'GET',
            xhrFields: {
                withCredentials: true
            },
            success: function (response) {
                console.log('/Auth/has-access-token', response);
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

window.blazorGetWidth = () => window.innerWidth;

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