#ifndef _yt_esp32_H_
#define _yt_esp32_H_

#ifdef __cplusplus
  extern "C" {
#endif
  uint8_t temprature_sens_read();
#ifdef __cplusplus
  }
#endif

uint8_t temprature_sens_read();

namespace YT {

  /**
   * class ESP32MC
   *
   * Handle internal device information:
   *  - hall (magnetic proximity detector)
   *  - internal device temperature in F and C
   */
  class ESP32MC : public Device {
  public:
    ESP32MC(): Device("esp32") {}
    virtual ~ESP32MC() {};

    // device core temp in degrees Fahrenheit
    int32_t temperatureF() {
      return temprature_sens_read();
    }

    // device core temp in degrees Centigrade
    int32_t temperatureC() {
      return (temprature_sens_read() - 32) / 1.8;
    }

    // internal device hall sensor
    // returns relative proximity value
    // magnetic field orientation also affects value.
    double hall() {
      // get average rate
      // sampling rate @ 100 per millisecond
      long h = 0;
      for (int i=0; i<1000;i++) {
        h += hallRead();
        delayMicroseconds(100);
      }
      return (double)h/1000;
    }

    // get device info
    virtual int16_t getInfo(JsonObject& jsonRes) {
        jsonRes["response"]["temp_c"] = temperatureC();
        jsonRes["response"]["temp_f"] = temperatureF();
        jsonRes["response"]["hall"] = hall();
        jsonRes["request"]["property"] = "esp32";
        return Device::STATUS_SUCCESS;
    }

    // handle request 
    virtual int16_t handleCommand(const JsonObject& jsonReq, JsonObject& jsonRes) {
      int16_t error = STATUS_SUCCESS;
      auto mode = jsonReq["type"];
      Serial.printf("GPIO::handleCommand() - mode:%s\n", (const char*) mode);
      if (NULL != mode && 0 == strcmp(mode, "all")) {
        this->getInfo(jsonRes);
        jsonRes["request"] = jsonReq;
      } else {
        Serial.println("ESP32::handleCommand() - Error: command not found");
        error = INVALID_REQUEST_PROPERTY_NOT_FOUND;
      }
      return error;
    }

  };

}

#endif // _yt_esp32_H_