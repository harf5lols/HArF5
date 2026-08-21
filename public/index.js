"use strict";

document.body.classList.add("loading");
let proxyReady = false;

async function waitForWasm() {
    let attempts = 0;
    while (!window.libcurl?.load_wasm && attempts < 100) {
        await new Promise(r => setTimeout(r, 50));
        attempts++;
    }
    
    if (window.libcurl?.load_wasm) {
        await window.libcurl.load_wasm();
        proxyReady = true;
        document.body.classList.remove("loading");
        document.getElementById("boot-screen")?.classList.add("hidden");
        console.log("🧬 WASM ready");

        const urlParams = new URLSearchParams(window.location.search);
        const gameUrlToLoad = urlParams.get('load');

        if (gameUrlToLoad) {
            let tabReadyAttempts = 0;
            while ((typeof activeTabId === "undefined" || !activeTabId) && tabReadyAttempts < 50) {
                await new Promise(r => setTimeout(r, 50));
                tabReadyAttempts++;
            }
            executeProxyRoute(gameUrlToLoad);
        }
    } else {
        console.error("❌ Libcurl failed to load within 5 seconds.");
        document.body.classList.remove("loading");
    }
}
waitForWasm();
const form = document.getElementById("sj-form");
const address = document.getElementById("sj-address");
const searchEngine = document.getElementById("sj-search-engine");
const error = document.getElementById("sj-error");
const errorCode = document.getElementById("sj-error-code");

const { ScramjetController } = $scramjetLoadController();
const scramjet = new ScramjetController({
    files: {
        wasm: "/scram/scramjet.wasm.wasm",
        all: "/scram/scramjet.all.js",
        sync: "/scram/scramjet.sync.js",
    },
});
scramjet.init();

const connection = new BareMux.BareMuxConnection("/baremux/worker.js");
async function executeProxyRoute(rawInputValue) {
    if (!proxyReady) return;
    
    const url = search(rawInputValue, searchEngine.value);
    
    let wispUrl = (location.protocol === "https:" ? "wss" : "ws") + "://" + location.host + "/wisp/";
    if ((await connection.getTransport()) !== "/libcurl/index.mjs") {
        await connection.setTransport("/libcurl/index.mjs", [{ websocket: wispUrl }]);
    }

    if (typeof activeTabId !== "undefined" && typeof tabs !== "undefined") {
        const activeWindow = document.getElementById('win-' + activeTabId);
        const currentTab = tabs.find(t => t.id === activeTabId);

        if (activeWindow && currentTab) {
            activeWindow.innerHTML = "";

            const frame = scramjet.createFrame();
            frame.frame.id = "sj-frame";
            activeWindow.appendChild(frame.frame);
            
            currentTab.isBrowsing = true;
            currentTab.url = url;

            const tabLabel = document.getElementById('el-' + activeTabId)?.querySelector('.tab-title');
            if (tabLabel) {
                tabLabel.textContent = rawInputValue.replace('https://', '').substring(0, 15);
            }

            frame.go(url);
            switchTab(activeTabId);
            
            window.history.replaceState({}, document.title, window.location.pathname);
            return;
        }
    }
}
form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
        await registerSW();
    } catch (err) {
        error.textContent = "Failed to register service worker.";
        errorCode.textContent = err.toString();
        throw err;
    }
    executeProxyRoute(address.value);
});
