"use strict";

document.body.classList.add("loading");
let proxyReady = false;

async function waitForWasm() {
    let attempts = 0;
    // Stops checking after 100 tries (5 seconds) to prevent a hard lock
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
form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
        await registerSW();
    } catch (err) {
        error.textContent = "Failed to register service worker.";
        errorCode.textContent = err.toString();
        throw err;
    }

    const url = search(address.value, searchEngine.value);
    
    let wispUrl = (location.protocol === "https:" ? "wss" : "ws") + "://" + location.host + "/wisp/";
    if ((await connection.getTransport()) !== "/libcurl/index.mjs") {
        await connection.setTransport("/libcurl/index.mjs", [
            { websocket: wispUrl },
        ]);
    }

    // 🌟 THE CLEAN INJECTION: Bypass MutationObserver entirely
    if (typeof activeTabId !== "undefined" && typeof tabs !== "undefined") {
        const activeWindow = document.getElementById('win-' + activeTabId);
        const currentTab = tabs.find(t => t.id === activeTabId);

        if (activeWindow && currentTab) {
            // Clean the viewport completely to wipe any stuck loop sessions
            activeWindow.innerHTML = "";

            // Force Scramjet to natively build its iframe context directly inside the active tab
            const frame = scramjet.createFrame();
            frame.frame.id = "sj-frame";
            
            // Append it straight to the tab container right away
            activeWindow.appendChild(frame.frame);
            
            // Mark tab transitions safely
            currentTab.isBrowsing = true;
            currentTab.url = url;

            const tabLabel = document.getElementById('el-' + activeTabId)?.querySelector('.tab-title');
            if (tabLabel) {
                tabLabel.textContent = address.value;
            }

            // Launch proxy routing inside the isolated tab environment
            frame.go(url);
            switchTab(activeTabId);
            return;
        }
    }

    // Standard fallback logic
    const frame = scramjet.createFrame();
    frame.frame.id = "sj-frame";
    document.body.appendChild(frame.frame);
    frame.go(url);
});

