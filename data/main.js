
const debug = true;
const GPIO = (_type='out') => {

    this.state = '?'; // Currnet state: 'ON', 'OFF'
    this.pin = null; // EX.: GPIO PIN 1, 2, 3, ETC.
    this.type = _type; // 'in', 'out'
    this._enable = true // transtion state - send to device manager

    this.update = (data) => {
        if ('request' in data) {
            let req = data.request;
            if (!('property' in req)) {
                // cancel creation of object as it pertains to the wrong component type
                throw 'Invalid IO Type'; 
            }
            if ('type' in req) {
                this.type = req.type;
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
        this._enable = true;
    }

    this.disable = () => {
        this._enable = false;
    }

    this.toJson = () => {
        return {
            property: 'gpio',
            pin: this.pin,
            type: this.type,
            state: this.state,
            data: {
                command: 'enable',
                value: this._enable 
            }
        };
    }

    this.toJsonString = () => {
        return JSON.stringify(this.toJson());
    }
        
    return this;
};

const init = () => {

    _clearPageBody();

    callHome();

    init_ws();
};

/**
 * websocket
 */

window.esp32 = {
    gws: {
        connected: false,
        ws: null
    },
    gpio: null
};

const init_ws = () => {
    if (!window.esp32.gws.ws) {
        let target = "wss://" + document.location.host + '/gpio';
        printMessage("Connecting to " + target + "...");
        window.esp32.gws.ws = new WebSocket(target);
        window.esp32.gws.ws.onopen = (evt) => { onOpen(evt); }
        window.esp32.gws.ws.onclose = (evt) => { onClose(evt); }
        window.esp32.gws.ws.onmessage = (evt) => { onMessage(evt); }
        window.esp32.gws.ws.onerror = (evt) => { onError(evt); }
    }
    return window.esp32.gws;
}

const onOpen = (evt) => {
    window.esp32.gws.connected = true;
    printMessage("Socket is connected. Listening for requests...");
}

const onClose = (evt) => {
    if (window.esp32.gws.ws) {
        printMessage("onClose Event - Websocket error: " + 
            evt.code + ", reason: " + evt.reason, true);
        window.esp32.gws.connected = false;
        window.esp32.gws.ws = null;
    } else {
        printMessage("Closing socket...");
    }
}

const onMessage = (evt) => {
    printMessage('Message Received: [' + evt.data + ']');
    try {
        if (evt.data) {
            res = JSON.parse(evt.data);
            processJsonResponse(res);
        } else {
            printMessage('Error message received:', true);
            printMessage(evt);
        }
    } catch (e) {
        printMessage(e, true);
    }
}

const onError = (evt) => {
    printMessage(evt.data, true);
}

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
        if ('gpio' === req.property) {
            window.esp32.gpio.update(res.data);
            // update dom element with id gpio_state
            let state = document.getElementById('gpio_state');
            state.innerText = window.esp32.gpio.state;
            buttonOn = document.getElementById('idButtonOn');
            buttonOff = document.getElementById('idButtonOff');
            if (window.esp32.gpio.state === 'OFF') {
                buttonOn.disabled = false;
                buttonOff.disabled = true;
            } else {
                buttonOn.disabled = true;
                buttonOff.disabled = false;
            }
        }
    }
}

const sendJsonMessage = (json) => {
    init_ws();
    if (window.esp32.gws.connected) {
        printMessage('Send Request: [' + json + ']');
        window.esp32.gws.ws.send(json);
    } else {
        printMessage('sendJsonMessage error: Not Connected', true);
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

const _closeSocket = () => {
    if (window.esp32.gws.ws) {
        window.esp32.gws.ws.close();
        window.esp32.gws.connected = false;
        window.esp32.gws.ws = null;
    }
}
                
/**
 * menu options
 */

const callHome = () => {
    // clear previous content 
    _clearPageBody(); 
    // rendeer new content
    const _body = 
        '<div class="w3-bar">' +
          '<h3 class="w3-bar-item" style="color:rgb(124, 156, 206)">home</h3></a><br>' +
          '<a href="#" class="w3-bar-item w3-right"><i class="fa fa-search"></i></a>' +
        '</div>' +
        '<div class="w3-content w3-container">' +
          '<p class="w3-opacity"><b>source</b></p>' +
          '<div class="w3-panel w3-white w3-card w3-display-container">' +
          '   <span class="w3-display-topright w3-padding w3-hover-red">X</span>' +
          '  <p class="w3-text-blue"><b>visit github</b></p>' +
          '  <p>https://github.com/judesantos/iot-esp32-cpp</p>' +
          '  <p class="w3-text-blue">Clone project</p>' +
          '</div>' +
          '<p class="w3-opacity"><b>tutorial</b></p>' +
          '<div class="w3-panel w3-white w3-card w3-display-container">' +
          '  <span class="w3-display-topright w3-padding w3-hover-red">X</span>' +
          '  <p class="w3-text-blue"><b>give it a spin</b></p>' +
          '  <p>https://github.com/judesantos/iot-esp32-cpp/blob/master/README.md</p>' +
          '</div>' +
        '</div>';
    // render content
    appView.innerHTML = _body;
}

const callGpio = () => {
    // clear previous content 
    _clearPageBody(); 

    gpio = GPIO()
    gpio.pin = 2; 
    // store this object
    window.esp32.gpio = gpio;
    // set dom element id = gpio_state
    const _body = 
        '<div class="w3-bar" style="padding:none !important">' +
          '<h3 class="w3-bar-item" style="color:rgb(124, 156, 206)">gpio</h3><br>' +
        '</div>' +
        '<div class="w3-content w3-container">' +
          '<center><u>pin state</u><h1 id="gpio_state"></h1><br>' +
          '<div class="w3-cell-row">' +
          '<div class="w3-dropdown-click w3-cell" style="width:30%;background-color:none !important;">' +
              '<button class="w3-btn w3-border w3-dark-gray w3-block" onclick="pinDropdownOpen()">pin' +
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
          '<div class="w3-cell w3-border-bottom" style="width:70%">' +
              '<strong><label id="ddGpioLbl"></label></strong>' +
          '</div>' +
          '</div>' +
          '<div class="w3-cell-row">' +
          '<div class="w3-dropdown-click w3-cell" style="width:30%;background-color:none !important">' +
              '<button class="w3-btn w3-border w3-dark-gray w3-block" onclick="typeDropdownOpen()">io' +
              '<i class="fa fa-caret-down" style="float:right;padding-top:0.3em;"></i></button>' +
              '<div class="w3-dropdown-content w3-bar-block w3-border" id="ddGpioType">' +
              '  <a href="#" class="w3-bar-item w3-button" onclick="typeChanged(\'in\')">IN</a>' +
              '  <a href="#" class="w3-bar-item w3-button" onclick="typeChanged(\'out\')">OUT</a>' +
              '</div>' +
          '</div>' +
          '<div class="w3-cell w3-border-bottom" style="width:70%">' +
              '<strong><label id="ddGpioTypeLbl"></label></strong>' +
          '</div>' +
          '</div><br>' +
          '<p><button class="w3-btn w3-xlarge w3-block w3-hover-orange w3-red w3-border" id="idButtonOn" onclick="_gpioEnable(2, true);">on</button>' +
          '<p><button class="w3-btn w3-xlarge w3-block w3-hover-orange w3-dark-gray w3-border" id="idButtonOff" onclick="_gpioEnable(2, false)">off</button>' +
          '</center><p><br><hr/><p>' +
        '</div>';

    appView.innerHTML = _body;
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
        window.esp32.gpio.pin = parseInt(val);
        window.esp32.gpio.state = '?';
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
        window.esp32.gpio.type = val;
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
   _clearPageBody(); 
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
   _clearPageBody(); 
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
   _clearPageBody(); 
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
    //if (window.esp32.gpio._enable == enable)
    //    return; // ignore 
    if (enable) {
        window.esp32.gpio.enable();
    } else {
        window.esp32.gpio.disable();
    }
    sendJsonMessage(window.esp32.gpio.toJsonString());
}

const _clearPageBody = () => {
    appView.innerHTML = '';
}

// inist socket on page reload
window.addEventListener("load", init, false);

