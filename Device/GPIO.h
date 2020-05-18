#ifndef _yt_gpio_H_
#define _yt_gpio_H_

#include <Arduino.h>
#include "Device.h"

namespace YT {

  class GPIO : public Device {
  public:
    GPIO(): Device("gpio") {}
    virtual ~GPIO() {} 
    /**
    * Implements Abstract method Device::handleCommand()
    */
    virtual int16_t handleCommand(const JsonObject& jsonReq, JsonObject& jsonRes) {
      int16_t error = STATUS_SUCCESS;
      auto mode = jsonReq["type"];
      auto pin = jsonReq["pin"];
      auto pullUp = jsonReq["pullUp"];
      Serial.printf("GPIO::handleCommand() - pin: %d, mode:%s, pullUp: %d\n", 
        (int)pin, (const char*) mode, (bool) pullUp);
      if (NULL != mode && NULL != pullUp && NULL != pin) {
        bool valid = false;
        // send request to device now!
        pinMode(pin, (const char*)(mode) == "in" ? INPUT : OUTPUT);  // set IO direction
        digitalWrite((int)pin, (bool)pullUp ? HIGH : LOW); // set value 
        // get new value from device
        bool _devValue = digitalRead((int)pin) > 0 ? true : false;
        Serial.printf("GPIO::handleCommand() - digitalRead: '%d'\n", _devValue);
        // verify if same as the input value
        if (_devValue == (bool)pullUp) {
          valid = true;
        }
        if (valid) {
          std::string gpio_state = "OFF";
          if (bool(pullUp)) {
            gpio_state = "ON";
          }
          jsonRes["response"]["state"] = gpio_state;
        } else {
          error = INVALID_COMMAND;
          jsonRes["error"] = "IO Command not recognized";
        }
        jsonRes["request"] = jsonReq;
      } else {
        Serial.println("GPIO::handleCommand() - Error: command not found");
        error = INVALID_REQUEST_PROPERTY_NOT_FOUND;
      }
      return error;
    }

  };

}

#endif // _yt_gpio_H_