
const debug = true;
// ESP32 abstraction client
const ESP32MC = () => {
    this.temp_c;
    this.temp_f;
    this.hall;
    this.update = (data) => {
        if ('response' in data) {
            let res = data.response;
            if ('temp_c' in res)
                this.temp_c = res.temp_c;
            if ('temp_f' in res)
                this.temp_f = res.temp_f;
            if ('hall' in res) 
                this.hall = res.hall;
        }
    }
    this.toJson = () => {
        return {
            property: 'esp32',
            temp_c: this.temp_c,
            temp_f: this.temp_f,
            hall: this.hall,
        };
    }
    this.toJsonString = () => {
        return JSON.stringify(this.toJson());
    }
    return this;
}
// GPIO abstraction client
const GPIO = (_type='out') => {
    this.state = '?'; // Current state: 'ON', 'OFF'
    this.pin = null; // EX.: GPIO PIN 1, 2, 3, ETC.
    this.mode = _type; // 'in', 'out'
    this.pullUp = true // transtion state - send to device manager
    this.update = (data) => {
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
    this.enable = () => {
        this.pullUp = true;
    }
    this.disable = () => {
        this.pullUp = false;
    }
    this.toJson = () => {
        return {
            property: 'gpio',
            pin: this.pin,
            type: this.type,
            state: this.state,
            pullUp: this.pullUp
        };
    }
    this.toJsonString = () => {
        return JSON.stringify(this.toJson());
    }
    return this;
};

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
    }
    send(msg) {
        console.log('WSClient::send(' + msg + ')');
        this.ws.send(msg);
    }
    close() {
        if (this.ws) {
            this.connected = false;
            this.ws.close();
            this.ws = null;
        }
    }
    connect() {
        console.log('WSClient::connect - ' + this.topic);
        if (null == this.ws) {
            let target = "wss://" + document.location.host + '/' + this.topic
            printMessage("Connecting to " + target + "...");
            this.ws = new WebSocket(target);
            this.ws.onopen = (evt) => { this.fnOpen(evt); }
            this.ws.onclose = (evt) => { this.fnClose(evt); }
            this.ws.onmessage = (evt) => { this.fnMessage(evt); }
            this.ws.onerror = (evt) => { this.fnError(evt); }
            this.connected = true;
        }
    }
}

const ESP32 = () => {
    this.gpio = null;
    this.esp32mc = null;
    this.sessions = new Map();
    this.prepareWS = (_topic) => {
        // connect client to the topic, disconnect all others
        this.sessions.forEach(c => {
            if (c.topic === _topic) {
                if (c.connected)
                    return;
                c.connect();
            } else {
                if (!c.connected)
                    return;
                c.close();
            }
        })
    };
    this.getWSClient = (_topic) => {
        return this.sessions.get(_topic);
    };
    this.addWSClient = (_topic, _onOpen, _onClose, _onMessage, _onError) => {
        const client = new WSClient(_topic, _onOpen, _onClose, _onMessage, _onError);
        this.sessions.set(_topic, client);
    }
    return this;
};

// prepare hooks for websocket listeners
const init = () => {
    // clean view on reload
    _resetView();
    // create session context
    const ctx = window.esp32 = ESP32();
    // create wsocket for topic 'gpio'
    ctx.addWSClient(
        'gpio', 
        (evt) => { // onOpen
            printMessage("gpio: Socket is connected. Listening for requests...");
        },
        (evt) => { // onClose
            printMessage("gpio: onClose");
        },
        (evt) => { // onMessage
            printMessage('gpio: Message Received: [' + evt.data + ']');
            try {
                if (evt.data) {
                    res = JSON.parse(evt.data);
                    processJsonResponse(res);
                } else {
                    printMessage('gpio: Error message received:', true);
                    printMessage(evt);
                }
            } catch (e) {
                printMessage(e, true);
            }
        },
        (evt) => { // onError
            printMessage(evt.data, true);
        }
    );
    // create socket for topic 'esp32' MC
    ctx.addWSClient(
        'esp32',
        (evt) => { // onOpen
            printMessage("esp32: Socket is connected. Listening for requests...");
            console.log(evt);
        },
        (evt) => { // onClose
            printMessage("esp32: onClose");
            console.log(evt);
        },
        (evt) => { // onMessage
            printMessage('esp32: Message Received: [' + evt.data + ']');
            try {
                if (evt.data) {
                    res = JSON.parse(evt.data);
                    processJsonResponse(res);
                } else {
                    printMessage('esp32: Error message received:', true);
                    printMessage(evt);
                }
            } catch (e) {
                printMessage(e, true);
            }
        },
        (evt) => { // onError
            printMessage(evt.data, true);
        }
    );
    // load default landing page
    callHome();
};

const processJsonResponse = (res) => {
    if (0 !== res.status) {
        printMessage(res.message, true);
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
            //window.esp32.esp32mc.update(res.data);
            // update dom element with id gpio_state
            let elTemp = document.getElementById('mcTemp');
            if (elTemp) {
                elTemp.innerHTML = ctx.esp32mc.temp_f + ' &#176;F / ' + 
                    ctx.esp32mc.temp_c + ' &#176;C';
                //elTemp.innerHTML = window.esp32.esp32mc.temp_f + ' &#176;F / ' + 
                //    window.esp32.esp32mc.temp_c + ' &#176;C';
            }
            let elProximity = document.getElementById('mcProximity');
            if (elProximity) {
                elProximity.innerHTML = ctx.esp32mc.hall;
                //elProximity.innerHTML = window.esp32.esp32mc.hall;
            }
        }
    }
}

const sendJsonMessage = (json) => {
    const session = window.esp32.getWSClient(json.property);
    if (session) {
        session.send(JSON.stringify(json));
    }
} 

const printMessage = (msg, error = false) => {
    if (!debug) 
        return;
    if (error) {
        console.error(msg);
    } else {
        console.log(msg);
    }
}

/**
 * menu options
 */

const callHome = () => {
    // Check if we already have the section in cache. Persists on page revisit.
    if (typeof callHome._homePage !== 'undefined') {
        appView.innerHTML = this._homePage;
        return;
    }
    progressModal.start();
    // clear previous content 
    _resetView(); 
    // store for reuse
    const ctx = window.esp32;
    if (!ctx.esp32mc) {
        ctx.esp32mc = ESP32MC();
    }
    // prepare ws - connect to server using topic 'esp32'
    ctx.prepareWS('esp32');
    // rendeer new content
    this._homePage = 
        '<div class="w3-bar">' +
          '<h3 class="w3-bar-item" style="color:rgb(124, 156, 206)"><i class="fa fa-home"></i></h3></a><br>' +
          '<a href="https://www.google.com" target="_blank" class="w3-bar-item w3-right"><i class="fa fa-search"></i></a>' +
        '</div><p>' +
        '<ul class="w3-ul w3-card">' +
          '<li class="w3-bar">' +
          '  <i class="w3-bar-item w3-circle fa fa-thermometer-1 fa-lg" style="margin-top:5px"></i>' +
          '  <div class="w3-bar-item w3-right">' +
          '    <span class="w3-large w3-text-gray" id="mcTemp"></span>' +
          '  </div>' +
          '</li>' +
          '<li class="w3-bar">' +
          '  <i class="w3-bar-item w3-circle fa fa-magnet fa-lg" style="margin-top:5px"></i>' +
          '  <div class="w3-bar-item w3-right">' +
          '    <span class="w3-large w3-text-gray" id="mcProximity"></span>' +
          '  </div>' +
          '</li>' +
        '</ul><p>' +
        '<div class="w3-card" id="imgEsp32Cont" style="display:none;">' +
          '<img id="imgEsp32" style="width:100%">' +
          '<div class="w3-content w3-container">' +
            '<p class="w3-text-blue"><a target="_blank" href="https://github.com/HelTecAutomation/Heltec_ESP32">ESP32 Library</a></p>' +
            '<p class="w3-text-blue"><a target="_blank" href="https://github.com/judesantos/iot-esp32-cpp">Controller App Repo</a></p>' +
          '</div>' +
        '</div>';
 
    // render content
    appView.innerHTML = this._homePage;
    // load esp32.jpg.
    let _imgEsp32 = document.getElementById('imgEsp32');
    let imgEsp32Cont = document.getElementById('imgEsp32Cont');
    if (!_imgEsp32.src.length) {
        _imgEsp32.onload = () => { 
            imgEsp32Cont.style.display = "block";
            progressModal.stop();
        }
        _imgEsp32.src = 'https://' + document.location.host + '/esp32.jpg';
    }
}   

const callGpio = () => {
    // Check if we already have the section in cache. Persists on page revisit.
    if (typeof callHome.gpioPage !== 'undefined') {
        appView.innerHTML = this.gpioPage;
        return;
    }
    // clear previous content 
    _resetView(); 
    // create device object
    const ctx = window.esp32;
    if (!ctx.gpio) {
        ctx.gpio = GPIO();
    }
    // prepare ws - connect to server using topic 'gpio'
    ctx.prepareWS('gpio');
    // render content
    this.gpioPage = 
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
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(6);">GPIO6</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(7);">GPIO7</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(8);">GPIO8</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(9);">GPIO9</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(10);">GPIO10</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(11);">GPIO11</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(12);">GPIO12</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(13);">GPIO13</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(14);">GPIO14</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(15);">GPIO15</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(16);">GPIO16</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(17);">GPIO17</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(18);">GPIO18</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(19);">GPIO19</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(20);">GPIO20</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(21);">GPIO21</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(22);">GPIO22</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(23);">GPIO23</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(24);">GPIO24</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(25);">GPIO25</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(26);">GPIO26</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(27);">GPIO27</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(28);">GPIO28</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(29);">GPIO29</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(30);">GPIO30</a>' +
              '<a href="#" class="w3-bar-item w3-button" onclick="pinChanged(31);">GPIO31</a>' +
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

    appView.innerHTML = this.gpioPage;
    // set default io state
    let state = document.getElementById('gpio_state');
    if (!state) {
        throw 'DOM object "gpio_state" not found"';
        return;
    }
    state.innerText = gpio.state;

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
    // clear previous content 
    _resetView(); 
    // rendeer new content
    const _body = 
        '<div class="w3-bar">' +
          '<h3 class="w3-bar-item" style="color:rgb(124, 156, 206)">gps</h3></a><br>' +
        '</div>' +
        '<div class="w3-content">' +
        '</div>';

    appView.innerHTML = _body;
}

const callThermistor = () => {
    // clear previous content 
    _resetView(); 
    // rendeer new content
    const _body = 
        '<div class="w3-bar">' +
          '<h3 class="w3-bar-item" style="color:rgb(124, 156, 206)">thermistor</h3></a><br>' +
        '</div>' +
        '<div class="w3-content">' +
        '</div>';

    appView.innerHTML = _body;
}

const callProximity = () => {
    // clear previous content 
    _resetView(); 
    // rendeer new content
    const _body = 
        '<div class="w3-bar">' +
          '<h3 class="w3-bar-item" style="color:rgb(124, 156, 206)">proximity</h3></a><br>' +
        '</div>' +
        '<div class="w3-content">' +
        '</div>';

    appView.innerHTML = _body;
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

