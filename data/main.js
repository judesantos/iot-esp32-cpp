
const debug = false;
const GPIO = (_type='out') => {

    this.state = 'Unknown'; // Currnet state: 'ON', 'OFF'
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
        let target = "wss://" + document.location.host;
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
            evt.code + ", reason: " + evt.reason);
    } else {
        printMessage("<strong>Closing socket...</strong>");
    }
    if (window.esp32.gws.ws) {
        window.esp32.gws.disconnect();
        window.esp32.gws.connected = false;
        window.esp32.gws.ws = null;
    }
}

const onMessage = (evt) => {
    printMessage('Message from server: <span style="color:blue;">' + evt.data + '</span>');
    try {
        res = JSON.parse(evt.data);
        processJsonResponse(res);
    } catch (e) {
        console.error(e);
    }
}

const onError = (evt) => {
    printMessage('Error: <span style="color:red;">' + evt.data + '</span>');
}

const sendMessage = (msg) => {
    if (window.esp32.gws.connected) {
        printMessage('Message to server: <span style="color:green;">' + msg + '</span>');
        window.esp32.gws.ws.send(msg);
    }
} 

const processJsonResponse = (res) => {
    if (0 !== res.status) {
        console.error(res.message);
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
        printMessage('Message to server: <span style="color:green;">' + json + '</span>');
        window.esp32.gws.ws.send(json);
    } else {
        printMessage('Error: <span style="color:red;">sendJsonMessage error: Not Connected</span>');
    }
} 

const printMessage = (msg) => {
    if (!debug)
        return;
    let p = document.createElement('span');
    p.style.wordwrap = 'break-word';
    p.style.color = 'red';
    p.style.textalign = 'left';
    p.style.padding = '1em'
    p.style.width = '100%';
    p.innerHTML = msg;
    app_view.appendChild(p);
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
        '<h2 style="color:rgb(124, 156, 206)">GPIO Control</h2>' +
        '<div class="form-window"> ' +
            '<p>pin#:&nbsp;<select onchange="pinChanged(this.value);">' + 
            '   <option value="0">0</option>' +
            '   <option value="1">1</option>' +
            '   <option value="2" selected>2</option>' +
            '   <option value="3">3</option>' +
            '   <option value="4">4</option>' +
            '   <option value="5">5</option>' +
            '   <option value="6">6</option>' +
            '   <option value="7">7</option>' +
            '   <option value="8">8</option>' +
            '   <option value="9">9</option>' +
            '   <option value="10">10</option>' +
            '   <option value="11">11</option>' +
            '   <option value="12">12</option>' +
            '   <option value="13">13</option>' +
            '   <option value="14">14</option>' +
            '   <option value="15">15</option>' +
            '   <option value="16">16</option>' +
            '   <option value="17">17</option>' +
            '   <option value="18">18</option>' +
            '   <option value="19">19</option>' +
            '   <option value="20">20</option>' +
            '   <option value="21">21</option>' +
            '   <option value="22">22</option>' +
            '   <option value="23">23</option>' +
            '   <option value="24">24</option>' +
            '   <option value="26">26</option>' +
            '   <option value="27">27</option>' +
            '   <option value="28">28</option>' +
            '   <option value="29">29</option>' +
            '   <option value="30">30</option>' +
            '   <option value="31">31</option>' +
            '   <option value="32">32</option>' +
            '   <option value="34">34</option>' +
            '   <option value="35">35</option>' +
            '   <option value="36">36</option>' +
            '   <option value="37">37</option>' +
            '   <option value="39">39</option>' +
            '</select></p>' +
            '<p>type:&nbsp;<select onchange="typeChanged(this.value);">' + 
            '   <option value="in">IN</option>' +
            '   <option value="out" selected>OUT</option>' +
            '</select></p>' +
        '</div>' +
        '<div class="view-window">' +
        '<p>State: <strong id="gpio_state"></strong></p>' +
        '<p><button class="button" id="idButtonOn" onclick="_gpioEnable(2, true);">ON</button></p>' +
        '<p><button class="button button2" id="idButtonOff" onclick="_gpioEnable(2, false)">OFF</button></p>';
        '</div>'

    app_view.innerHTML = _body; 
    
    let state = document.getElementById('gpio_state');
    state.innerText = gpio.state;

}

const pinChanged = (val) => {
    if (val) {
        window.esp32.gpio.pin = parseInt(val);
        window.esp32.gpio.state = 'Unknown';
    }
}

const typeChanged = (val) => {
    if (val) {
        window.esp32.gpio.type = val;
    }
}

const callGps = () => {
    // clear previous content 
   _clearPageBody(); 
    // rendeer new content
}

const callThermistor = () => {
    // clear previous content 
   _clearPageBody(); 
    // rendeer new content

}

const callProximity = () => {
    // clear previous content 
   _clearPageBody(); 
    // rendeer new content

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
    app_view.innerHTML = '';
}

// inist socket on page reload
window.addEventListener("load", init, false);

