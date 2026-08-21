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

    // Pulls the updated DuckDuckGo/Google search engine dynamically
    const url = search(address.value, searchEngine.value);
    
    let wispUrl = (location.protocol === "https:" ? "wss" : "ws") + "://" + location.host + "/wisp/";
    if ((await connection.getTransport()) !== "/libcurl/index.mjs") {
        await connection.setTransport("/libcurl/index.mjs", [
            { websocket: wispUrl },
        ]);
    }

    // Find our current active UI tab targets from the main HTML state
    if (typeof activeTabId !== "undefined" && typeof tabs !== "undefined") {
        const activeWindow = document.getElementById('win-' + activeTabId);
        const currentTab = tabs.find(t => t.id === activeTabId);

        if (activeWindow && currentTab) {
            // Clear out any old session inside this specific tab window container
            activeWindow.innerHTML = "";

            // Create and nest the Scramjet proxy frame inside the active tab
            const frame = scramjet.createFrame();
            frame.frame.id = "sj-frame";
            activeWindow.appendChild(frame.frame);
            
            // Mark tab layout state transitions
            currentTab.isBrowsing = true;
            currentTab.url = url;

            // Update the tab strip label to show the active browsing URL
            const tabLabel = document.getElementById('el-' + activeTabId)?.querySelector('.tab-title');
            if (tabLabel) {
                tabLabel.textContent = address.value;
            }

            // Fire request and pull the tab into absolute focus
            frame.go(url);
            switchTab(activeTabId);
            return;
        }
    }

    // Fallback behavior if the tab-system global context is missing
    const frame = scramjet.createFrame();
    frame.frame.id = "sj-frame";
    document.body.appendChild(frame.frame);
    frame.go(url);
});
