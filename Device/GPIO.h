#ifndef _yt_gpio_H_
#define _yt_gpio_H_

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
      Serial.println("Enter GPIO::handleCommand()");
      int16_t error = STATUS_SUCCESS;
      const char* command = jsonReq["data"]["command"];
      if (command) {
        bool valid = false;
        if (0 == strcmp(jsonReq["data"]["command"], "enable")) {
          int value = jsonReq["data"]["value"] == true ? 1 : 0;
          // led.value(value)
          valid = true;
        }
        Serial.printf("GPIO::handleCommand() - is command valid? '%s'\n", valid ? "yes" : "no");
        if (valid) {
          std::string gpio_state = "OFF";
          // if (1 == led.value())
          //    gpio_state = "ON";
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