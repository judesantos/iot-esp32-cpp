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

    std::string macAddress() {
      char buf[128] = {0};
      uint64_t chipid = ESP.getEfuseMac(); // get MAC Address
      sprintf(buf, "%04x%08x", (uint16_t)(chipid >> 32), (uint32_t)(chipid)); //print High 2 bytes, then low 4 bytes
      std::string mac = std::string(buf);
      // insert ':' between pairs of chars
      for (int x = 0; x < 13;) {
        mac.insert(x = 2 + x, ":");
        ++x;
      }
      return mac;
    }

    // get device info
    virtual int16_t getInfo(JsonObject& jsonRes) {
      // core info
      jsonRes["response"]["mac"] = macAddress();
      jsonRes["response"]["chip_revision"] = ESP.getChipRevision();
      jsonRes["response"]["chip_freq_mhz"] = ESP.getCpuFreqMHz();
      jsonRes["response"]["sdk_version"] = ESP.getSdkVersion();
      // get flash chip info
      jsonRes["response"]["flash_size"] = ESP.getFlashChipSize();
      jsonRes["response"]["flash_speed_mhz"] = ESP.getFlashChipSpeed() / 1000000;
      jsonRes["response"]["flash_mode"] = ESP.getFlashChipMode();
      return Device::STATUS_SUCCESS;
    }

    virtual int16_t getStatus(JsonObject& jsonRes) {
      // get core status
      jsonRes["response"]["free_heap"] = ESP.getFreeHeap();
      jsonRes["response"]["chip_cycle_count"] = ESP.getCycleCount();
      jsonRes["response"]["temp_c"] = temperatureC();
      jsonRes["response"]["temp_f"] = temperatureF();
      jsonRes["response"]["hall"] = hall();
      jsonRes["request"]["property"] = "esp32";
      return Device::STATUS_SUCCESS;
    }

    // handle request 
    virtual int16_t handleCommand(const JsonObject& jsonReq, JsonObject& jsonRes) {
      int16_t error = STATUS_SUCCESS;
      auto type = jsonReq["type"];
      auto prop = jsonReq["property"];

      Serial.printf("GPIO::handleCommand() - property: %s, type:%s\n", 
        (const char*) prop, (const char*) type);
      
      if (NULL != type && 0 == strcmp(type, "all")) {
        this->getInfo(jsonRes);
        this->getStatus(jsonRes);
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