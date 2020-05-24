
const debug = true;
// ESP32 abstraction client
class ESP32MC {
    constructor() {
        this.initialized = false;
        // dynamic info
        this.temp_c;
        this.temp_f;
        this.hall;
        this.freeHeap;
        // static info
        this.mac;
        this.revision;
        this.coreFreqMhz;
        this.sdkVersion;
        this.flashSize;
        this.flashSpeedMbps;
        this.flashMode;
        this.heapSize;
    }
    update = (data) => {
        if ('response' in data) {
            let res = data.response;
            if ('temp_c' in res)
                this.temp_c = res.temp_c;
            if ('temp_f' in res)
                this.temp_f = res.temp_f;
            if ('hall' in res) 
                this.hall = res.hall;
            if ('heap_size' in res) 
                this.heapSize = res.heap_size;
            if ('free_heap' in res) 
                this.freeHeap = res.free_heap;
            if ('mac' in res)
                this.mac = res.mac;
            if ('chip_revision' in res)
                this.revision = res.chip_revision;
            if ('chip_freq_mhz' in res)
                this.coreFreqMhz = res.chip_freq_mhz;
            if ('sdk_version' in res)
                this.sdkVersion = res.sdk_version;
            if ('flash_size' in res)
                this.flashSize = res.flash_size;
            if ('flash_speed_mbps' in res)
                this.flashSpeedMbps = res.flash_speed_mbps;
            if ('flash_mode' in res) {
                this.flashMode = res.flash_mode;
                this.initialized = true;
            }
        }
    }
    toJson = () => {
        return {
            property: 'esp32',
            type: 'all', // get static and dynamic info
            temp_c: this.temp_c,
            temp_f: this.temp_f,
            hall: this.hall,
        };
    }
    toJsonString = () => {
        return JSON.stringify(this.toJson());
    }
}
// GPIO abstraction client
class GPIO {
    constructor(_type='out') {
        this.state = '?'; // Current state: 'ON', 'OFF'
        this.pin = null; // EX.: GPIO PIN 1, 2, 3, ETC.
        this.mode = _type; // 'in', 'out'
        this.pullUp = true // transtion state - send to device manager
    }
    update = (data) => {
        if ('request' in data) {
            let req = data.request;
            if (!('property' in req)) {
                // cancel creation of object as it pertains to the wrong component type
                throw 'Invalid IO Type'; 
            }
            if ('type' in req) {
                this.mode = req.type;
            }
            if ('pin' in req) {
                this.pin = req.pin;
            }
        }
        if ('response' in data) {
            let res = data.response;
            if ('state' in res) {
                this.state = res.state;
            }
        }
    }
    enable = () => {
        this.pullUp = true;
    }
    disable = () => {
        this.pullUp = false;
    }
    toJson = () => {
        return {
            property: 'gpio',
            pin: this.pin,
            type: this.type,
            state: this.state,
            pullUp: this.pullUp
        };
    }
    toJsonString = () => {
        return JSON.stringify(this.toJson());
    }
}

/**
 * websocket - return instance
 */
class WSClient {
    constructor(_topic, _fnOpen, _fnclose, _fnMessage, _fnError) {
        this.topic = _topic;
        this.fnOpen = _fnOpen;
        this.fnClose = _fnclose;
        this.fnMessage = _fnMessage;
        this.fnError = _fnError;
        this.ws = null;
        this.connected = false;
        this.closed = false; // user/app defined close, prevent auto reconnect if this is set.
    }
    send(msg) {
        DEBUG_MSG('WSClient::send(' + msg + ')');
        this.ws.send(msg);
    }
    // close socket.
    close() {
        // A closed socket is a dead socket - cleanup.
        this.destroy();
    }
    reconnect() {
        DEBUG_MSG('WSClient::reconnect - ' + this.topic);
        if (this.closed) {
            // auto-reconnect is prevented by app 
            // (e.g.: parent window of this socket not visible)
            DEBUG_MSG('WSClient::reconnect - ' + this.topic + 
                ' - socket was closed by application, cancell reconnect.');
            return; 
        }
        // reconnect on socket error only - due to connection error, or idle timeout.
        this.connected = false;
        this.connect();
    }
    connect() {
        DEBUG_MSG('WSClient::connect - ' + this.topic);
        if (null == this.ws || !this.connected) {
            this.create();
        }
    }
    destroy() {
        // release socket and reset to initial state
        if (this.ws) {
            if (!this.closed)
                this.ws.close();
            delete this.ws;
        }
        this.connected = false;
        this.closed = true;
        this.ws = null;
    }
    create() {
        // init state
        this.destroy();
        // fresh socket
        let target = "wss://" + document.location.host + '/' + this.topic;
        DEBUG_MSG("Connecting to " + target + "...");
        this.ws = new WebSocket(target);
        this.ws.onopen = (evt) => { this.fnOpen(evt); }
        this.ws.onclose = (evt) => { this.fnClose(evt); }
        this.ws.onmessage = (evt) => { this.fnMessage(evt); }
        this.ws.onerror = (evt) => { this.fnError(evt); }
        this.connected = true;
        this.closed = false;
    }
}

class ESP32 {
    constructor() {
        this.gpio = null;
        this.esp32mc = null;
        this.sessions = new Map();
    }
    prepareWS = (_topic) => {
        // connect client to the topic, disconnect all others
        this.sessions.forEach(c => {
            if (c.topic === _topic) {
                if (c.connected)
                    return;
                c.connect();
            } else {
                if (!c.connected)
                    return;
                c.close(); // disable reconnect
            }
        })
    }
    getWSClient = (_topic) => {
        return this.sessions.get(_topic);
    }
    addWSClient = (_topic, _onOpen, _onClose, _onMessage, _onError) => {
        const client = new WSClient(_topic, _onOpen, _onClose, _onMessage, _onError);
        this.sessions.set(_topic, client);
    }
};

const reconnectClient = (topic) => {
    const ctx = window.esp32;
    const client = ctx.getWSClient(topic);
    if (client) {
        client.reconnect();
    } else {
        DEBUG_MSG('reconnect error - not found!, client: ' + topic, true);
    }
}

// prepare hooks for websocket listeners
const init = () => {
    if (undefined == window.esp32) {
        // create session context
        const ctx = window.esp32 = new ESP32();
        // create wsocket for topic 'gpio'
        ctx.addWSClient(
            'gpio', 
            (evt) => { // onOpen
                DEBUG_MSG("gpio: Socket is connected. Listening for requests...");
            },
            (evt) => { // onClose
                DEBUG_MSG("gpio: onClose");
                reconnectClient('gpio');
            },
            (evt) => { // onMessage
                DEBUG_MSG('gpio: Message Received: [' + evt.data + ']');
                try {
                    if (evt.data) {
                        res = JSON.parse(evt.data);
                        processJsonResponse(res);
                    } else {
                        DEBUG_MSG('gpio: Error message received:', true);
                        DEBUG_MSG(evt);
                    }
                } catch (e) {
                    DEBUG_MSG(e, true);
                }
            },
            (e) => { // onError
                if (e.target.readyState == 3)
                    return; // disconnected before connection acquired - ignore
                DEBUG_MSG(e, true);
            }
        );
        // create socket for topic 'esp32' MC
        ctx.addWSClient(
            'esp32',
            (evt) => { // onOpen
                DEBUG_MSG("esp32: Socket is connected. Listening for requests...");
                DEBUG_MSG(evt);
            },
            (evt) => { // onClose
                DEBUG_MSG("esp32: onClose");
                reconnectClient('esp32');
            },
            (evt) => { // onMessage
                DEBUG_MSG('esp32: Message Received: [' + evt.data + ']');
                try {
                    if (evt.data) {
                        res = JSON.parse(evt.data);
                        processJsonResponse(res);
                    } else {
                        DEBUG_MSG('esp32: Error message received:', true);
                        DEBUG_MSG(evt);
                    }
                } catch (e) {
                    DEBUG_MSG(e, true);
                }
            },
            (e) => { // onError
                if (e.target.readyState == 3)
                    return; // disconnected before connection acquired - ignore
                DEBUG_MSG(e, true);
            }
        );
    }
    // clean view on reload
    _resetView();
    // load default landing page
    callHome();
};

const processJsonResponse = (res) => {
    if (0 !== res.status) {
        DEBUG_MSG(res.message, true);
        return;
    } 
    if ('data' in res && 'request' in res.data) {
        let req = res.data.request;
        if (!('property' in req)) {
            // cancel creation of object as it pertains to the wrong component type
            throw 'processJsonResponse - Invalid IO Type'; 
        }
        let ctx = window.esp32;
        if ('gpio' === req.property) {
            ctx.gpio.update(res.data);
            // window.esp32.gpio.update(res.data);
            // update dom element with id gpio_state
            let state = document.getElementById('gpio_state');
            //state.innerText = window.esp32.gpio.state;
            state.innerText = ctx.gpio.state;
            if (ctx.gpio.state === "ON") {
                state.className = 'w3-text-green';
            } else {
                state.className = 'w3-text-dark-gray';
            }
            buttonOn = document.getElementById('idButtonOn');
            buttonOff = document.getElementById('idButtonOff');
            //if (window.esp32.gpio.state === 'OFF') {
            if (ctx.gpio.state === 'OFF') {
                buttonOn.disabled = false;
                buttonOff.disabled = true;
            } else {
                buttonOn.disabled = true;
                buttonOff.disabled = false;
            }
        } else if ('esp32' === req.property) {
            ctx.esp32mc.update(res.data);
            // update dom element with id gpio_state
            let el = document.getElementById('mcTemp');
            if (el) {
                el.innerHTML = ctx.esp32mc.temp_f + ' &#176;F | ' + 
                    ctx.esp32mc.temp_c + ' &#176;C';
            }
            el = document.getElementById('mcProximity');
            if (el) {
                el.innerHTML = ctx.esp32mc.hall;
            }
            el = document.getElementById('mcFreeHeap');
            if (el) {
                el.innerHTML = parseFloat((ctx.esp32mc.freeHeap / 1000)).toFixed(2) + ' KB';
            }
            el = document.getElementById('idMemSize');
            if (el) {
                el.innerHTML = parseFloat((ctx.esp32mc.heapSize / 1000)).toFixed(2) + ' KB';
            }
            el = document.getElementById('idMacAddress');
            if (el) {
                el.innerHTML = ctx.esp32mc.mac;
            }
            el = document.getElementById('idFlashSize');
            if (el) {
                el.innerHTML = ctx.esp32mc.flashSize + ' MB';
            }
            el = document.getElementById('idFlashSpeed');
            if (el) {
                el.innerHTML = ctx.esp32mc.flashSpeedMbps + ' Mhz';
            }
            el = document.getElementById('idFlashMode');
            if (el) {
                el.innerHTML = ctx.esp32mc.flashMode;
            }
            el = document.getElementById('idRevision');
            if (el) {
                el.innerHTML = ctx.esp32mc.revision;
            }
            el = document.getElementById('idCoreFreq');
            if (el) {
                el.innerHTML = ctx.esp32mc.coreFreqMhz + ' Mhz';
            }
            el = document.getElementById('idSdkVersion');
            if (el) {
                el.innerHTML = ctx.esp32mc.sdkVersion;
            }
            if (el.innerHTML.length) {
                progressModal.stop();
            }
            // socket is now connected and we have already received dynamic 
            // updates through push updates from server. 
            // Check if static data has been requested already, if not, send explicit pull request
            if (!window.esp32.esp32mc.initialized) {
                // no static data yet, send request - only happens on page load/reload.
                sendJsonMessage(window.esp32.esp32mc.toJson());
            }
        }
    }
}

const sendJsonMessage = (json) => {
    session = window.esp32.getWSClient(json.property);
    if (session) {
        session.send(JSON.stringify(json));
    }
} 

const DEBUG_MSG = (msg, error = false) => {
    if (error) {
        console.error(msg);
    } else {
        if (!debug) 
            return;
        console.log(msg);
    }
}

/**
 * menu options
 */

const callHome = () => {
    // start window-busy overlay
    progressModal.start();
    // clear previous content 
    _resetView(); 
    // get session context
    const ctx = window.esp32;
    if (!ctx.esp32mc) {
        ctx.esp32mc = new ESP32MC();
    }
    // prepare ws - connect to server using topic 'esp32'
    ctx.prepareWS('esp32');
    // Check if we already have the section in cache. Persists on page revisit.
    if (typeof callHome._homePage !== 'undefined') {
        appView.innerHTML = callHome._homePage;
        return;
    }
    // rendeer new content
    callHome._homePage = 
        '<div class="w3-bar">' +
          '<h3 class="w3-bar-item w3-theme-indigo"><i class="fa fa-home"></i></h3></a><br>' +
          '<a href="https://www.google.com" target="_blank" class="w3-bar-item w3-right"><i class="fa fa-search"></i></a>' +
        '</div>' +
        '<ul class="w3-ul">' +
          '<li class="w3-bar">' +
          '  <i class="w3-bar-item w3-circle fa fa-thermometer-1 w3-xxlarge w3-text-green" style="margin-left:5px"></i>' +
          '  <div class="w3-bar-item">' +
          '    <span class="w3-large w3-text-gray" id="mcTemp">...</span>' +
          '  </div>' +
          '</li>' +
          '<li class="w3-bar">' +
          '  <i class="w3-bar-item w3-circle fa fa-magnet w3-xxlarge w3-text-deep-orange"></i>' +
          '  <div class="w3-bar-item">' +
          '    <span class="w3-large w3-text-gray" id="mcProximity">...</span></div>' +
          '</li>' +
          '<li class="w3-bar">' +
          '  <i class="w3-bar-item" style="margin-left:14px;margin-right:8px;padding:0px;">' +
          '  <svg xmlns="http://www.w3.org/2000/svg" height="40" viewBox="0 0 24 24" width="40"><path d="M0 0h24v24H0z" fill="none"/><path d="M15 9H9v6h6V9zm-2 4h-2v-2h2v2zm8-2V9h-2V7c0-1.1-.9-2-2-2h-2V3h-2v2h-2V3H9v2H7c-1.1 0-2 .9-2 2v2H3v2h2v2H3v2h2v2c0 1.1.9 2 2 2h2v2h2v-2h2v2h2v-2h2c1.1 0 2-.9 2-2v-2h2v-2h-2v-2h2zm-4 6H7V7h10v10z"/></svg>' +
          '  </i>' +
          '  <div class="w3-bar-item">' +
          '    <span>Heap (free)</span>' +
          '  </div>' +
          '  <div class="w3-bar-item w3-right">' +
          '    <span class="chip-info w3-text-gray" id="mcFreeHeap">...</span>' +
          '  </div>' +
          '  <div class="w3-small chip w3-right">' +
          '    <span class="w3-bar-item chip-info">Memory size</span>' +
          '    <span class="w3-bar-item chip-info w3-right w3-text-gray" id="idMemSize">...</span>' +
          '  </div>' +
          '  <div class="w3-small w3-right chip">' +
          '    <span class="w3-bar-item chip-info">Flash size</span>' +
          '    <span class="w3-bar-item chip-info w3-right w3-text-gray" id="idFlashSize">...</span>' +
          '  </div>' +
          '  <div class="w3-small w3-right chip">' +
          '    <span class="w3-bar-item chip-info">Flash freq.</span>' +
          '    <span class="w3-bar-item chip-info w3-right w3-text-gray" id="idFlashSpeed">...</span>' +
          '  </div>' +
          '  <div class="w3-small w3-right chip">' +
          '    <span class="w3-bar-item chip-info">Flash mode</span>' +
          '    <span class="w3-bar-item chip-info w3-right w3-text-gray" id="idFlashMode">...</span>' +
          '  </div>' +
          '</li>' +
          '<li class="w3-bar">' +
          '  <i class="w3-bar-item" style="margin-left:14px;margin-right:8px;padding:0px;">' +
          '  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="black" width="38px" height="38px"><path d="M22 9V7h-2V5c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-2h2v-2h-2v-2h2v-2h-2V9h2zm-4 10H4V5h14v14zM6 13h5v4H6zm6-6h4v3h-4zM6 7h5v5H6zm6 4h4v6h-4z"/><path d="M0 0h24v24H0zm0 0h24v24H0z" fill="none"/></svg>' +
          '  </i>' +
          '  <div class="w3-small w3-right chip">' +
          '    <span class="w3-bar-item chip-info">MAC</span>' +
          '    <span class="w3-bar-item chip-info w3-right w3-text-gray" id="idMacAddress">...</span>' +
          '  </div>' +
          '  <div class="w3-small w3-right chip">' +
          '    <span class="w3-bar-item chip-info">Core freq.</span>' +
          '    <span class="w3-bar-item chip-info w3-right w3-text-gray" id="idCoreFreq">...</span>' +
          '  </div>' +
          '  <div class="w3-small w3-right chip">' +
          '    <span class="w3-bar-item chip-info">Core rev.</span>' +
          '    <span class="w3-bar-item chip-info w3-right w3-text-gray" id="idRevision">...</span>' +
          '  </div>' +
          '  <div class="w3-small w3-right chip">' +
          '    <span class="w3-bar-item chip-info">SDK ver.</span>' +
          '    <span class="w3-bar-item chip-info w3-right w3-text-gray" id="idSdkVersion">...</span>' +
          '  </div>' +
          '</li>' +
          '<li class="w3-bar">' +
          '  <i class="w3-bar-item w3-circle w3-xxlarge fa fa-microchip w3-text-grey"></i>' +
          '  <div class="w3-bar-item">' +
          '    <a class="w3-text-indigo" onclick="viewESP32PinoutDiagram()">ESP32 Pinouts</a><br>' +
          '  </div>' +
          '</li>' +
          '<li class="w3-bar">' +
          '  <i class="w3-bar-item w3-circle w3-xxlarge fa fa-github w3-text-grey"></i>' +
          '  <div class="w3-bar-item">' +
          '    <a class="w3-text-indigo" target="_blank" href="https://github.com/HelTecAutomation/Heltec_ESP32">ESP32 Library</a><br>' +
          '  </div>' +
          '</li>' +
          '<li class="w3-bar">' +
          '  <i class="w3-bar-item w3-circle w3-xxlarge fa fa-github w3-text-grey"></i>' +
          '  <div class="w3-bar-item">' +
          '    <a class="w3-text-indigo" target="_blank" href="https://github.com/judesantos/iot-esp32-cpp">ESP32-WS Project</a><br>' +
          '  </div>' +
          '</li>' +
        '</ul>';
 
    // render content
    appView.innerHTML = callHome._homePage;
    // dynamically load esp32.jpg - hidden
    let elImgEsp32 = document.getElementById('idImgEsp32');
    if (!elImgEsp32) {
        elImgEsp32 = document.createElement('img');
        if (elImgEsp32) {
            elImgEsp32.setAttribute('id', 'idImgEsp32');
            elImgEsp32.style.display = 'none';
            elImgEsp32.onload = () => {
                //progressModal.stop();
            }
            elImgEsp32.src = 'https://' + document.location.host + '/esp32.jpg';
            document.body.appendChild(elImgEsp32);
        }
    }
}   

const viewESP32PinoutDiagram = () => {
    let elImgEsp32 = document.getElementById('idImgEsp32');
    if (elImgEsp32) {
        window.open(elImgEsp32.src, "_blank");
    }
}

const callGpio = () => {
    // start window-busy overlay
    progressModal.start();
    // clear previous content 
    _resetView(); 
    // create device object
    const ctx = window.esp32;
    if (!ctx.gpio) {
        ctx.gpio = new GPIO();
    }
    // prepare ws - connect to server using topic 'gpio'
    ctx.prepareWS('gpio');
    // Check if we already have the section in cache. Persists on page revisit.
    if (typeof callGpio.gpioPage !== 'undefined') {
        appView.innerHTML = callGpio.gpioPage;
        progressModal.stop();
        return;
    }
    // render content
    callGpio.gpioPage = 
        '<div class="w3-bar" style="padding:none !important">' +
          '<h3 class="w3-bar-item" style="color:rgb(124, 156, 206)">gpio</h3><br>' +
        '</div>' +
        '<div class="w3-content w3-container">' +
          '<center>' +
          '<div class="w3-card" style="width:100px;height:100px;border:1px solid #f4f4f7c4;">' +
            '<h1 class="w3-text-dark-grey" style="font-weight:600;font-size:2.5em;margin-top:22px;" id="gpio_state"></h1>'+
          '</div>' +
          '<u>pin state</u><p><br>' +
          '<div class="w3-cell-row">' +
          '<div class="w3-dropdown-click w3-cell" style="width:40%;background-color:none !important;">' +
              '<button class="w3-btn w3-border w3-theme w3-block" style="text-align:left" onclick="pinDropdownOpen()">i/o pin' +
              '<i class="fa fa-caret-down" style="float:right;padding-top:0.3em;"></i></button>' +
              '<div class="w3-dropdown-content w3-bar-block w3-border" id="ddGpioPin">' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(1);">GPIO1</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(2);">GPIO2</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(3);">GPIO3</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(4);">GPIO4</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(5);">GPIO5</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(8);">GPIO8</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(12);">GPIO12</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(13);">GPIO13</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(14);">GPIO14</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(15);">GPIO15</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(16);">GPIO16</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(17);">GPIO17</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(18);">GPIO18</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(19);">GPIO19</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(21);">GPIO21</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(22);">GPIO22</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(23);">GPIO23</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(25);">GPIO25</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(26);">GPIO26</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(27);">GPIO27</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(32);">GPIO32</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(33);">GPIO33</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(34);">GPIO34</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(35);">GPIO35</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(36);">GPIO36</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(37);">GPIO37</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(38);">GPIO38</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(39);">GPIO39</a>' +
              '</div>' +
          '</div>' +
          '<div class="w3-cell w3-border-bottom" style="width:60%">' +
              '<strong><label id="ddGpioLbl"></label></strong>' +
          '</div>' +
          '</div>' +
          '<div class="w3-cell-row">' +
          '<div class="w3-dropdown-click w3-cell" style="width:40%;background-color:none !important">' +
              '<button class="w3-btn w3-border w3-theme w3-block" style="text-align:left" onclick="typeDropdownOpen()">i/o mode' +
              '<i class="fa fa-caret-down" style="float:right;padding-top:0.3em;"></i></button>' +
              '<div class="w3-dropdown-content w3-bar-block w3-border" id="ddGpioType">' +
              '  <a href="#" class="w3-bar-item w3-button" onclick="typeChanged(\'in\')">IN</a>' +
              '  <a href="#" class="w3-bar-item w3-button" onclick="typeChanged(\'out\')">OUT</a>' +
              '</div>' +
          '</div>' +
          '<div class="w3-cell w3-border-bottom" style="width:60%">' +
              '<strong><label id="ddGpioTypeLbl"></label></strong>' +
          '</div>' +
          '</div><br>' +
          '<p><button class="w3-btn w3-xlarge w3-block w3-hover-orange w3-red w3-border" id="idButtonOn" onclick="_gpioEnable(2, true);">pull-up</button>' +
          '<p><button class="w3-btn w3-xlarge w3-block w3-hover-orange w3-theme w3-border" id="idButtonOff" onclick="_gpioEnable(2, false)">pull-down</button>' +
          '</center><p><br><hr/><p>' +
        '</div>';

    appView.innerHTML = callGpio.gpioPage;
    // set default io state
    let state = document.getElementById('gpio_state');
    if (!state) {
        throw 'DOM object "gpio_state" not found"';
        return;
    }
    state.innerText = ctx.gpio.state;
    progressModal.stop();
}

const pinChanged = (val) => {
    if (val) {
        const ctx = window.esp32;
        ctx.gpio.pin = parseInt(val);
        ctx.gpio.state = '?';
        ddGpioLbl.innerText = 'GPIO' + val;
    }
    pinDropdownClose();
}

const pinDropdownOpen = () => {
    // open select dropdown
    ddGpioPin.style.display = "block";
}
const pinDropdownClose = () => {
    // close select dropdown
    ddGpioPin.style.display = "none";
}

const typeChanged = (val) => {
    if (val) {
        const ctx = window.esp32;
        ctx.gpio.type = val;
        //window.esp32.gpio.type = val;
        ddGpioTypeLbl.innerText = val.toUpperCase();
    }
    typeDropdownClose();
}

const typeDropdownOpen = () => {
    ddGpioType.style.display = "block";
}
const typeDropdownClose = () => {
    ddGpioType.style.display = "none";
}

const callGps = () => {
    // start window-busy overlay
    progressModal.start();
    // clear previous content 
    _resetView(); 
    // get app context
    const ctx = window.esp32;
    // prepare ws - connect to server using topic 'gps'
    ctx.prepareWS('gps');
    // Check if we already have the section in cache. Persists on page revisit.
    if (typeof callGps.gpioPage !== 'undefined') {
        appView.innerHTML = callGps.gpsPage;
        progressModal.stop();
        return;
    }
    // rendeer new content
    callGps.gpsPage = 
        '<div class="w3-bar">' +
          '<h3 class="w3-bar-item" style="color:rgb(124, 156, 206)">gps</h3></a><br>' +
        '</div>' +
        '<div class="w3-content">' +
        '</div>';

    appView.innerHTML = callGps.gpsPage;
    progressModal.stop();
}

const callThermistor = () => {
    // start window-busy overlay
    progressModal.start();
    // clear previous content 
    _resetView(); 
    // get app context
    const ctx = window.esp32;
    // prepare ws - connect to server using topic 'thermistor'
    ctx.prepareWS('thermistor');
    // Check if we already have the section in cache. Persists on page revisit.
    if (typeof callThermistor.thermPage !== 'undefined') {
        appView.innerHTML = callThermistor.thermPage;
        progressModal.stop();
        return;
    }
    // rendeer new content
    callThermistor.thermPage = 
        '<div class="w3-bar">' +
          '<h3 class="w3-bar-item" style="color:rgb(124, 156, 206)">thermistor</h3></a><br>' +
        '</div>' +
        '<div class="w3-content">' +
        '</div>';

    appView.innerHTML = callThermistor.thermPage;
    progressModal.stop();
}

const callHumidity = () => {
    // start window-busy overlay
    progressModal.start();
    // clear previous content 
    _resetView(); 
    // get app context
    const ctx = window.esp32;
    // prepare ws - connect to server using topic 'humidity'
    ctx.prepareWS('humidity');
    // Check if we already have the section in cache. Persists on page revisit.
    if (typeof callHumidity.proximityPage !== 'undefined') {
        appView.innerHTML = callProximity.humidPage;
        progressModal.stop();
        return;
    }
    // rendeer new content
    callProximity.humidPage = 
        '<div class="w3-bar">' +
          '<h3 class="w3-bar-item" style="color:rgb(124, 156, 206)">proximity</h3></a><br>' +
        '</div>' +
        '<div class="w3-content">' +
        '</div>';

    appView.innerHTML = callProximity.humidPage;
    progressModal.stop();
}

const callProximity = () => {
    // start window-busy overlay
    progressModal.start();
    // clear previous content 
    _resetView(); 
    // get app context
    const ctx = window.esp32;
    // prepare ws - connect to server using topic 'proximity'
    ctx.prepareWS('proximity');
    // Check if we already have the section in cache. Persists on page revisit.
    if (typeof callProximity.proximPage !== 'undefined') {
        appView.innerHTML = callProximity.proximPage;
        progressModal.stop();
        return;
    }
    // rendeer new content
    callProximity.proximPage = 
        '<div class="w3-bar">' +
          '<h3 class="w3-bar-item" style="color:rgb(124, 156, 206)">proximity</h3></a><br>' +
        '</div>' +
        '<div class="w3-content">' +
        '</div>';

    appView.innerHTML = callProximity.proximPage;
    progressModal.stop();
}

/**
 * Utils
 */
const _gpioEnable = (pinId, enable) => {
    const ctx = window.esp32;
    if (enable) {
        ctx.gpio.enable();
    } else {
        ctx.gpio.disable();
    }
    sendJsonMessage(window.esp32.gpio.toJson());
}

const _resetView = () => {
    appView.innerHTML = '';
}

// inist socket on page reload
window.addEventListener("load", init, false);

